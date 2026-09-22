import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LecteurExercice } from "@/components/session/LecteurExercice";
import { HistoriqueExerciceLive } from "@/components/session/HistoriqueExerciceLive";
import { EnteteLive } from "@/components/session/EnteteLive";
import { useSessionStore } from "@/stores/sessionStore";
import type { ExercicePrescrit } from "@/components/session/types";

vi.mock("@/components/session/serie-en-vol", () => ({ pousserSerie: vi.fn(), retirerSerieEnVol: vi.fn(), revisionSuivante: () => Date.now() }));
vi.mock("@/components/session/useContexteExecution", () => ({ useContexteExecution: () => ({ contexte: null, remplacer: vi.fn() }) }));

const exercice: ExercicePrescrit = {
  id: "chest", nom: "Lying Machine Chest Press", machineNom: "Chest Press",
  musclesPrincipaux: ["pecs"], musclesSecondaires: ["epaule_ant", "triceps"],
  seriesCibles: 2, fourchetteRepsMin: 8, fourchetteRepsMax: 12, rpeCible: 7,
  reposSecondes: 180, tempo: "3-0-1-0", incrementsPossibles: [5], chargeSuggeree: 60,
  historique: [{ charge: 55, reps: 8 }, { charge: 55, reps: 8 }],
};
beforeEach(() => {
  useSessionStore.setState({ active: null });
  useSessionStore.getState().start({ id: "test-live", seanceTemplateId: "push", gymId: "gym" });
});

it("garde les données réelles, puis enregistre le ressenti avec la série", async () => {
  const validee = vi.fn();
  const user = userEvent.setup();
  render(<LecteurExercice exercice={exercice} rpeReduction={0} modeReserve onSerieValidee={validee} onSuivant={null} />);
  expect(screen.getByText("Pectoraux")).toBeVisible();
  expect(screen.getByText("Épaules")).toBeVisible();
  expect(screen.getByText("Triceps")).toBeVisible();
  expect(screen.getByText("3-0-1-0")).toBeVisible();
  expect(screen.getByLabelText("Charge série 1")).toHaveValue("60");
  await user.click(screen.getByLabelText("Charge : un cran au-dessus"));
  expect(screen.getByLabelText("Charge série 1")).toHaveValue("65");
  await user.click(screen.getByLabelText("Une répétition de plus"));
  await user.click(screen.getByRole("button", { name: "Valider la série" }));
  expect(useSessionStore.getState().active?.sets).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "3 répétitions possibles" }));
  await user.click(screen.getByRole("button", { name: "Enregistrer la série" }));
  expect(useSessionStore.getState().active?.sets[0]).toMatchObject({ charge: 65, repsEffectuees: 9, rpeEffectif: 7, numeroSerie: 1 });
  expect(validee).toHaveBeenCalledWith(expect.objectContaining({ exerciseInstanceId: "chest", reposSecondes: 180, exerciceTermine: false }));
  await user.click(screen.getByText(/1 série validée/));
  expect(screen.getByRole("button", { name: "Modifier la série 1" })).toBeVisible();
});

it("un débutant garde un poids vide et accède aux aides dans Technique & réglages", async () => {
  render(<LecteurExercice exercice={{ ...exercice, historique: [], chargeSuggeree: null }} rpeReduction={0} modeReserve onSerieValidee={() => {}} onSuivant={null} />);
  expect(screen.getByLabelText("Charge série 1")).toHaveValue("");
  expect(screen.getByText("Aucun historique pour le moment")).toBeVisible();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Technique & réglages" }));
  expect(screen.getByRole("dialog")).toBeVisible();
});

it("montre les deux séances datées et les séries réelles dans le détail", async () => {
  render(<HistoriqueExerciceLive exercice={{ ...exercice, historiqueSeances: [
    { sessionLogId: "s1", date: "2026-01-27", sets: [1, 2].map((numero) => ({ numero, charge: 55, reps: 8, rpe: 7 })) },
    { sessionLogId: "s2", date: "2026-01-22", sets: [1, 2].map((numero) => ({ numero, charge: 52.5, reps: 10, rpe: 8 })) },
  ] }} />);
  expect(screen.getByText("2 × 8 @ 55 kg")).toBeVisible();
  expect(screen.getByText("2 × 10 @ 52,5 kg")).toBeVisible();
  expect(screen.getByText("3 RIR")).toBeVisible();
  expect(screen.getByText(/27 janv/)).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Voir plus" }));
  expect(within(screen.getByRole("dialog")).getAllByText("Série 2")).toHaveLength(2);
});

it("un ancien plan reste lisible sans date ni RIR inventés", () => {
  render(<HistoriqueExerciceLive exercice={exercice} />);
  expect(screen.getByText("Dernière séance")).toBeVisible();
  expect(screen.getByText("2 × 8 @ 55 kg")).toBeVisible();
  expect(screen.queryByText(/RIR/)).not.toBeInTheDocument();
});

it("les actions de l'en-tête et le switch gardent leurs destinations", async () => {
  const actions = { onRetour: vi.fn(), onAides: vi.fn(), onDuree: vi.fn(), onTerminer: vi.fn(), onVue: vi.fn() };
  render(<EnteteLive nom="Push" vue="focus" courant={0} etats={[]} etatMascotte="training" {...actions} />);
  const user = userEvent.setup();
  await user.click(screen.getByLabelText("Coach et ajustements de la séance"));
  expect(actions.onAides).toHaveBeenCalledOnce();
  await user.click(screen.getByLabelText("Adapter la durée de la séance"));
  expect(actions.onDuree).toHaveBeenCalledOnce();
  await user.click(screen.getByLabelText("Afficher la vue Liste"));
  expect(actions.onVue).toHaveBeenCalledWith("liste");
  await user.click(screen.getByText("Finir la séance"));
  expect(actions.onTerminer).toHaveBeenCalledOnce();
});
