import { describe, it, expect } from "vitest";
import { validerSeance, dureeEstimeeMinutes, type ExercicePropose, type ContexteValidation } from "./validation-seance";

const exercice = (p: Partial<ExercicePropose> = {}): ExercicePropose => ({
  exerciseInstanceId: "inst-1",
  nom: "Développé couché",
  series: 4,
  repsMin: 6,
  repsMax: 8,
  reposSecondes: 120,
  musclesPrincipaux: ["pectoraux"],
  pilier: "P1_poussee",
  ...p,
});

const contexte = (p: Partial<ContexteValidation> = {}): ContexteValidation => ({
  machinesDisponibles: [{ exerciseInstanceId: "inst-1", nom: "Développé couché" }],
  joursDepuisDernierTravail: {},
  contraintes: [],
  dureeDisponibleMinutes: 90,
  ...p,
});

const codes = (r: ReturnType<typeof validerSeance>) => r.anomalies.map((a) => a.code);

describe("validerSeance", () => {
  it("accepte une séance cohérente", () => {
    const r = validerSeance([exercice()], contexte());
    expect(r.valide).toBe(true);
    expect(r.anomalies).toHaveLength(0);
    expect(r.seriesTotales).toBe(4);
  });

  it("refuse une machine absente de la salle", () => {
    // C'est la garde principale : un modèle qui invente du matériel est arrêté
    // avant que la séance n'atteigne l'écran.
    const r = validerSeance([exercice({ exerciseInstanceId: "fantome" })], contexte());
    expect(r.valide).toBe(false);
    expect(codes(r)).toContain("machine_absente");
  });

  it("refuse un exercice répété", () => {
    const r = validerSeance([exercice(), exercice()], contexte());
    expect(r.valide).toBe(false);
    expect(codes(r)).toContain("doublon");
  });

  it("refuse un muscle sous contrainte sévère", () => {
    const r = validerSeance(
      [exercice()],
      contexte({ contraintes: [{ muscle: "pectoraux", severite: 8 }] }),
    );
    expect(r.valide).toBe(false);
    expect(codes(r)).toContain("contrainte_ignoree");
  });

  it("tolère une contrainte légère", () => {
    // En dessous du seuil, l'exercice s'allège ; il ne s'écarte pas.
    const r = validerSeance(
      [exercice()],
      contexte({ contraintes: [{ muscle: "pectoraux", severite: 4 }] }),
    );
    expect(r.valide).toBe(true);
  });

  it("signale une récupération insuffisante sans bloquer", () => {
    const r = validerSeance([exercice()], contexte({ joursDepuisDernierTravail: { pectoraux: 1 } }));
    expect(r.valide).toBe(true);
    expect(r.anomalies[0]!.gravite).toBe("avertissement");
    expect(codes(r)).toContain("recuperation_insuffisante");
  });

  it("refuse une séance plus longue que le temps disponible", () => {
    const r = validerSeance(
      [exercice(), exercice({ exerciseInstanceId: "inst-2", nom: "Squat" })],
      contexte({
        machinesDisponibles: [
          { exerciseInstanceId: "inst-1", nom: "Développé couché" },
          { exerciseInstanceId: "inst-2", nom: "Squat" },
        ],
        dureeDisponibleMinutes: 10,
      }),
    );
    expect(r.valide).toBe(false);
    expect(codes(r)).toContain("duree_depassee");
  });

  it("refuse une fourchette inversée et des séries nulles", () => {
    const r = validerSeance([exercice({ series: 0, repsMin: 12, repsMax: 8 })], contexte());
    expect(codes(r)).toEqual(expect.arrayContaining(["series_invalides", "fourchette_inversee"]));
  });

  it("refuse une séance vide", () => {
    const r = validerSeance([], contexte());
    expect(r.valide).toBe(false);
    expect(codes(r)).toEqual(["seance_vide"]);
  });

  it("signale les muscles attendus non couverts", () => {
    const r = validerSeance([exercice()], contexte({ musclesAttendus: ["pectoraux", "dorsaux"] }));
    expect(r.valide).toBe(true);
    expect(r.anomalies[0]!.message).toContain("dorsaux");
  });

  it("comprend le vocabulaire alternatif des muscles", () => {
    // Le modèle écrit « pecs » là où la base dit « pectoraux » : la contrainte
    // doit s'appliquer quand même.
    const r = validerSeance(
      [exercice({ musclesPrincipaux: ["pecs"] })],
      contexte({ contraintes: [{ muscle: "pectoraux", severite: 9 }] }),
    );
    expect(codes(r)).toContain("contrainte_ignoree");
  });
});

describe("dureeEstimeeMinutes", () => {
  it("ne compte pas le repos après la dernière série", () => {
    // Une série seule : installation 120 s + exécution 45 s, aucun repos.
    expect(dureeEstimeeMinutes([exercice({ series: 1 })])).toBe(3);
    // Quatre séries : 120 + 4×45 + 3×120 = 660 s.
    expect(dureeEstimeeMinutes([exercice({ series: 4 })])).toBe(11);
  });

  it("cumule les exercices", () => {
    const deux = dureeEstimeeMinutes([exercice(), exercice({ exerciseInstanceId: "inst-2" })]);
    expect(deux).toBe(22);
  });
});
