import { describe, it, expect } from "vitest";
import { findSubstitutes, type ExerciseInstanceWithExercise } from "./substitutions";

const inst = (
  id: string,
  gymId: string,
  pilier: string,
  profilTension: string,
  categorieRole: ExerciseInstanceWithExercise["categorieRole"],
  musclesPrincipaux: string[] = [],
): ExerciseInstanceWithExercise => ({
  id,
  gymId,
  exerciseId: id,
  nom: id,
  machineNom: id,
  categorieRole,
  profilTension,
  musclesPrincipaux,
  pilier,
});

const parc: ExerciseInstanceWithExercise[] = [
  inst("row-machine", "lalande", "P2_tirage", "mi_range", "pilier", ["dos"]),
  inst("row-cable", "lalande", "P2_tirage", "mi_range", "substitut", ["dos"]),
  inst("pulldown", "lalande", "P2_tirage", "stretch", "accessoire", ["dos"]),
  inst("row-autre-salle", "sesquiere", "P2_tirage", "mi_range", "pilier", ["dos"]),
  inst("bench", "lalande", "P1_poussee", "mi_range", "pilier", ["pecs"]),
];

const criteres = {
  pilier: "P2_tirage",
  profilTension: "mi_range",
  gymId: "lalande",
  excludeExerciseIds: [] as string[],
};

describe("recherche de substituts", () => {
  it("ne propose jamais un exercice d'une autre salle", () => {
    const r = findSubstitutes(parc, criteres);
    expect(r.map((s) => s.exerciseInstanceId)).not.toContain("row-autre-salle");
  });

  it("ne propose jamais un exercice d'un autre pilier", () => {
    // Ce critere etait accepte puis ignore : un developpe couche pouvait etre
    // propose en remplacement d'un rowing.
    const r = findSubstitutes(parc, criteres);
    expect(r.map((s) => s.exerciseInstanceId)).not.toContain("bench");
    expect(r.every((s) => s.exerciseInstanceId.startsWith("row") || s.exerciseInstanceId === "pulldown")).toBe(true);
  });

  it("exclut les exercices demandes", () => {
    const r = findSubstitutes(parc, { ...criteres, excludeExerciseIds: ["row-machine"] });
    expect(r.map((s) => s.exerciseInstanceId)).not.toContain("row-machine");
  });

  it("classe pilier avant substitut avant accessoire", () => {
    const roles = findSubstitutes(parc, criteres).map((s) => s.categorieRole);
    expect(roles).toEqual([...roles].sort((a, b) =>
      ({ pilier: 0, substitut: 1, accessoire: 2 })[a] - ({ pilier: 0, substitut: 1, accessoire: 2 })[b]));
  });

  it("garde une recommandation et au plus deux alternatives", () => {
    const beaucoup = Array.from({ length: 12 }, (_, i) =>
      inst(`ex-${i}`, "lalande", "P2_tirage", "mi_range", "accessoire", ["dos"]));
    expect(findSubstitutes(beaucoup, criteres)).toHaveLength(3);
  });

  it("une raison trop compliqué privilégie seulement un mouvement plus simple et documenté", () => {
    const actuel = {
      ...inst("bench", "lalande", "P1_poussee", "mi_range", "pilier", ["pectoraux"]),
      type: "polyarticulaire",
      equipement: "barre",
      slug: "bench-press",
    };
    const guide = {
      ...inst("chest", "lalande", "P1_poussee", "mi_range", "substitut", ["pectoraux"]),
      type: "polyarticulaire",
      equipement: "machine",
      slug: "machine-chest-press",
    };
    const nonDocumente = {
      ...guide,
      id: "inconnu",
      exerciseId: "inconnu",
      nom: "Mouvement inconnu",
      slug: "mouvement-inconnu",
    };

    const r = findSubstitutes([actuel, guide, nonDocumente], {
      pilier: "P1_poussee",
      profilTension: "mi_range",
      type: "polyarticulaire",
      equipementActuel: "barre",
      gymId: "lalande",
      excludeExerciseIds: ["bench"],
      raison: "trop_complique",
      exigerDocumentation: true,
    });

    expect(r.map((x) => x.exerciseInstanceId)).toEqual(["chest"]);
    expect(r[0]?.raisonCompatibilite).toBe("Plus simple à apprendre");
    expect(r[0]?.documentationSuffisante).toBe(true);
  });

  it("machine occupée et trop compliqué ne produisent pas le même classement", () => {
    const libreMaisComplexe = {
      ...inst("libre", "lalande", "P1_poussee", "mi_range", "pilier", ["pectoraux"]),
      type: "polyarticulaire",
      equipement: "halteres",
      slug: "incline-dumbbell-press",
    };
    const guide = {
      ...inst("guide", "lalande", "P1_poussee", "mi_range", "substitut", ["pectoraux"]),
      type: "polyarticulaire",
      equipement: "machine",
      slug: "machine-chest-press",
    };
    const commun = {
      pilier: "P1_poussee",
      profilTension: "mi_range",
      type: "polyarticulaire",
      equipementActuel: "barre",
      gymId: "lalande",
      excludeExerciseIds: [] as string[],
    };
    expect(findSubstitutes([libreMaisComplexe, guide], { ...commun, raison: "occupee" })[0]?.exerciseInstanceId)
      .toBe("libre");
    expect(findSubstitutes([libreMaisComplexe, guide], {
      ...commun,
      raison: "trop_complique",
      exigerDocumentation: true,
    })[0]?.exerciseInstanceId).toBe("guide");
  });

  it("un débutant ne reçoit jamais un exercice non documenté en recommandation", () => {
    const candidat = {
      ...inst("sans-fiche", "lalande", "P2_tirage", "mi_range", "pilier", ["dos"]),
      equipement: "machine",
      slug: "slug-absent",
    };
    expect(findSubstitutes([candidat], { ...criteres, exigerDocumentation: true }))
      .toEqual([]);
  });

  it("une fiche dont la démonstration a été entièrement écartée ne suffit pas", () => {
    const candidat = {
      ...inst("hack", "lalande", "P3_squat", "stretch", "pilier", ["quadriceps"]),
      equipement: "machine",
      slug: "hack-squat",
    };
    expect(findSubstitutes([candidat], {
      pilier: "P3_squat",
      profilTension: "stretch",
      gymId: "lalande",
      excludeExerciseIds: [],
      exigerDocumentation: true,
    })).toEqual([]);
  });

  it("ecarte les exercices sollicitant un muscle courbature, malgre les vocabulaires differents", () => {
    // La courbature est saisie "Dorsaux", les instances portent "dos" en base.
    const r = findSubstitutes(parc, { ...criteres, musclesAvecCourbatures: ["Dorsaux"] });
    expect(r).toHaveLength(0);
  });

  it("ne filtre rien si aucune courbature n'est declaree", () => {
    expect(findSubstitutes(parc, { ...criteres, musclesAvecCourbatures: [] }).length).toBeGreaterThan(0);
  });
});
