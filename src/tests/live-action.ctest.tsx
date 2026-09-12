import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RestTimer } from "@/components/session/RestTimer";
import { ProgressionSummary } from "@/components/session/ProgressionSummary";
import { SessionDebrief } from "@/components/coach/SessionDebrief";
import FinishSessionPage from "@/app/(app)/sessions/new/[templateId]/finish/page";
import { useSessionStore } from "@/stores/sessionStore";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useParams: () => ({ templateId: "template" }), useRouter: () => ({ replace }) }));
vi.mock("@/components/session/serie-en-vol", () => ({ pousserSerie: vi.fn(), retirerSerieEnVol: vi.fn(), revisionSuivante: () => Date.now() }));

beforeEach(() => { replace.mockReset(); useSessionStore.setState({ active: null }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("le bilan demande une référence hors séance courante et montre la première mesure sans faux delta", async () => {
  const fetcher = vi.fn(async (url: string) => ({ ok: true, json: async () => url.startsWith("/api/exercise-instances") ? [{ id: "row", nom: "Row", natureCharge: "resistance" }] : null }));
  vi.stubGlobal("fetch", fetcher);
  render(<ProgressionSummary sets={[{ exerciseInstanceId: "row", charge: 20, repsEffectuees: 8, rpeEffectif: 7 }]} templateId="template" sessionLogId="session-test" />);
  expect(await screen.findByText("Baseline enregistrée")).toBeVisible();
  expect(screen.queryByText("stable")).not.toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledWith("/api/set-logs/last-session?exerciseInstanceId=row&excludeSessionId=session-test");
});

describe("repos : la durée suit le départ mémorisé", () => {
  it("reprend l'horloge et ajoute 30 s sans repartir de zéro", async () => {
    vi.useFakeTimers(); vi.setSystemTime(100_000);
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frame = callback; return 1; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const callbacks = { onComplete: vi.fn(), onSkip: vi.fn(), onExtend: vi.fn() };
    const { rerender } = render(<RestTimer durationSeconds={60} startedAt={90_000} {...callbacks} />);
    act(() => { frame?.(0); });
    expect(screen.getByText("50")).toBeVisible();
    rerender(<RestTimer durationSeconds={90} startedAt={90_000} {...callbacks} />);
    act(() => { frame?.(0); });
    expect(screen.getByText("1:20")).toBeVisible();
    expect(callbacks.onComplete).not.toHaveBeenCalled();
  });
  it("annonce la suite et ne répète pas le signal quand le repos est atteint", async () => {
    vi.useFakeTimers(); vi.setSystemTime(100_000);
    const onComplete = vi.fn();
    render(<RestTimer durationSeconds={5} startedAt={90_000} exerciceTermine="Row" prochaine="Curl · Série 1" onComplete={onComplete} onSkip={() => {}} onExtend={() => {}} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.getByText("Exercice terminé · repos")).toBeVisible();
    expect(screen.getByText("Curl · Série 1")).toBeVisible();
    expect(screen.getByRole("button", { name: "Continuer" })).toBeVisible();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

it("le débrief complet reste disponible derrière le résumé, sans génération automatique", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ debrief: { contenu: "Premier repère mesuré.\n\nDétail des séries et de la récupération.", genereLe: "2026-09-12", modele: null, perime: false } }) });
  vi.stubGlobal("fetch", fetcher);
  render(<SessionDebrief sessionLogId="test" />);
  expect(await screen.findByText("Premier repère mesuré.")).toBeVisible();
  await userEvent.click(screen.getByText("Voir l’analyse complète du Coach"));
  expect(screen.getByText(/Détail des séries/)).toBeVisible();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith("/api/sessions/test/debrief");
});

it("le bilan retrouve la note et l'énergie saisies après démontage et restauration", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
  useSessionStore.getState().start({ id: "session-test", seanceTemplateId: "template", gymId: "gym" });
  useSessionStore.getState().upsertSet({ exerciseInstanceId: "row", numeroSerie: 1, charge: 20, repsEffectuees: 8, rpeEffectif: 7 });
  const user = userEvent.setup();
  const rendu = render(<FinishSessionPage />);
  await user.click(screen.getByRole("radio", { name: "7 sur 10" }));
  await user.click(screen.getByRole("button", { name: /Ajouter une note/ }));
  await user.type(screen.getByRole("textbox"), "Recette fictive");
  rendu.unmount();
  await act(async () => { await useSessionStore.persist.rehydrate(); });
  render(<FinishSessionPage />);
  expect(screen.getByRole("radio", { name: "7 sur 10" })).toBeChecked();
  await user.click(screen.getByRole("button", { name: /Ajouter une note/ }));
  expect(screen.getByRole("textbox")).toHaveValue("Recette fictive");
  expect(replace).not.toHaveBeenCalled();
});

it("la clôture conserve les séries après échec, bloque le double clic et permet de réessayer", async () => {
  const user = userEvent.setup();
  useSessionStore.getState().start({ id: "session-test", seanceTemplateId: "template", gymId: "gym" });
  useSessionStore.getState().upsertSet({ exerciseInstanceId: "row", numeroSerie: 1, charge: 20, repsEffectuees: 8, rpeEffectif: 7 });
  let tentatives = 0;
  const fetcher = vi.fn(async (url: string) => {
    if (url.startsWith("/api/session-logs/")) { tentatives++; return { ok: tentatives > 1 }; }
    return { ok: true, json: async () => url.startsWith("/api/exercise-instances") ? [{ id: "row", nom: "Row", natureCharge: "resistance" }] : null };
  });
  vi.stubGlobal("fetch", fetcher);
  render(<FinishSessionPage />);
  await user.click(screen.getByRole("button", { name: "Enregistrer la séance" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Tes séries sont conservées");
  expect(useSessionStore.getState().active?.sets).toHaveLength(1);
  expect(replace).not.toHaveBeenCalled();
  await user.dblClick(screen.getByRole("button", { name: "Réessayer l’enregistrement" }));
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/sessions/session-test"));
  expect(tentatives).toBe(2);
  expect(useSessionStore.getState().active).toBeNull();
});

it("compacte le bilan sans rendre les autres baselines inaccessibles", async () => {
  const instances = ["Row", "Curl", "Squat"].map((nom) => ({ id: nom, nom, natureCharge: "resistance" }));
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => url.startsWith("/api/exercise-instances") ? instances : null })));
  render(<ProgressionSummary sets={instances.map((i) => ({ exerciseInstanceId: i.id, charge: 20, repsEffectuees: 8, rpeEffectif: 7 }))} templateId="template" sessionLogId="session-test" />);
  await screen.findByText("Row");
  expect(screen.getByText("Curl")).toBeVisible();
  expect(screen.getByText("Squat")).not.toBeVisible();
  await userEvent.click(screen.getByText("Voir tous les exercices (3)"));
  expect(screen.getByText("Squat")).toBeVisible();
  expect(screen.getAllByText("Baseline enregistrée")).toHaveLength(3);
});
