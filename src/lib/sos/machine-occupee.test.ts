import { describe, it, expect } from "vitest";
import { machineOccupee } from "./machine-occupee";
import type { ExerciseInstanceWithExercise } from "@/lib/engine/substitutions";

const inst = (
  id: string,
  pilier: string,
  profilTension: string,
  categorieRole: ExerciseInstanceWithExercise["categorieRole"],
  muscles: string[] = ["pectoraux"],
  gymId = "lalande",
): ExerciseInstanceWithExercise => ({
  id, gymId, exerciseId: id, nom: `exo-${id}`, machineNom: `machine-${id}`,
  categorieRole, profilTension, musclesPrincipaux: muscles, pilier,
});

const parc: ExerciseInstanceWithExercise[] = [
  inst("chest-press", "P1_poussee", "mi_range", "pilier"),
  inst("bench", "P1_poussee", "mi_range", "substitut"),
  inst("pec-deck", "P1_poussee", "stretch", "accessoire"),
  inst("row", "P2_tirage", "mi_range", "pilier", ["dorsaux"]),
  inst("bench-ailleurs", "P1_poussee", "mi_range", "pilier", ["pectoraux"], "sesquiere"),
];

const entree = {
  exercise_instance_id: "chest-press",
  gym_id: "lalande",
  seance_template_id: "t",
  daily_state_id: null,
};

describe("SOS machine occupée", () => {
  it("propose un substitut pour un exercice pilier", async () => {
    // Le pilier était lu comme le PREMIER MOT DU NOM de l'exercice et comparé au
    // champ `pilier` : aucun candidat ne correspondait jamais sur un exercice pilier.
    const r = await machineOccupee(entree, parc, ["chest-press"]);
    expect(r.substituts.length).toBeGreaterThan(0);
    expect(r.substituts.map((s) => s.exerciseInstanceId)).toContain("bench");
  });

  it("ne propose jamais un exercice d'un autre pilier", async () => {
    const r = await machineOccupee(entree, parc, ["chest-press"]);
    expect(r.substituts.map((s) => s.exerciseInstanceId)).not.toContain("row");
  });

  it("ne propose jamais une machine d'une autre salle", async () => {
    const r = await machineOccupee(entree, parc, ["chest-press"]);
    expect(r.substituts.map((s) => s.exerciseInstanceId)).not.toContain("bench-ailleurs");
  });

  it("exclut les exercices déjà dans la séance", async () => {
    const r = await machineOccupee(entree, parc, ["chest-press", "bench"]);
    expect(r.substituts.map((s) => s.exerciseInstanceId)).not.toContain("bench");
  });

  it("écarte un exercice courbaturé, quel que soit le muscle concerné", async () => {
    // Le muscle courbaturé est le SECOND de l'exercice : l'ancienne version ne
    // testait que le premier.
    const avecSecondMuscle = [
      ...parc,
      inst("dips", "P1_poussee", "mi_range", "substitut", ["pectoraux", "triceps"]),
    ];
    const r = await machineOccupee(entree, avecSecondMuscle, ["chest-press"], ["Triceps"]);
    expect(r.substituts.map((s) => s.exerciseInstanceId)).not.toContain("dips");
  });

  it("exercice introuvable : message clair, pas d'erreur", async () => {
    const r = await machineOccupee({ ...entree, exercise_instance_id: "inconnu" }, parc, []);
    expect(r.substituts).toEqual([]);
    expect(r.message).toContain("introuvable");
  });
});
