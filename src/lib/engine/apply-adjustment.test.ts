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

  it("atteint reellement la reduction annoncee", () => {
    // L'ancienne implementation faisait ceil(series * facteur) sur les seuls
    // accessoires : a -40 % annonces, le volume ne baissait que de 20 %.
    const r = applyVolumeAdjustment(seance, ajustement(-40));
    const avant = seance.reduce((n, e) => n + e.seriesCibles, 0);
    const apres = r.reduce((n, e) => n + e.seriesAjustees, 0);
    expect(avant).toBe(10);
    expect(apres).toBe(6);
    expect(Math.round((1 - apres / avant) * 100)).toBe(40);
  });

  it("repartit la coupe entre accessoires plutot que d'en vider un seul", () => {
    const r = applyVolumeAdjustment(seance, ajustement(-20));
    const accessoires = r.filter((e) => e.categorieRole === "accessoire");
    // 10 series -> 8 : une serie retiree a chacun des deux accessoires.
    expect(accessoires.map((e) => e.seriesAjustees).sort()).toEqual([2, 2]);
    expect(r.find((e) => e.categorieRole === "pilier")!.seriesAjustees).toBe(4);
  });

  it("n'entame un pilier que si les accessoires sont deja au minimum", () => {
    // -70 % sur 10 series vise 3 : les accessoires tombent a 1 chacun (2 series),
    // il faut donc puiser dans le pilier pour approcher la cible.
    const r = applyVolumeAdjustment(seance, ajustement(-70));
    const accessoires = r.filter((e) => e.categorieRole === "accessoire");
    expect(accessoires.every((e) => e.seriesAjustees === 1)).toBe(true);
    expect(r.find((e) => e.categorieRole === "pilier")!.seriesAjustees).toBeLessThan(4);
    expect(r.reduce((n, e) => n + e.seriesAjustees, 0)).toBe(3);
  });

  it("s'arrete quand tout est au minimum, sans boucler", () => {
    const minimale = [exo("A", "accessoire", 1), exo("B", "pilier", 1)];
    const r = applyVolumeAdjustment(minimale, ajustement(-40));
    expect(r.map((e) => e.seriesAjustees)).toEqual([1, 1]);
  });
});
