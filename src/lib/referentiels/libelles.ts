import { LIBELLES as LIBELLES_MUSCLES } from "./muscles";

/**
 * Libellés lisibles des valeurs du modèle.
 *
 * L'interface affichait directement les valeurs stockées — « mi_range »,
 * « pile_affichee », « polyarticulaire » — c'est-à-dire le vocabulaire de la
 * base, pas celui de l'utilisateur. Les tables de conversion existaient déjà
 * pour les machines, mais isolées dans un seul écran ; le reste de
 * l'application montrait la valeur brute.
 *
 * Toute valeur inconnue est renvoyée telle quelle plutôt que masquée : mieux
 * vaut un libellé technique visible qu'un champ vide.
 */

const PROFILS_TENSION: Record<string, string> = {
  stretch: "Étiré",
  mi_range: "Mi-course",
  contract: "Contracté",
};

const TYPES_MOUVEMENT: Record<string, string> = {
  polyarticulaire: "Polyarticulaire",
  isolation: "Isolation",
};

const CATEGORIES_ROLE: Record<string, string> = {
  pilier: "Pilier",
  substitut: "Substitut",
  accessoire: "Accessoire",
};

const EQUIPEMENTS: Record<string, string> = {
  barre: "Barre",
  halteres: "Haltères",
  machine: "Machine",
  poulie: "Poulie",
  poids_du_corps: "Poids du corps",
  elastique: "Élastique",
  kettlebell: "Kettlebell",
};

/**
 * Les muscles ont leur propre référentiel : cette table en tenait une copie,
 * dont il manquait `haut_dos`, `deltoide_posterieur` et `core` — ces trois-là
 * s'affichaient donc en clé brute dans l'application. Elle contenait à
 * l'inverse des entrées (`abdominaux`, `obliques`, `abducteurs`, `trapezes`)
 * qui n'existent pas dans le modèle.
 *
 * Une seule source, donc, et pas de copie à maintenir.
 */
const MUSCLES: Record<string, string> = LIBELLES_MUSCLES;

/**
 * Piliers du mouvement.
 *
 * « P1_poussee » est une clé de tri autant qu'un nom : le préfixe ordonne les
 * piliers dans le moteur. Il n'a rien à faire à l'écran, où seul le geste
 * compte. La table vivait en double dans l'écran Programme.
 */
const PILIERS: Record<string, string> = {
  P1_poussee: "Poussée",
  P2_tirage: "Tirage",
  P3_squat: "Squat",
  P4_hanche: "Hanche",
  epaules: "Épaules",
  jambes_iso: "Jambes",
  bras_triceps: "Triceps",
  bras_biceps: "Biceps",
  core: "Gainage",
};

/**
 * Feu biologique du jour.
 *
 * « vert », « orange », « rouge » sont lisibles, mais ce ne sont pas des
 * phrases : ce qu'ils signifient pour la séance du jour l'est.
 */
const FEUX: Record<string, string> = {
  vert: "Prêt",
  orange: "Récupération moyenne",
  rouge: "Fatigue marquée",
};


function traduire(table: Record<string, string>, valeur: string | null | undefined): string {
  if (!valeur) return "—";
  return table[valeur] ?? valeur;
}

export const libelleProfilTension = (v: string | null | undefined) => traduire(PROFILS_TENSION, v);
export const libelleTypeMouvement = (v: string | null | undefined) => traduire(TYPES_MOUVEMENT, v);
export const libelleCategorieRole = (v: string | null | undefined) => traduire(CATEGORIES_ROLE, v);
export const libelleEquipement = (v: string | null | undefined) => traduire(EQUIPEMENTS, v);
export const libelleMuscle = (v: string | null | undefined) => traduire(MUSCLES, v);
export const libellePilier = (v: string | null | undefined) => traduire(PILIERS, v);
export const libelleFeu = (v: string | null | undefined) => traduire(FEUX, v);

/** Liste de muscles rendue lisible d'un coup. */
export const libelleMuscles = (valeurs: string[] | null | undefined) =>
  valeurs?.length ? valeurs.map(libelleMuscle).join(", ") : "—";
