import { describe, it, expect } from "vitest";
import { applyVolumeAdjustment, type ExerciseInTemplateWithDetails, type VolumeAdjustment } from "./apply-adjustment";

const exo = (
  nom: string,
  categorieRole: ExerciseInTemplateWithDetails["categorieRole"],
  seriesCibles: number,
): ExerciseInTemplateWithDetails => ({
  exerciseInstanceId: nom,
  exerciseInTemplateId: nom,
  exerciseName: nom,
  machineNom: null,
  categorieRole,
  seriesCibles,
  fourchetteRepsMin: 6,
  fourchetteRepsMax: 8,
  rpeCible: 8,
  tempo: "3010",
  reposSecondes: 120,
  incrementsPossibles: [2.5],
  musclesPrincipaux: [],
});

const ajustement = (totalPct: number): VolumeAdjustment => ({
  totalPct,
  raisons: [],
  proposeDeloadImprovise: false,
  proposeReport: false,
  musclesAReporter: [],
});

const seance = [exo("Squat", "pilier", 4), exo("Leg ext", "accessoire", 3), exo("Mollets", "accessoire", 3)];

describe("application de l'ajustement de volume", () => {
  it("sans ajustement, les series cibles sont inchangees", () => {
    const r = applyVolumeAdjustment(seance, ajustement(0));
    expect(r.map((e) => e.seriesAjustees)).toEqual([4, 3, 3]);
  });

  it("protege systematiquement les piliers", () => {
    for (const pct of [-10, -25, -40]) {
      const r = applyVolumeAdjustment(seance, ajustement(pct));
      expect(r.find((e) => e.categorieRole === "pilier")!.seriesAjustees).toBe(4);
    }
  });

  it("ne descend jamais un exercice sous une serie", () => {
    const r = applyVolumeAdjustment([exo("Gainage", "accessoire", 1)], ajustement(-40));
    expect(r[0]!.seriesAjustees).toBe(1);
  });

  it("conserve tous les exercices : l'ajustement reduit, il ne supprime pas", () => {
    expect(applyVolumeAdjustment(seance, ajustement(-40))).toHaveLength(3);
  });

  it("arrondit au superieur, ce qui rend la reduction reelle bien plus faible qu'annoncee", () => {
    // Comportement fige tel qu'il est aujourd'hui, et signale dans l'audit :
    // a -40 %, un accessoire de 3 series ne perd qu'une serie (ceil(3 * 0.6) = 2),
    // et les piliers ne bougent pas. Sur cette seance, le volume total passe de
    // 10 a 8 series, soit -20 % pour un ajustement annonce a -40 %.
    const r = applyVolumeAdjustment(seance, ajustement(-40));
    expect(r.map((e) => e.seriesAjustees)).toEqual([4, 2, 2]);

    const avant = seance.reduce((n, e) => n + e.seriesCibles, 0);
    const apres = r.reduce((n, e) => n + e.seriesAjustees, 0);
    expect(avant).toBe(10);
    expect(apres).toBe(8);
    // L'ecart entre l'intention (-40 %) et l'effet (-20 %) reste a traiter en phase 5.
    expect(Math.round((1 - apres / avant) * 100)).toBe(20);
  });
});
