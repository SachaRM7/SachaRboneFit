/**
 * Referentiel du materiel.
 *
 * Un exercice ne pouvait etre declare faisable dans une salle qu'en verifiant
 * l'existence d'une exercise_instance : il n'existait aucune notion de type de
 * materiel requis. Ce referentiel la fournit, en reprenant le vocabulaire
 * normalise de la bibliotheque workout-guide.
 */

export const EQUIPEMENTS = [
  "barre",
  "halteres",
  "machine",
  "poulie",
  "poids_du_corps",
  "kettlebell",
  "disque",
] as const;

export type Equipement = (typeof EQUIPEMENTS)[number];

export const LIBELLES_EQUIPEMENT: Record<Equipement, string> = {
  barre: "Barre",
  halteres: "Haltères",
  machine: "Machine",
  poulie: "Poulie",
  poids_du_corps: "Poids du corps",
  kettlebell: "Kettlebell",
  disque: "Disque",
};

const ALIAS: Record<string, Equipement> = {};

function cle(valeur: string): string {
  return valeur
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
}

function alias(equipement: Equipement, ...variantes: string[]) {
  ALIAS[cle(equipement)] = equipement;
  ALIAS[cle(LIBELLES_EQUIPEMENT[equipement])] = equipement;
  for (const v of variantes) ALIAS[cle(v)] = equipement;
}

alias("barre", "barbell", "ez bar", "landmine", "trap bar", "bar");
alias("halteres", "dumbbell", "dumbbells", "db");
alias("machine", "smith machine", "smith", "selectorized", "hack squat");
alias("poulie", "cable", "cables", "pulley");
alias("poids_du_corps", "bodyweight", "assisted bodyweight", "pull-up bar", "pullup bar", "bench", "dip bar");
alias("kettlebell", "kb");
alias("disque", "plate", "plates", "weight plate");

export function versEquipement(valeur: string | null | undefined): Equipement | null {
  if (!valeur) return null;
  return ALIAS[cle(valeur)] ?? null;
}
