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

const MUSCLES: Record<string, string> = {
  pectoraux: "Pectoraux",
  dorsaux: "Dorsaux",
  trapezes: "Trapèzes",
  epaules: "Épaules",
  epaule_ant: "Épaule antérieure",
  epaule_lat: "Épaule latérale",
  epaule_post: "Épaule postérieure",
  biceps: "Biceps",
  triceps: "Triceps",
  avant_bras: "Avant-bras",
  quadriceps: "Quadriceps",
  ischios: "Ischio-jambiers",
  fessiers: "Fessiers",
  mollets: "Mollets",
  lombaires: "Lombaires",
  abdominaux: "Abdominaux",
  obliques: "Obliques",
  adducteurs: "Adducteurs",
  abducteurs: "Abducteurs",
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

/** Liste de muscles rendue lisible d'un coup. */
export const libelleMuscles = (valeurs: string[] | null | undefined) =>
  valeurs?.length ? valeurs.map(libelleMuscle).join(", ") : "—";
