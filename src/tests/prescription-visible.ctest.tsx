import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BandeauAdaptation } from "@/components/session/BandeauAdaptation";
import type { ExercicePrescrit } from "@/components/session/types";

/**
 * CE QUI SE LIT SANS RIEN OUVRIR.
 *
 * Deux informations existaient sans être visibles :
 *
 *   — le tempo PRESCRIT. Il n'apparaissait qu'une fois le contexte d'exécution
 *     chargé, c'est-à-dire après une requête — donc souvent pas du tout en
 *     début de séance, et jamais avant la première série. `exercice.tempo`
 *     porte pourtant déjà la consigne ;
 *   — une vraie montée de charge. Elle était annoncée dans le détail, derrière
 *     un appui, alors que c'est la contrepartie visible du travail accompli.
 *
 * Le réseau n'a rien à faire ici : c'est le RENDU qui est vérifié.
 */

vi.mock("@/components/session/serie-en-vol", () => ({
  pousserSerie: () => {},
  retirerSerieEnVol: () => {},
  revisionSuivante: () => Date.now(),
}));

// Le contexte part chercher le serveur au montage. Ces tests l'empêchent
// explicitement de répondre : c'est la prescription SEULE qui doit suffire.
vi.mock("@/components/session/useContexteExecution", () => ({
  useContexteExecution: () => ({ contexte: null, remplacer: () => {} }),
}));

const { LecteurExercice } = await import("@/components/session/LecteurExercice");
const { TableauSeries } = await import("@/components/session/TableauSeries");
const { useSessionStore } = await import("@/stores/sessionStore");

const EXERCICE: ExercicePrescrit = {
  id: "instance-a",
  nom: "Développé couché",
  machineNom: "Barre",
  seriesCibles: 3,
  fourchetteRepsMin: 8,
  fourchetteRepsMax: 10,
  incrementsPossibles: [2.5],
  chargeSuggeree: 60,
  rpeCible: 8,
  reposSecondes: 120,
  tempo: "3-0-1-0",
};

beforeEach(() => {
  useSessionStore.setState({ active: null });
  useSessionStore.getState().start({
    id: "seance-1",
    seanceTemplateId: "modele-1",
    gymId: "salle-1",
  });
});

describe("le tempo prescrit se lit sur la tuile", () => {
  it("l'affiche dans l'en-tête du Focus, sans attendre le contexte", () => {
    render(
      <LecteurExercice
        exercice={EXERCICE}
        rpeReduction={0}
        modeReserve={false}
        onSerieValidee={() => {}}
        onSuivant={null}
      />,
    );

    expect(screen.getByText("3-0-1-0")).toBeVisible();
  });

  it("l'affiche dans la ligne de prescription de la Liste", () => {
    render(
      <TableauSeries
        exercice={EXERCICE}
        rpeReduction={0}
        onSerieValidee={() => {}}
      />,
    );

    expect(screen.getByText(/tempo 3-0-1-0/)).toBeVisible();
  });

  it("n'invente aucun tempo quand la prescription n'en porte pas", () => {
    render(
      <TableauSeries
        exercice={{ ...EXERCICE, tempo: null }}
        rpeReduction={0}
        onSerieValidee={() => {}}
      />,
    );

    expect(screen.queryByText(/tempo/)).not.toBeInTheDocument();
  });

  it("montre le tempo tel qu'il est écrit quand il n'est pas au format canonique", () => {
    render(
      <TableauSeries
        exercice={{ ...EXERCICE, tempo: "3010" }}
        rpeReduction={0}
        onSerieValidee={() => {}}
      />,
    );

    // Ni corrigé, ni complété d'un « s » par phase : la consigne stockée se lit
    // telle quelle. L'inventer ferait exécuter un tempo que personne n'a écrit.
    expect(screen.getByText(/tempo 3010/)).toBeVisible();
  });
});

describe("une vraie montée de charge se voit sans ouvrir le détail", () => {
  it("l'annonce quand le motif est une montée", () => {
    render(
      <BandeauAdaptation
        exercices={[{ ...EXERCICE, motifProgression: "montee", messageProgression: "60 → 62,5 kg" }]}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Bravo, ta charge augmente sur Développé couché · 60 → 62,5 kg",
    );
  });

  it("ne la célèbre pas pour une référence tronquée", () => {
    render(
      <BandeauAdaptation
        exercices={[{
          ...EXERCICE,
          motifProgression: "reference_tronquee",
          messageProgression: "1 série sur 3, on refait la séance entière",
        }]}
      />,
    );

    // Le détail reste accessible ; la célébration, non.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ajustements de cette séance/i })).toBeVisible();
  });
});
