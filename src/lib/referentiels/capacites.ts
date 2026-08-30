import type { Equipement } from "./equipements";

/**
 * Ce qu'une salle possède réellement.
 *
 * Le référentiel des équipements décrit une famille — barre, haltères,
 * machine — et cela suffisait tant que personne ne s'en servait pour décider.
 * Depuis que la disponibilité se déduit du matériel déclaré, « machine » ment :
 * une seule case rendrait faisables vingt-six exercices qui exigent quinze
 * appareils différents. Cocher « machine » parce qu'on a vu une presse
 * proposerait un leg curl absent.
 *
 * Les autres familles n'ont pas ce défaut. Une barre est une barre ; une
 * station de poulies fait l'essentiel du travail à la poulie. Seules les
 * machines se déclinent en appareils qu'on remarque quand ils manquent — et
 * c'est exactement le niveau auquel on inventorie une salle en la parcourant.
 *
 * Une capacité vaut donc ceci : un appareil dont l'absence se voit.
 */

export const CAPACITES = [
  "banc",
  "banc_incline",
  "smith",
  "chest_press",
  "pec_deck",
  "rowing_assis",
  "t_bar",
  "tirage_vertical",
  "leg_press",
  "hack_squat",
  "belt_squat",
  "leg_extension",
  "leg_curl",
  "mollets",
  "abduction_adduction",
  "kickback_fessiers",
  "epaules_machine",
  "elevations_machine",
  "preacher",
] as const;

export type Capacite = (typeof CAPACITES)[number];

export const LIBELLES_CAPACITE: Record<Capacite, string> = {
  banc: "Banc plat",
  banc_incline: "Banc inclinable",
  smith: "Smith machine",
  chest_press: "Chest press",
  pec_deck: "Pec deck / butterfly",
  rowing_assis: "Rowing assis",
  t_bar: "T-bar row",
  tirage_vertical: "Tirage vertical",
  leg_press: "Presse à cuisses",
  hack_squat: "Hack squat",
  belt_squat: "Belt squat",
  leg_extension: "Leg extension",
  leg_curl: "Leg curl",
  mollets: "Machine à mollets",
  abduction_adduction: "Abduction / adduction",
  kickback_fessiers: "Kickback fessiers",
  epaules_machine: "Développé épaules machine",
  elevations_machine: "Élévations latérales machine",
  preacher: "Pupitre à biceps",
};

/**
 * Appareil requis par un exercice, quand la famille ne suffit pas à le dire.
 *
 * Indexé par slug du catalogue. Un exercice absent de cette table se contente
 * de sa famille — c'est le cas de tout ce qui se fait à la barre, aux haltères,
 * à la poulie ou au poids du corps.
 */
export const CAPACITE_PAR_SLUG: Record<string, Capacite> = {
  "machine-chest-press": "chest_press",
  "pec-deck": "pec_deck",
  "reverse-pec-deck": "pec_deck",
  "smith-machine-bench-press": "smith",
  "smith-machine-squat": "smith",
  "smith-machine-hip-thrust": "smith",
  "smith-machine-romanian-deadlift": "smith",
  "chest-supported-row": "rowing_assis",
  "machine-row": "rowing_assis",
  "t-bar-row": "t_bar",
  "belt-squat": "belt_squat",
  "hack-squat": "hack_squat",
  "leg-press": "leg_press",
  "leg-press-calf-raise": "leg_press",
  "hip-abduction-machine": "abduction_adduction",
  "hip-adduction-machine": "abduction_adduction",
  "machine-glute-kickback": "kickback_fessiers",
  "preacher-curl": "preacher",
  "machine-lateral-raise": "elevations_machine",
  "machine-shoulder-press": "epaules_machine",
  "leg-curl": "leg_curl",
  "lying-leg-curl": "leg_curl",
  "seated-leg-curl": "leg_curl",
  "leg-extension": "leg_extension",
  "seated-calf-raise": "mollets",
  "standing-calf-raise": "mollets",
};

/**
 * Ce dont un exercice a besoin : sa capacité si elle est connue, sa famille
 * sinon. Une seule fonction, pour que la saisie et le moteur ne divergent pas.
 */
export function besoinDe(
  slug: string | null | undefined,
  equipement: string | null | undefined,
): string | null {
  if (slug && CAPACITE_PAR_SLUG[slug]) return CAPACITE_PAR_SLUG[slug];
  return equipement ?? null;
}

/** Familles qui se cochent telles quelles, sans se décliner en appareils. */
export const FAMILLES_A_COCHER: Equipement[] = [
  "barre",
  "halteres",
  "poulie",
  "kettlebell",
  "disque",
];

export const EST_UNE_CAPACITE = new Set<string>(CAPACITES);

/**
 * Matériel qu'on transporte.
 *
 * Il ne décrit pas un lieu mais un sac : deux élastiques dans un sac changent
 * ce qui est faisable aujourd'hui, à la salle comme à l'hôtel. Il s'ajoute
 * donc au matériel du lieu au moment de démarrer, sans jamais le modifier —
 * personne ne doit déclarer que la salle possède ses propres élastiques.
 */
export const MATERIEL_PORTABLE = [
  "elastiques",
  "mini_bands",
  "sangles",
  "ceinture_lestee",
  "tapis",
  "corde_a_sauter",
] as const;

export type MaterielPortable = (typeof MATERIEL_PORTABLE)[number];

export const LIBELLES_PORTABLE: Record<MaterielPortable, string> = {
  elastiques: "Élastiques",
  mini_bands: "Mini-bands",
  sangles: "Sangles",
  ceinture_lestee: "Ceinture lestée",
  tapis: "Tapis",
  corde_a_sauter: "Corde à sauter",
};
