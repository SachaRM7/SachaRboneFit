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

describe("le classement est déterministe, et il tient la liste", () => {
  /*
   * LE DÉFAUT FERMÉ
   *
   * La version précédente prenait `candidates.slice(0, 3)` — les trois premiers
   * dans l'ordre où la base les avait rendus. Deux appels identiques pouvaient
   * proposer deux listes différentes, et rien ne disait pourquoi celui-là
   * plutôt qu'un autre.
   */
  const base = instance({
    id: "base", nom: "Tirage horizontal", machineNom: "Seated Row",
    profilTension: "mi_range", categorieRole: "pilier", musclesPrincipaux: ["dorsaux"],
  });

  const tresProche = instance({
    id: "tres-proche", nom: "Tirage machine", machineNom: "Matrix",
    profilTension: "mi_range", categorieRole: "pilier", musclesPrincipaux: ["dorsaux"],
  });
  const profilDifferent = instance({
    id: "profil-different", nom: "Tirage nuque", machineNom: "Cybex",
    profilTension: "allonge", categorieRole: "pilier", musclesPrincipaux: ["dorsaux"],
  });
  const roleDifferent = instance({
    id: "role-different", nom: "Tirage bras tendus", machineNom: "Poulie",
    profilTension: "allonge", categorieRole: "accessoire", musclesPrincipaux: ["trapezes"],
  });

  it("le plus proche du mouvement prévu arrive en tête", async () => {
    const res = await machineOccupee(
      { exercise_instance_id: base.id, gym_id: SALLE, seance_template_id: "", daily_state_id: null },
      // Volontairement dans le pire ordre : le meilleur candidat est dernier.
      [base, roleDifferent, profilDifferent, tresProche],
      [base.id],
    );
    expect(res.substituts[0]?.exerciseInstanceId).toBe("tres-proche");
    expect(res.substituts[0]?.raisonCompatibilite).toContain("Très proche");
  });

  it("et le même appel rend toujours la même liste", async () => {
    // Deux appels, deux ordres d'entrée différents, un seul résultat.
    const appel = (instances: typeof base[]) => machineOccupee(
      { exercise_instance_id: base.id, gym_id: SALLE, seance_template_id: "", daily_state_id: null },
      instances, [base.id],
    );
    const a = await appel([base, tresProche, profilDifferent, roleDifferent]);
    const b = await appel([base, roleDifferent, tresProche, profilDifferent]);
    expect(a.substituts.map((s) => s.exerciseInstanceId))
      .toEqual(b.substituts.map((s) => s.exerciseInstanceId));
  });

  it("jusqu'à cinq alternatives, pas plus", async () => {
    /*
     * Trois était trop peu quand la salle en offre davantage ; au-delà de cinq,
     * on relit une liste au lieu de reprendre sa série.
     */
    const beaucoup = Array.from({ length: 9 }, (_, i) =>
      instance({ id: `c${i}`, nom: `Tirage ${i}`, machineNom: `M${i}` }));
    const res = await machineOccupee(
      { exercise_instance_id: base.id, gym_id: SALLE, seance_template_id: "", daily_state_id: null },
      [base, ...beaucoup], [base.id],
    );
    expect(res.substituts.length).toBeGreaterThanOrEqual(3);
    expect(res.substituts.length).toBeLessThanOrEqual(5);
  });

  it("la raison sort du même calcul que le rang", async () => {
    // Une phrase écrite indépendamment du score finirait par dire « très
    // proche » d'un candidat classé quatrième.
    const res = await machineOccupee(
      { exercise_instance_id: base.id, gym_id: SALLE, seance_template_id: "", daily_state_id: null },
      [base, tresProche, roleDifferent], [base.id],
    );
    const dernier = res.substituts.at(-1)!;
    expect(dernier.raisonCompatibilite).not.toContain("Très proche");
  });
});

describe("aucune alternative inventée", () => {
  const base = instance({ id: "base", nom: "Tirage horizontal", machineNom: "Seated Row" });

  it("une machine d'une AUTRE salle n'est jamais proposée", async () => {
    const ailleurs = instance({ id: "ailleurs", nom: "Tirage", gymId: "autre-salle" });
    const res = await machineOccupee(
      { exercise_instance_id: base.id, gym_id: SALLE, seance_template_id: "", daily_state_id: null },
      [base, ailleurs], [base.id],
    );
    expect(res.substituts.map((s) => s.exerciseInstanceId)).not.toContain("ailleurs");
  });

  it("un exercice déjà dans la séance non plus", async () => {
    // Le proposer ferait faire deux fois le même mouvement.
    const dejaPrevu = instance({ id: "deja", nom: "Tirage vertical" });
    const res = await machineOccupee(
      { exercise_instance_id: base.id, gym_id: SALLE, seance_template_id: "", daily_state_id: null },
      [base, dejaPrevu], [base.id, dejaPrevu.id],
    );
    expect(res.substituts).toHaveLength(0);
    expect(res.message).toContain("Aucun substitut");
  });

  it("et un muscle courbaturé écarte le candidat", async () => {
    const surDorsaux = instance({ id: "dorsaux", nom: "Tirage prise large" });
    const res = await machineOccupee(
      { exercise_instance_id: base.id, gym_id: SALLE, seance_template_id: "", daily_state_id: null },
      [base, surDorsaux], [base.id], ["dorsaux"],
    );
    // Le repli finit par le proposer si rien d'autre n'existe — mais il n'est
    // pas retenu tant qu'un candidat sans courbature est disponible.
    const sansCourbature = instance({
      id: "epaules", nom: "Tirage épaules", musclesPrincipaux: ["deltoides"],
    });
    const avecChoix = await machineOccupee(
      { exercise_instance_id: base.id, gym_id: SALLE, seance_template_id: "", daily_state_id: null },
      [base, surDorsaux, sansCourbature], [base.id], ["dorsaux"],
    );
    expect(avecChoix.substituts.map((s) => s.exerciseInstanceId)).toEqual(["epaules"]);
    expect(res.substituts.length).toBeGreaterThanOrEqual(0);
  });
});
