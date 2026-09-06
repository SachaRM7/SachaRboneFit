import { TYPES_REGLAGE, type TypeReglage } from "./execution";

/**
 * DÉCLARER qu'un réglage existe sur un appareil, par opposition à lui donner une valeur.
 *
 * `lib/engine/execution.ts` sait valider une VALEUR contre une définition. Il
 * n'existait aucun moyen de créer la définition elle-même : toute
 * l'architecture — `instance_reglages`, `reglages_personnels`, la validation,
 * la fiche d'exécution — attendait des lignes que rien n'écrivait jamais.
 * `contexte.reglages` restait donc vide sur chaque appareil du parc, la section
 * « Réglages » ne se rendait pas, et `enregistrerReglages` aurait refusé toute
 * clé pour « cle_inconnue ». Une infrastructure complète, inatteignable.
 *
 * Ce module est la moitié manquante : il transforme ce qu'une personne tape
 * devant la machine — « Siège », en crans — en une définition partagée.
 *
 * CE QU'IL NE FAIT PAS, ET C'EST L'ESSENTIEL
 *
 * Il n'invente aucune borne. On ne sait pas combien de crans a le siège de
 * cette Seated Row ; personne ici ne le sait avant d'être allé le compter.
 * Un `1–10` posé par défaut serait pire qu'une absence de borne : il refuserait
 * un cran 12 pourtant réel, et donnerait à une supposition l'autorité d'une
 * mesure. `min` et `max` sont donc facultatifs, séparément, et l'absence se
 * propage jusqu'à `validerReglage`, qui ne compare simplement rien.
 *
 * Pour un `choix`, en revanche, les options sont OBLIGATOIRES : une liste
 * fermée vide n'est pas une liste fermée, c'est un champ que rien ne peut
 * satisfaire. Ce n'est pas une borne inventée, c'est ce que la personne vient
 * de lire sur la machine.
 */

/** Un libellé qu'on relit entre deux séries. Au-delà, on ne le lit plus. */
export const LIMITE_LIBELLE_REGLAGE = 40;
export const LIMITE_UNITE_REGLAGE = 8;
export const LIMITE_OPTION_REGLAGE = 24;
export const MIN_OPTIONS_REGLAGE = 2;
export const MAX_OPTIONS_REGLAGE = 8;

/**
 * La clé, dérivée du libellé, en snake_case sans diacritiques.
 *
 * Elle relie une valeur personnelle à sa définition et ne se renomme pas : la
 * renommer orphelinerait les valeurs déjà mémorisées (voir le commentaire de
 * la colonne dans `db/schema.ts`). Elle est donc dérivée UNE fois, à la
 * création, et le libellé peut ensuite changer sans elle.
 *
 * Rend la chaîne vide quand il ne reste rien d'exploitable — « ??? » n'est pas
 * une clé. L'appelant en fait un refus plutôt qu'une clé de repli, qui
 * entrerait en collision avec la prochaine.
 */
export function cleDepuisLibelle(libelle: string): string {
  return libelle
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // retire les diacritiques
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Ce qu'on demande, avant validation : tout arrive en texte de l'écran. */
export interface DeclarationBrute {
  libelle: string;
  type: string;
  /** Facultatives et séparées — voir l'en-tête. Chaîne vide = non renseignée. */
  min?: string | null;
  max?: string | null;
  /** Pour `choix` seulement. */
  options?: string[] | null;
  unite?: string | null;
}

/** Une déclaration acceptable, normalisée pour l'écriture. */
export interface Declaration {
  cle: string;
  libelle: string;
  type: TypeReglage;
  min: number | null;
  max: number | null;
  options: string[] | null;
  unite: string | null;
}

export type RefusDeclaration =
  | { motif: "libelle_vide" }
  | { motif: "libelle_trop_long"; limite: number }
  | { motif: "libelle_sans_cle" }
  | { motif: "type_inconnu" }
  | { motif: "unite_trop_longue"; limite: number }
  | { motif: "borne_pas_un_nombre" }
  | { motif: "borne_non_entiere" }
  | { motif: "bornes_inversees" }
  | { motif: "options_insuffisantes"; minimum: number }
  | { motif: "options_trop_nombreuses"; maximum: number }
  | { motif: "option_trop_longue"; limite: number }
  | { motif: "options_en_double" }
  /** Levé par le service, pas ici : il faut la base pour le savoir. */
  | { motif: "cle_existante"; libelle: string };

export type ValidationDeclaration =
  | { valide: true; declaration: Declaration }
  | { valide: false; refus: RefusDeclaration };

/** `null` quand rien n'est saisi ; sinon le nombre, ou `NaN` s'il est illisible. */
function nombreOuRien(brut: string | null | undefined): number | null {
  if (brut == null) return null;
  const propre = brut.trim();
  if (propre === "") return null;
  return Number(propre.replace(",", "."));
}

/**
 * Une déclaration est-elle acceptable, et sous quelle forme s'écrit-elle ?
 *
 * Les champs sans rapport avec le type ne sont pas refusés mais NORMALISÉS à
 * `null` : une borne minimale envoyée avec un `choix` ne décrit rien, la
 * stocker inviterait à la lire un jour. Ce n'est pas une correction silencieuse
 * d'une valeur voulue — l'écran ne propose jamais ces champs pour ce type.
 */
export function validerDeclaration(brute: DeclarationBrute): ValidationDeclaration {
  const libelle = brute.libelle.trim().replace(/\s+/g, " ");
  if (libelle === "") return { valide: false, refus: { motif: "libelle_vide" } };
  if (libelle.length > LIMITE_LIBELLE_REGLAGE) {
    return { valide: false, refus: { motif: "libelle_trop_long", limite: LIMITE_LIBELLE_REGLAGE } };
  }

  const cle = cleDepuisLibelle(libelle);
  if (cle === "") return { valide: false, refus: { motif: "libelle_sans_cle" } };

  if (!(TYPES_REGLAGE as readonly string[]).includes(brute.type)) {
    return { valide: false, refus: { motif: "type_inconnu" } };
  }
  const type = brute.type as TypeReglage;

  const unite = (brute.unite ?? "").trim();
  if (unite.length > LIMITE_UNITE_REGLAGE) {
    return { valide: false, refus: { motif: "unite_trop_longue", limite: LIMITE_UNITE_REGLAGE } };
  }

  if (type === "choix") {
    const options = (brute.options ?? []).map((o) => o.trim()).filter((o) => o !== "");
    if (options.length < MIN_OPTIONS_REGLAGE) {
      return { valide: false, refus: { motif: "options_insuffisantes", minimum: MIN_OPTIONS_REGLAGE } };
    }
    if (options.length > MAX_OPTIONS_REGLAGE) {
      return { valide: false, refus: { motif: "options_trop_nombreuses", maximum: MAX_OPTIONS_REGLAGE } };
    }
    if (options.some((o) => o.length > LIMITE_OPTION_REGLAGE)) {
      return { valide: false, refus: { motif: "option_trop_longue", limite: LIMITE_OPTION_REGLAGE } };
    }
    // Deux options identiques rendraient le choix ambigu à la relecture : on ne
    // saurait pas laquelle a été retenue.
    if (new Set(options).size !== options.length) {
      return { valide: false, refus: { motif: "options_en_double" } };
    }
    return {
      valide: true,
      declaration: { cle, libelle, type, min: null, max: null, options, unite: unite || null },
    };
  }

  if (type === "texte") {
    return {
      valide: true,
      declaration: { cle, libelle, type, min: null, max: null, options: null, unite: unite || null },
    };
  }

  // `cran` et `degres` : les bornes sont facultatives, chacune de son côté.
  // Une machine dont on a compté les crans en porte deux ; une dont on n'a rien
  // compté n'en porte aucune, et c'est un état parfaitement légitime.
  const min = nombreOuRien(brute.min);
  const max = nombreOuRien(brute.max);
  for (const borne of [min, max]) {
    if (borne === null) continue;
    if (!Number.isFinite(borne)) return { valide: false, refus: { motif: "borne_pas_un_nombre" } };
    if (type === "cran" && !Number.isInteger(borne)) {
      return { valide: false, refus: { motif: "borne_non_entiere" } };
    }
  }
  if (min !== null && max !== null && min > max) {
    return { valide: false, refus: { motif: "bornes_inversees" } };
  }

  return {
    valide: true,
    declaration: { cle, libelle, type, min, max, options: null, unite: unite || null },
  };
}

/** Message destiné à la personne devant la machine, pas au journal d'erreurs. */
export function messageDeRefusDeclaration(refus: RefusDeclaration): string {
  switch (refus.motif) {
    case "libelle_vide":
      return "Donne un nom à ce réglage.";
    case "libelle_trop_long":
      return `Nom trop long : ${refus.limite} caractères au maximum.`;
    case "libelle_sans_cle":
      return "Ce nom ne contient aucune lettre ni chiffre.";
    case "type_inconnu":
      return "Ce type de réglage n'existe pas.";
    case "unite_trop_longue":
      return `Unité trop longue : ${refus.limite} caractères au maximum.`;
    case "borne_pas_un_nombre":
      return "Les bornes doivent être des nombres — ou rester vides.";
    case "borne_non_entiere":
      return "Un cran s'écrit en nombre entier.";
    case "bornes_inversees":
      return "La borne minimale dépasse la borne maximale.";
    case "options_insuffisantes":
      return `Un choix demande au moins ${refus.minimum} valeurs possibles.`;
    case "options_trop_nombreuses":
      return `Pas plus de ${refus.maximum} valeurs possibles.`;
    case "option_trop_longue":
      return `Chaque valeur tient en ${refus.limite} caractères.`;
    case "options_en_double":
      return "Deux valeurs identiques dans la liste.";
    case "cle_existante":
      return `« ${refus.libelle} » est déjà décrit sur cet appareil.`;
  }
}

/**
 * Des noms fréquents, pour éviter de tout taper au clavier en salle.
 *
 * Ce sont des LIBELLÉS et un type probable, rien d'autre : aucune borne, aucune
 * option. Proposer « Siège, 1 à 10 » ferait exactement ce que ce module refuse
 * — donner à une supposition la forme d'une mesure. La personne reste seule à
 * savoir ce que porte l'appareil devant elle.
 */
export const LIBELLES_COURANTS: ReadonlyArray<{ libelle: string; type: TypeReglage }> = [
  { libelle: "Siège", type: "cran" },
  { libelle: "Dossier", type: "cran" },
  { libelle: "Hauteur de poulie", type: "cran" },
  { libelle: "Inclinaison du banc", type: "degres" },
  { libelle: "Cale-cuisses", type: "cran" },
  { libelle: "Repose-pieds", type: "cran" },
  { libelle: "Amplitude", type: "cran" },
  { libelle: "Poignée", type: "choix" },
  { libelle: "Poignées d'assistance", type: "choix" },
  { libelle: "Accessoire", type: "choix" },
  { libelle: "Placement", type: "texte" },
  { libelle: "Distance", type: "texte" },
];
