import { describe, it, expect } from "vitest";
import {
  validerSeance,
  dureeEstimeeMinutes,
  chargeEstimee,
  type ExercicePropose,
  type ContexteValidation,
} from "./validation-seance";

const exercice = (p: Partial<ExercicePropose> = {}): ExercicePropose => ({
  exerciseInstanceId: "inst-1",
  nom: "Développé couché",
  series: 4,
  repsMin: 6,
  repsMax: 8,
  reposSecondes: 120,
  musclesPrincipaux: ["pectoraux"],
  pilier: "P1_poussee",
  profilTension: "mi_range",
  categorieRole: "pilier",
  rirCible: 2,
  ...p,
});

const contexte = (p: Partial<ContexteValidation> = {}): ContexteValidation => ({
  machinesDisponibles: [{ exerciseInstanceId: "inst-1", nom: "Développé couché" }],
  etatMuscles: {},
  contraintes: [],
  dureeDisponibleMinutes: 90,
  phase: "accumulation",
  tendancePerformance: "stable",
  ...p,
});

const codes = (r: ReturnType<typeof validerSeance>) => r.anomalies.map((a) => a.code);
const bloquants = (r: ReturnType<typeof validerSeance>) =>
  r.anomalies.filter((a) => a.gravite === "bloquant").map((a) => a.code);

describe("validerSeance — contrôles de base", () => {
  it("accepte une séance cohérente", () => {
    const r = validerSeance([exercice()], contexte());
    expect(r.valide).toBe(true);
    expect(r.anomalies).toHaveLength(0);
  });

  it("refuse une machine absente, un doublon, une séance vide", () => {
    expect(codes(validerSeance([exercice({ exerciseInstanceId: "x" })], contexte()))).toContain("machine_absente");
    expect(codes(validerSeance([exercice(), exercice()], contexte()))).toContain("doublon");
    expect(codes(validerSeance([], contexte()))).toEqual(["seance_vide"]);
  });

  it("refuse un muscle sous contrainte sévère mais tolère une gêne légère", () => {
    const severe = validerSeance([exercice()], contexte({ contraintes: [{ muscle: "pectoraux", severite: 8 }] }));
    expect(codes(severe)).toContain("contrainte_ignoree");
    const legere = validerSeance([exercice()], contexte({ contraintes: [{ muscle: "pectoraux", severite: 4 }] }));
    expect(legere.valide).toBe(true);
  });
});

describe("récupération — un score, pas une horloge", () => {
  it("accepte 48 h après une exposition légère", () => {
    // Le point de la critique : deux jours suffisent après six séries loin de
    // l'échec. L'ancienne règle fixe refusait ce cas.
    const r = validerSeance([exercice()], contexte({
      etatMuscles: {
        pectoraux: { joursDepuis: 2, seriesDerniereExposition: 6, rirMoyen: 3, courbature: 0 },
      },
    }));
    expect(r.valide).toBe(true);
    expect(r.anomalies).toHaveLength(0);
    expect(r.scoresRecuperation.pectoraux).toBeGreaterThanOrEqual(65);
  });

  it("refuse 48 h après vingt séries menées à l'échec", () => {
    const r = validerSeance([exercice()], contexte({
      etatMuscles: {
        pectoraux: { joursDepuis: 2, seriesDerniereExposition: 20, rirMoyen: 0, courbature: 7 },
      },
    }));
    expect(codes(r)).toContain("recuperation_insuffisante");
    expect(r.scoresRecuperation.pectoraux).toBeLessThan(40);
  });

  it("module le seuil selon ce que la phase demande", () => {
    // Deux jours, quatorze séries, RIR 2, courbatures légères : 53/100. L'état
    // est identique, seule l'exigence change — une surcharge assume de
    // travailler entamé, une décharge n'a de sens que si l'on part frais.
    const etat = {
      pectoraux: { joursDepuis: 2, seriesDerniereExposition: 14, rirMoyen: 2, courbature: 1 },
    };
    const leger = exercice({ rirCible: 4, series: 2 });

    const surcharge = validerSeance([leger], contexte({ phase: "surcharge", etatMuscles: etat }));
    const accumulation = validerSeance([leger], contexte({ phase: "accumulation", etatMuscles: etat }));
    const decharge = validerSeance([leger], contexte({
      phase: "decharge", etatMuscles: etat, cibleHebdoParMuscle: { pectoraux: 20 },
    }));

    expect(surcharge.scoresRecuperation.pectoraux).toBe(53);
    expect(codes(surcharge)).not.toContain("recuperation_insuffisante");
    expect(codes(accumulation)).toContain("recuperation_insuffisante");
    expect(codes(decharge)).toContain("recuperation_insuffisante");
  });
});

describe("cohérence avec la phase", () => {
  it("refuse une décharge qui garde la proximité de l'échec", () => {
    const r = validerSeance([exercice({ series: 3, rirCible: 1 })], contexte({
      phase: "decharge",
      cibleHebdoParMuscle: { pectoraux: 20 },
    }));
    expect(bloquants(r)).toContain("decharge_non_respectee");
  });

  it("refuse une décharge qui garde le volume habituel", () => {
    const r = validerSeance([exercice({ series: 18, rirCible: 4, reposSecondes: 30 })], contexte({
      phase: "decharge",
      cibleHebdoParMuscle: { pectoraux: 20 },
      dureeDisponibleMinutes: 240,
    }));
    expect(bloquants(r)).toContain("decharge_non_respectee");
  });

  it("accepte une décharge réellement allégée", () => {
    const r = validerSeance([exercice({ series: 2, rirCible: 4 })], contexte({
      phase: "decharge",
      cibleHebdoParMuscle: { pectoraux: 20 },
    }));
    expect(bloquants(r)).toHaveLength(0);
  });
});

describe("redondance, ordre et charge", () => {
  it("signale trois variantes du même schéma", () => {
    // Trois identifiants distincts, un seul stimulus.
    const r = validerSeance(
      [
        exercice(),
        exercice({ exerciseInstanceId: "inst-2", nom: "Développé incliné" }),
        exercice({ exerciseInstanceId: "inst-3", nom: "Développé machine" }),
      ],
      contexte({
        machinesDisponibles: [
          { exerciseInstanceId: "inst-1", nom: "a" },
          { exerciseInstanceId: "inst-2", nom: "b" },
          { exerciseInstanceId: "inst-3", nom: "c" },
        ],
      }),
    );
    expect(codes(r).filter((c) => c === "redondance_biomecanique")).toHaveLength(2);
  });

  it("ne signale rien si le profil de tension diffère", () => {
    const r = validerSeance(
      [exercice(), exercice({ exerciseInstanceId: "inst-2", nom: "Écarté", profilTension: "stretch" })],
      contexte({
        machinesDisponibles: [
          { exerciseInstanceId: "inst-1", nom: "a" },
          { exerciseInstanceId: "inst-2", nom: "b" },
        ],
      }),
    );
    expect(codes(r)).not.toContain("redondance_biomecanique");
  });

  it("signale un accessoire épuisant placé avant le mouvement prioritaire", () => {
    const r = validerSeance(
      [
        exercice({ exerciseInstanceId: "inst-2", nom: "Écarté poulie", categorieRole: "accessoire", profilTension: "stretch" }),
        exercice(),
      ],
      contexte({
        machinesDisponibles: [
          { exerciseInstanceId: "inst-1", nom: "a" },
          { exerciseInstanceId: "inst-2", nom: "b" },
        ],
      }),
    );
    expect(codes(r)).toContain("ordre_defavorable");
  });

  it("pondère la charge par la proximité de l'échec", () => {
    // Même durée, effort différent : c'est le point de la critique.
    const facile = chargeEstimee([exercice({ series: 10, rirCible: 4 })]);
    const dur = chargeEstimee([exercice({ series: 10, rirCible: 0 })]);
    expect(dur).toBeGreaterThan(facile);
    expect(facile).toBe(10);
  });

  it("signale un volume de séance ingérable", () => {
    const r = validerSeance([exercice({ series: 35, reposSecondes: 10 })], contexte({ dureeDisponibleMinutes: 400 }));
    expect(codes(r)).toContain("charge_excessive");
  });
});

describe("volume hebdomadaire", () => {
  it("signale un dépassement de la cible", () => {
    const r = validerSeance([exercice({ series: 8 })], contexte({
      seriesSemaineParMuscle: { pectoraux: 14 },
      cibleHebdoParMuscle: { pectoraux: 16 },
    }));
    expect(codes(r)).toContain("volume_hebdo_depasse");
  });

  it("ne signale rien quand la cible est respectée", () => {
    const r = validerSeance([exercice({ series: 4 })], contexte({
      seriesSemaineParMuscle: { pectoraux: 6 },
      cibleHebdoParMuscle: { pectoraux: 16 },
    }));
    expect(codes(r)).not.toContain("volume_hebdo_depasse");
  });
});

describe("durée", () => {
  it("ne compte pas le repos après la dernière série", () => {
    expect(dureeEstimeeMinutes([exercice({ series: 1 })])).toBe(3);
    expect(dureeEstimeeMinutes([exercice({ series: 4 })])).toBe(11);
  });

  it("refuse une séance plus longue que le temps disponible", () => {
    expect(bloquants(validerSeance([exercice()], contexte({ dureeDisponibleMinutes: 5 })))).toContain("duree_depassee");
  });
});
