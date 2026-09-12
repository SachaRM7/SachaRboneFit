import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { accueilTest, complementTest } from "./fixtures/home";
import { FournisseurCoach, useCoach } from "@/components/coach/ContexteCoach";
import { ContenuTableauDeBord } from "@/components/dashboard/ContenuTableauDeBord";
import { ObservationsAccueil } from "@/components/dashboard/ComplementTableauDeBord";
import { ResumeRecuperation, RecuperationAccueil } from "@/components/dashboard/RecuperationAccueil";
import { useSessionStore } from "@/stores/sessionStore";
import type { EtatDuJour } from "@/lib/engine/etat-du-jour";

const { push, refresh, complement } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), complement: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/services/tableau-de-bord", () => ({ complementTableauDeBordMemoise: complement }));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/components/session/serie-en-vol", () => ({ pousserSerie: vi.fn(), retirerSerieEnVol: vi.fn(), revisionSuivante: () => Date.now() }));

function EtatCoach() { const { ouvert, contexte } = useCoach(); return <output aria-label="Contexte coach">{ouvert ? contexte?.ecran : "fermé"}</output>; }
function home(data = accueilTest) {
  return render(<FournisseurCoach>
    <ContenuTableauDeBord data={data}
      recuperation={<ResumeRecuperation etat={complementTest.recuperation} />}
      complement={<ObservationsAccueil data={complementTest} />}
      carteProgramme={<p>Phase de test</p>} />
    <EtatCoach />
  </FournisseurCoach>);
}
beforeEach(() => {
  useSessionStore.setState({ active: null });
  push.mockReset(); refresh.mockReset(); complement.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});

describe("Home : comprendre puis explorer", () => {
  it("place la vraie prochaine action avant les synthèses et ne charge aucun détail par fetch", () => {
    const { container } = home();
    expect(Array.from(container.querySelectorAll("h1,h2")).map((el) => el.textContent)).toEqual(["Salut Sacha.", "Séance D", "Aujourd’hui", "Coach a remarqué"]);
    expect(screen.getByRole("link", { name: "Commencer" })).toHaveAttribute("href", accueilTest.etat.action.href);
    expect(screen.queryByText("Biceps")).not.toBeInTheDocument();
    expect(screen.queryByText(/Cable Curl :/)).not.toBeInTheDocument();
    expect(screen.queryByText("Calibration B")).not.toBeInTheDocument();
    expect(screen.queryByText("Phase de test")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    expect(container.querySelectorAll("img.mascotte")).toHaveLength(1);
  });

  it("ouvre le vrai état musculaire, conserve ses détails, puis restitue le focus", async () => {
    home(); const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: /Muscles/ });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Ton état musculaire" });
    expect(within(dialog).getByText("Quadriceps")).toBeInTheDocument();
    expect(within(dialog).getByText("Biceps")).toBeInTheDocument();
    await user.click(within(dialog).getByText("Biceps"));
    expect(within(dialog).getByText("Biceps").closest("details")).toHaveAttribute("open");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("regroupe les observations sans les perdre, y compris préparation et dernières séances", async () => {
    home(); await userEvent.click(screen.getByRole("button", { name: "2 points à voir" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Cable Curl : +2 kg proposés.")).toBeVisible();
    expect(within(dialog).getByText(/Préparation de la prochaine/)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /Calibration B/ })).toHaveAttribute("href", "/sessions/historique-b?templateLettre=B&sessionDate=2026-09-10");
  });

  it("ferme les observations avant d'ouvrir le coach", async () => {
    home(); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "2 points à voir" }));
    await user.click(screen.getByRole("button", { name: "Comprendre ma séance" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Contexte coach")).toHaveTextContent("accueil");
  });

  it("rend le poids et son historique accessibles sans perdre la saisie", async () => {
    home(); await userEvent.click(screen.getByRole("button", { name: /Poids 90,5 kg/ }));
    expect(screen.getByText("Dernier poids : 90,5 kg")).toBeVisible();
    expect(screen.getByRole("link", { name: /Pesées et historique/ })).toHaveAttribute("href", "/bodyweight");
  });

  it("ouvre le coach au contexte accueil, uniquement au toucher", async () => {
    home(); expect(screen.getByLabelText("Contexte coach")).toHaveTextContent("fermé");
    await userEvent.click(screen.getByRole("button", { name: "Demander au coach" }));
    expect(screen.getByLabelText("Contexte coach")).toHaveTextContent("accueil");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("distingue données manquantes et forme favorable", async () => {
    home({ ...accueilTest, user: { nom: "", poidsActuel: null }, feuJour: null, feuTendance: null, poids30jours: [] });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Salut.");
    expect(screen.getByRole("button", { name: /Forme À renseigner/ })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /Poids Ajouter/ }));
    expect(screen.getByText("Pas encore de poids enregistré.")).toBeVisible();
  });

  it("expose une protection réelle avant d'ouvrir le détail", () => {
    render(<ResumeRecuperation etat={{ ...complementTest.recuperation!, muscles: [{ ...complementTest.recuperation!.muscles[0]!, etat: "a_menager", severiteContrainte: 5 }] }} />);
    expect(screen.getByRole("button", { name: /1 à protéger/ })).toBeVisible();
  });

  it("tolère une récupération indisponible sans inventer de muscles prêts", async () => {
    complement.mockRejectedValue(new Error("timeout"));
    render(await RecuperationAccueil({ userId: "utilisateur-test" }));
    expect(screen.getByRole("button", { name: /Muscles Indisponible/ })).toBeVisible();
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByText(/momentanément indisponible/)).toBeVisible();
  });

  it("ne transforme pas l'absence d'observations en bonne santé prouvée", async () => {
    render(<FournisseurCoach><ObservationsAccueil data={{ ...complementTest, alertesPreSeance: [], precalcSession: null, weeklyDebrief: null, recentSessions: [] }} /></FournisseurCoach>);
    await userEvent.click(screen.getByRole("button", { name: "Aucune observation disponible" }));
    expect(screen.getByText("Aucune nouvelle recommandation à afficher.")).toBeVisible();
  });
});

describe("les parcours métier existants restent les seules actions", () => {
  it.each([
    ["sans_salle", "/gyms", "Choisir ma salle"],
    ["salle_vide", "/gyms/salle-test", "Renseigner la salle"],
    ["prete", accueilTest.etat.action.href, "Commencer ma séance"],
    ["deja_entraine", "/progression", "Voir ton évolution"],
    ["semaine_complete", "/progression", "Voir ton évolution"],
  ] as const)("%s conserve le href du moteur", (etat, href, bouton) => {
    home({ ...accueilTest, etat: { ...accueilTest.etat, etat, action: { ...accueilTest.etat.action, href } as EtatDuJour["action"] } });
    expect(screen.getByRole("link", { name: bouton })).toHaveAttribute("href", href);
  });

  it("reprend la séance active au lieu d'en démarrer une autre", async () => {
    useSessionStore.getState().start({ id: "session-test", seanceTemplateId: "modele-b", gymId: "salle-test" });
    home();
    expect(screen.queryByRole("link", { name: "Commencer" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reprendre ma séance" }));
    expect(push).toHaveBeenCalledWith("/sessions/new/modele-b");
    expect(useSessionStore.getState().active?.id).toBe("session-test");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("une séance périmée garde clôture et consentement d'abandon, sans effacer au premier clic", async () => {
    useSessionStore.getState().start({ id: "ancienne", seanceTemplateId: "modele-b", gymId: "salle-test" });
    useSessionStore.setState((s) => ({ active: { ...s.active!, startedAt: Date.now() - 7 * 3600_000 } }));
    home();
    await userEvent.click(await screen.findByRole("button", { name: "Clôturer" }));
    expect(push).toHaveBeenCalledWith("/sessions/new/modele-b/finish");
    await userEvent.click(screen.getByRole("button", { name: "Abandonner" }));
    expect(screen.getByRole("dialog", { name: "Abandonner la séance en cours ?" })).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
    expect(useSessionStore.getState().active?.id).toBe("ancienne");
  });
});
