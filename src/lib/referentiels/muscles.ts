/**
 * Referentiel musculaire unique de l'application.
 *
 * Il existait auparavant TROIS vocabulaires incompatibles :
 *   - la base            : "pecs", "dos", "quads", "epaule_ant"...
 *   - la saisie          : "Pectoraux", "Dorsaux", "Quadriceps"...
 *   - le module douleur  : "deltoide anterieur", "vaste medial"...
 *
 * Aucun ne correspondait aux autres, ce qui rendait inoperante toute la chaine
 * courbatures / douleurs -> adaptation de seance : les comparaisons echouaient
 * silencieusement et aucun exercice n'etait jamais exclu.
 *
 * Toute donnee musculaire qui entre dans l'application passe desormais par
 * `versMuscle()`. Le type `Muscle` est la seule valeur acceptee en aval.
 */

export const MUSCLES = [
  "pectoraux",
  "dorsaux",
  "haut_dos",
  "lombaires",
  "epaules",
  "deltoide_posterieur",
  "biceps",
  "triceps",
  "avant_bras",
  "quadriceps",
  "ischios",
  "fessiers",
  "adducteurs",
  "mollets",
  "core",
] as const;

export type Muscle = (typeof MUSCLES)[number];

/** Libelles affiches a l'utilisateur. */
export const LIBELLES: Record<Muscle, string> = {
  pectoraux: "Pectoraux",
  dorsaux: "Dorsaux",
  haut_dos: "Haut du dos",
  lombaires: "Lombaires",
  epaules: "Épaules",
  deltoide_posterieur: "Arrière d'épaule",
  biceps: "Biceps",
  triceps: "Triceps",
  avant_bras: "Avant-bras",
  quadriceps: "Quadriceps",
  ischios: "Ischio-jambiers",
  fessiers: "Fessiers",
  adducteurs: "Adducteurs",
  mollets: "Mollets",
  core: "Abdominaux / gainage",
};

/**
 * Aliases acceptes en entree, tous vocabulaires confondus.
 * La cle est normalisee (minuscules, sans accent, sans separateur) par `cle()`.
 */
const ALIAS: Record<string, Muscle> = {};

function cle(valeur: string): string {
  return valeur
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // retire les diacritiques
    .replace(/[^a-z]/g, "");
}

function alias(muscle: Muscle, ...variantes: string[]) {
  ALIAS[cle(muscle)] = muscle;
  ALIAS[cle(LIBELLES[muscle])] = muscle;
  for (const v of variantes) ALIAS[cle(v)] = muscle;
}

// Ancien vocabulaire base + saisie + bibliotheque workout-guide + zones de douleur.
alias("pectoraux", "pecs", "pectoral", "grand pectoral", "chest", "poitrine");
alias("dorsaux", "lats", "grand dorsal", "dorsal", "dos");
alias("haut_dos", "upper back", "back", "trapezes", "trapeze", "rhomboides", "milieu du dos");
alias("lombaires", "lower back", "bas du dos", "erecteurs", "erecteurs du rachis");
alias("epaules", "epaule", "epaule_ant", "epaule_lat", "deltoide", "deltoide anterieur", "deltoide lateral", "shoulders", "shoulder");
alias("deltoide_posterieur", "epaule_post", "rear delts", "rear delt", "deltoide posterieur", "rotateurs", "coiffe");
alias("biceps", "biceps brachial", "brachial");
alias("triceps", "triceps brachial");
alias("avant_bras", "avant bras", "forearms", "forearm", "grip", "poignet", "fléchisseurs", "extenseurs");
alias("quadriceps", "quads", "quad", "vaste medial", "vaste lateral", "droit femoral", "cuisse", "genou");
alias("ischios", "ischio", "ischio-jambiers", "ischio jambiers", "hamstrings", "biceps femoral", "semi-tendineux", "semi-membraneux");
alias("fessiers", "fessier", "glutes", "glute", "hips", "hanche", "grand fessier");
alias("adducteurs", "adducteur", "adductors", "groin", "aine");
alias("mollets", "mollet", "calves", "calf", "gastrocnemien", "soleaire", "cheville");
alias("core", "abdominaux", "abdos", "abs", "gainage", "sangle abdominale", "obliques");

/**
 * Convertit une valeur brute (base historique, saisie, bibliotheque externe)
 * en muscle du referentiel. Renvoie `null` si la valeur est inconnue :
 * l'appelant decide quoi en faire plutot que de laisser passer une donnee muette.
 */
export function versMuscle(valeur: string | null | undefined): Muscle | null {
  if (!valeur) return null;
  return ALIAS[cle(valeur)] ?? null;
}

/** Convertit une liste, en ecartant silencieusement les valeurs inconnues. */
export function versMuscles(valeurs: readonly (string | null | undefined)[] | null | undefined): Muscle[] {
  if (!valeurs) return [];
  const vus = new Set<Muscle>();
  for (const v of valeurs) {
    const m = versMuscle(v);
    if (m) vus.add(m);
  }
  return [...vus];
}

/** Vrai si la valeur brute designe ce muscle, quel que soit son vocabulaire d'origine. */
export function memeMuscle(a: string | null | undefined, b: string | null | undefined): boolean {
  const ma = versMuscle(a);
  return ma !== null && ma === versMuscle(b);
}

/** Zones de douleur proposees a l'utilisateur, et le muscle qu'elles impliquent. */
export const ZONES_DOULEUR = [
  // La nuque manquait, et c'est une des zones les plus fréquemment gênées en
  // salle. Elle pointe vers le haut du dos : le vocabulaire musculaire du
  // moteur n'a pas d'entrée cervicale, et en inventer une se propagerait
  // jusqu'au calcul de volume pour un gain nul.
  { zone: "Nuque / cervicales", muscles: ["haut_dos", "epaules"] },
  { zone: "Épaule", muscles: ["epaules", "deltoide_posterieur"] },
  { zone: "Haut du dos", muscles: ["haut_dos", "dorsaux"] },
  { zone: "Pectoraux", muscles: ["pectoraux"] },
  { zone: "Coude", muscles: ["biceps", "triceps"] },
  { zone: "Avant-bras", muscles: ["avant_bras"] },
  { zone: "Poignet", muscles: ["avant_bras"] },
  { zone: "Bas du dos", muscles: ["lombaires"] },
  { zone: "Sangle abdominale", muscles: ["core"] },
  { zone: "Hanche", muscles: ["fessiers", "adducteurs"] },
  { zone: "Aine / adducteurs", muscles: ["adducteurs"] },
  { zone: "Fessiers", muscles: ["fessiers"] },
  { zone: "Quadriceps", muscles: ["quadriceps"] },
  { zone: "Ischios", muscles: ["ischios"] },
  { zone: "Genou", muscles: ["quadriceps", "ischios"] },
  { zone: "Mollets", muscles: ["mollets"] },
  { zone: "Cheville", muscles: ["mollets"] },
] as const satisfies readonly { zone: string; muscles: readonly Muscle[] }[];

export type ZoneDouleur = (typeof ZONES_DOULEUR)[number]["zone"];

/** Muscles impliques par une zone de douleur. */
export function musclesDeLaZone(zone: string): Muscle[] {
  const trouve = ZONES_DOULEUR.find((z) => cle(z.zone) === cle(zone));
  return trouve ? [...trouve.muscles] : versMuscles([zone]);
}
