import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/session/serie-en-vol", () => ({
  pousserSerie: () => {},
  retirerSerieEnVol: () => {},
  revisionSuivante: () => Date.now(),
}));

const execution = vi.hoisted(() => ({ contexte: null as unknown }));
vi.mock("@/components/session/useContexteExecution", () => ({
  useContexteExecution: () => ({
    contexte: execution.contexte,
    remplacer: (suite: unknown) => { execution.contexte = suite; },
  }),
}));

const { LecteurExercice } = await import("@/components/session/LecteurExercice");
const { useSessionStore } = await import("@/stores/sessionStore");

const EXERCICE = {
  id: "leg-press-instance",
  exerciseId: "leg-press-exercise",
  slug: "leg-press",
  nom: "Leg Press",
  machineNom: "Leg Press",
  seriesCibles: 2,
  fourchetteRepsMin: 8,
  fourchetteRepsMax: 12,
  incrementsPossibles: [5],
  paliersCharges: null,
  chargeMinimale: null,
  chargeMax: null,
  poidsNonCompte: null,
  conventionCharge: "pile_affichee",
  natureCharge: "resistance",
  // Une valeur résiduelle ne doit jamais devenir une prescription quand il
  // n'existe aucun historique comparable sur cette machine.
  chargeSuggeree: 40,
  historique: [],
  rpeCible: 7,
  reposSecondes: 120,
};

const CONTEXTE = {
  exerciseInstanceId: EXERCICE.id,
  exerciseId: EXERCICE.exerciseId,
  fiche: {
    installation: "Assieds-toi au fond, dos et bassin contre le dossier.",
    execution: "Descends en contrôlant, puis pousse sans verrouiller les genoux.",
    amplitude: "Arrête la descente avant que le bassin ne décolle.",
    libellesPhasesTempo: {
      excentrique: "Descends le chariot",
      concentrique: "Pousse le chariot",
    },
  },
  tempo: {
    tempo: { excentrique: 3, pauseEtire: 0, concentrique: 1, pauseContracte: 0 },
    brut: "3-0-1-0",
    origine: "defaut",
  },
  reglages: [],
  resumeReglages: null,
  note: null,
  musclesPrincipaux: ["quadriceps"],
  musclesSecondaires: ["fessiers"],
  peutDecrire: false,
};

function rendre(exercice = EXERCICE) {
  return render(
    <LecteurExercice
      exercice={exercice as never}
      rpeReduction={0}
      modeReserve
      onSerieValidee={() => {}}
      onSuivant={null}
    />,
  );
}

beforeEach(() => {
  execution.contexte = CONTEXTE;
  useSessionStore.setState({ active: null });
  useSessionStore.getState().start({
    id: "session-novice",
    seanceTemplateId: "calibration-a",
    gymId: "salle-test",
  });
});

describe("cas 1 — première machine sans historique", () => {
  it("ne devine aucune charge et réutilise la convention de la vue Focus", () => {
    rendre();
    expect(screen.getByLabelText("Charge série 1")).toHaveValue("");
    expect(screen.queryByRole("button", { name: /Charge : un cran/ })).not.toBeInTheDocument();
    expect(screen.getByText("Note le nombre lu sur la pile.")).toBeInTheDocument();
    expect(screen.getByText("Commence volontairement léger.")).toBeInTheDocument();
  });

  it("sépare la cible du ressenti et ne présélectionne aucune réponse", () => {
    rendre();
    expect(screen.getByText(/Objectif : environ 3 en réserve/)).toBeInTheDocument();
    const groupe = screen.getByRole("group", {
      name: "Ton ressenti : répétitions encore possibles",
    });
    for (const bouton of within(groupe).getAllByRole("button")) {
      expect(bouton).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("guide vers le cran réel après une réponse explicite", async () => {
    const user = userEvent.setup();
    rendre();
    await user.type(screen.getByLabelText("Charge série 1"), "20");
    await user.click(screen.getByRole("button", { name: "5 ou plus, très facile" }));
    expect(screen.getByText(/essaie 25 kg, le cran suivant/)).toBeInTheDocument();
  });
});

describe("cas 2 — machine avec réglages connus", () => {
  it("montre les réglages essentiels et les valeurs personnelles avant S1", () => {
    execution.contexte = {
      ...CONTEXTE,
      reglages: [
        { cle: "siege", libelle: "Siège", unite: null, valeur: "4", definition: {} },
        { cle: "dossier", libelle: "Dossier", unite: null, valeur: null, definition: {} },
      ],
      resumeReglages: "Siège 4",
    };
    rendre();
    const preparation = screen.getByLabelText("Installation et réglages");
    expect(within(preparation).getByText("Siège")).toBeInTheDocument();
    expect(within(preparation).getByText("4")).toBeInTheDocument();
    expect(within(preparation).getByText("Dossier")).toBeInTheDocument();
    expect(within(preparation).getByText("À régler")).toBeInTheDocument();
  });
});

describe("cas 3 — machine sans définition de réglage", () => {
  it("reste honnête et garde l'installation générale accessible", () => {
    rendre();
    const preparation = screen.getByLabelText("Installation et réglages");
    expect(within(preparation).getByText(/Aucun réglage spécifique/)).toBeInTheDocument();
    expect(within(preparation).getByText(CONTEXTE.fiche.installation)).toBeInTheDocument();
    expect(preparation.textContent).not.toMatch(/siège\s*\d|dossier\s*\d/i);
  });
});

describe("cas 4 — tempo spécifique", () => {
  it("garde la notation et ajoute le geste contextualisé avec les secondes", async () => {
    const user = userEvent.setup();
    rendre();
    await user.click(screen.getByRole("button", { name: "Technique & note" }));
    expect(screen.getByText("3 s · 0 s · 1 s · 0 s")).toBeInTheDocument();
    expect(screen.getByText("Notation technique : 3-0-1-0")).toBeInTheDocument();
    expect(screen.getByText(/Descends le chariot en 3 secondes/)).toBeInTheDocument();
  });
});

describe("cas 5 — exercice de calibration terminé", () => {
  it("enregistre la mesure saisie et la garde comme série visible", async () => {
    const user = userEvent.setup();
    rendre();
    await user.type(screen.getByLabelText("Charge série 1"), "20");
    await user.click(screen.getByRole("button", { name: "3 répétitions possibles" }));
    await user.click(screen.getByRole("button", { name: "Valider la série" }));

    expect(document.querySelectorAll(".lecteur-faites li")).toHaveLength(1);
    expect(useSessionStore.getState().active?.sets[0]).toMatchObject({
      charge: 20,
      repsEffectuees: 8,
      rpeEffectif: 7,
    });
    expect(screen.queryByText(/progression/i)).not.toBeInTheDocument();
  });
});
