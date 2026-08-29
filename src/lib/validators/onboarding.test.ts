import { describe, it, expect } from "vitest";
import { onboardingSchema, estUneReprise, OBJECTIFS, LIBELLES_OBJECTIF } from "./onboarding";

const base = {
  objectifType: "prise_de_muscle",
  niveauExperience: "intermediaire",
  frequenceCibleParSemaine: 3,
  frequenceMinParSemaine: 2,
  frequenceMaxParSemaine: 4,
  dureeSeanceCibleMinutes: 60,
  dureeSeanceMaxMinutes: 75,
  nouvelleSalleNom: "St-Martin-Du-Touch",
};

const echec = (patch: Record<string, unknown>) => {
  const r = onboardingSchema.safeParse({ ...base, ...patch });
  expect(r.success).toBe(false);
  return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
};

describe("onboardingSchema", () => {
  it("accepte le strict nécessaire et complète le reste", () => {
    const r = onboardingSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (!r.success) return;
    // Ce qui n'est pas demandé ne doit pas devenir une valeur inventée.
    expect(r.data.musclesPrioritaires).toEqual([]);
    expect(r.data.contraintes).toEqual([]);
    expect(r.data.exercicesRefuses).toEqual([]);
    expect(r.data.moisDInterruption).toBe(0);
    expect(r.data.preferenceMateriel).toBe("aucune");
  });

  it("exige une salle, existante ou nouvelle", () => {
    expect(echec({ nouvelleSalleNom: undefined })).toContain("nouvelleSalleNom");
    const r = onboardingSchema.safeParse({
      ...base,
      nouvelleSalleNom: undefined,
      salleId: "3f6c1b7e-1f9a-4c2a-9a4e-2f1b6c7d8e90",
    });
    expect(r.success).toBe(true);
  });

  it("refuse une fourchette de fréquence incohérente", () => {
    // Un minimum au-dessus de l'objectif rendrait la programmation impossible
    // à satisfaire dès la première semaine.
    expect(echec({ frequenceMinParSemaine: 5 })).toContain("frequenceMinParSemaine");
    expect(echec({ frequenceMaxParSemaine: 2 })).toContain("frequenceMaxParSemaine");
  });

  it("refuse une durée idéale supérieure au maximum", () => {
    expect(echec({ dureeSeanceCibleMinutes: 90 })).toContain("dureeSeanceMaxMinutes");
  });

  it("ne demande jamais une ancienne charge ni un ancien record", () => {
    // La garantie faite à l'utilisateur est vérifiable côté schéma : même
    // transmises, ces valeurs ne ressortent pas de la validation.
    const r = onboardingSchema.safeParse({
      ...base,
      developpeCoucheMax: 100,
      ancienRecordSquat: 140,
      charge1RM: 180,
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(Object.keys(r.data).join(" ")).not.toMatch(/charge|record|1rm/i);
  });

  it("plafonne les muscles prioritaires à quatre", () => {
    expect(echec({ musclesPrioritaires: ["pectoraux", "dos", "quadriceps", "biceps", "epaules"] }))
      .toContain("musclesPrioritaires");
  });
});

describe("estUneReprise", () => {
  it("distingue une continuité d'une reprise", () => {
    expect(estUneReprise(0)).toBe(false);
    expect(estUneReprise(1)).toBe(false);
    expect(estUneReprise(2)).toBe(true);
    expect(estUneReprise(8)).toBe(true);
  });
});

describe("vocabulaire des objectifs", () => {
  it("porte un libellé pour chaque valeur écrite en base", () => {
    for (const o of OBJECTIFS) expect(LIBELLES_OBJECTIF[o]).toBeTruthy();
  });
});
