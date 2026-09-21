import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FournisseurCoach } from "@/components/coach/ContexteCoach";
import { SessionOverview } from "@/components/session-composer/SessionOverview";
import type { SeanceProgrammeDetail } from "@/services/seance-template";

const detail: SeanceProgrammeDetail = {
  id: "template-push",
  blocId: "bloc-pplul",
  programmeNom: "PPLUL",
  programmeType: "hypertrophie",
  lettre: "A",
  nom: "Push",
  ordreDansSemaine: 1,
  muscles: ["pectoraux", "epaules"],
  seriesTotales: 4,
  dureeEstimeeMinutes: 45,
  exercices: [
    {
      ligneId: "ligne-chest",
      ordre: 1,
      exerciseInstanceId: "instance-chest",
      exerciseId: "exercise-chest",
      nom: "Lying Machine Chest Press",
      slug: null,
      machineNom: "Chest Press",
      salleNom: "Salle test",
      pilier: "poussee",
      musclesPrincipaux: ["pectoraux"],
      musclesSecondaires: [],
      seriesCibles: 2,
      fourchetteRepsMin: 8,
      fourchetteRepsMax: 12,
      rpeCible: 7,
      tempo: "3010",
      reposSecondes: 180,
      chargeCible: 20,
    },
  ],
};

describe("vue de consultation d'une séance", () => {
  it("expose le détail, la fiche exercice et le mode édition", () => {
    const { container } = render(
      <FournisseurCoach>
        <SessionOverview detail={detail} defaultGymId="gym-test" />
      </FournisseurCoach>,
    );

    expect(screen.getByRole("heading", { name: "Push", level: 2 })).toBeVisible();
    expect(screen.getByText("Pectoraux · Épaules")).toBeVisible();
    expect(screen.getByText("2 × 8-12")).toBeVisible();
    expect(screen.getByText("tempo 3010")).toBeVisible();
    expect(screen.getByText("20 kg")).toBeVisible();
    expect(screen.getByRole("link", { name: "Voir le détail de Lying Machine Chest Press" })).toHaveAttribute(
      "href",
      "/exercises/exercise-chest?from=%2Fsessions%2Fnew%2Ftemplate-push%2Fdetails",
    );
    expect(screen.getByRole("link", { name: "Modifier" })).toHaveAttribute(
      "href",
      "/sessions/new/template-push/edit",
    );
    expect(screen.getByRole("link", { name: /Démarrer la séance/ })).toHaveAttribute(
      "href",
      "/sessions/new/template-push?gymId=gym-test",
    );
    expect(container.querySelector(".session-overview-actions")).toHaveStyle({
      bottom: "var(--barre-nav)",
    });
  });
});
