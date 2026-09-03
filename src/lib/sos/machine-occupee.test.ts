import { describe, it, expect } from "vitest";
import { machineOccupee } from "./machine-occupee";
import type { ExerciseInstanceWithExercise } from "@/lib/engine/substitutions";

/**
 * Ce que la modale « Machine occupée » affichait en recette.
 *
 * Trois lignes rigoureusement identiques — « Sortie de poulie réglable »,
 * trois fois — et sous chacune : « Même pilier (undefined) et même profil de
 * tension ». Trois défauts en une liste : un enum technique donné à lire, une
 * valeur absente racontée comme une raison, et des propositions impossibles à
 * départager.
 */

const SALLE = "salle";

const instance = (over: Partial<ExerciseInstanceWithExercise> = {}): ExerciseInstanceWithExercise => ({
  id: "i1",
  gymId: SALLE,
  exerciseId: "e1",
  nom: "Tirage vertical",
  machineNom: "Lat Pulldown",
  pilier: "P2_tirage",
  profilTension: "mi_range",
  type: "polyarticulaire",
  categorieRole: "pilier",
  musclesPrincipaux: ["dorsaux"],
  equipement: "machine",
  ...over,
} as ExerciseInstanceWithExercise);

const occupe = instance({ id: "occupe", nom: "Tirage horizontal", machineNom: "Seated Row" });

describe("la raison se lit, elle ne se décode pas", () => {
  it("le pilier est traduit, jamais rendu brut", async () => {
    const res = await machineOccupee(
      { exercise_instance_id: occupe.id, gym_id: SALLE, seance_template_id: "", daily_state_id: null },
      [occupe, instance({ id: "autre" })],
      [occupe.id],
    );
    const raison = res.substituts[0]?.raisonCompatibilite ?? "";
    expect(raison).toContain("Tirage");
    expect(raison).not.toContain("P2_tirage");
  });

  it("un pilier absent ne devient pas « undefined »", async () => {
    // C'est mot pour mot ce que l'écran affichait.
    const res = await machineOccupee(
      { exercise_instance_id: occupe.id, gym_id: SALLE, seance_template_id: "", daily_state_id: null },
      [
        instance({ ...occupe, pilier: undefined as unknown as string }),
        instance({ id: "autre", pilier: undefined as unknown as string }),
      ],
      [occupe.id],
    );
    for (const s of res.substituts) {
      const raison = s.raisonCompatibilite ?? "";
      expect(raison).not.toContain("undefined");
      expect(raison.length).toBeGreaterThan(0);
    }
  });
});

describe("deux propositions ne peuvent pas être indistinguables", () => {
  it("des homonymes sont départagés par leur poste", async () => {
    // Les trois sorties de poulie de Saint-Martin : même exercice, même nom
    // de machine, trois appareils bien réels.
    const poulies = [1, 2, 3].map((n) =>
      instance({ id: `poulie-${n}`, nom: "Sortie de poulie réglable", machineNom: "Poulie réglable" }),
    );
    const res = await machineOccupee(
      { exercise_instance_id: occupe.id, gym_id: SALLE, seance_template_id: "", daily_state_id: null },
      [occupe, ...poulies],
      [occupe.id],
    );

    const etiquettes = res.substituts.map((s) => `${s.exerciseName}|${s.machineName}`);
    expect(new Set(etiquettes).size).toBe(etiquettes.length);
    expect(res.substituts.every((s) => s.machineName?.includes("poste"))).toBe(true);
  });

  it("des propositions déjà distinctes ne sont pas numérotées pour rien", async () => {
    const res = await machineOccupee(
      { exercise_instance_id: occupe.id, gym_id: SALLE, seance_template_id: "", daily_state_id: null },
      [occupe, instance({ id: "a", nom: "Tirage nuque", machineNom: "Poulie haute" })],
      [occupe.id],
    );
    expect(res.substituts[0]?.machineName).toBe("Poulie haute");
  });
});

describe("la recherche part bien de l'exercice désigné", () => {
  it("elle exclut ce qui est déjà au programme du jour", async () => {
    const dejaPrevu = instance({ id: "deja", nom: "Rowing machine" });
    const libre = instance({ id: "libre", nom: "Tirage bas" });
    const res = await machineOccupee(
      { exercise_instance_id: occupe.id, gym_id: SALLE, seance_template_id: "", daily_state_id: null },
      [occupe, dejaPrevu, libre],
      [occupe.id, dejaPrevu.id],
    );
    expect(res.substituts.map((s) => s.exerciseInstanceId)).toEqual(["libre"]);
  });

  it("une salle sans équivalent le dit clairement", async () => {
    const res = await machineOccupee(
      { exercise_instance_id: occupe.id, gym_id: SALLE, seance_template_id: "", daily_state_id: null },
      [occupe],
      [occupe.id],
    );
    expect(res.substituts).toHaveLength(0);
    expect(res.message).toContain("Aucun substitut");
  });

  it("un exercice inconnu ne fabrique pas de proposition", async () => {
    const res = await machineOccupee(
      { exercise_instance_id: "fantome", gym_id: SALLE, seance_template_id: "", daily_state_id: null },
      [occupe],
      [],
    );
    expect(res.substituts).toHaveLength(0);
  });
});
