/**
 * Les symptômes généraux — la troisième notion, et la seule qui manquait.
 *
 * LE DÉFAUT TERRAIN
 *
 * Le 6 septembre, pendant Calibration B, l'utilisateur a signalé un léger mal
 * de tête. L'application n'avait aucun endroit où le mettre. Les trois cases
 * existantes ne conviennent pas, et les y forcer aurait été pire que de ne
 * rien consigner :
 *
 *   COURBATURE          état d'un MUSCLE, alimente la récupération musculaire.
 *                       Un mal de tête n'est pas un muscle.
 *   DOULEUR D'EXERCICE  localisée anatomiquement, liée à un geste, peut créer
 *                       une contrainte et écarter des exercices. Y ranger un
 *                       mal de tête aurait retiré des exercices au hasard.
 *   ÉNERGIE             une intensité sur une seule dimension. Une nausée à
 *                       6/10 n'est pas « énergie 4 ».
 *
 * Un symptôme général est donc un ÉTAT GLOBAL : pas de muscle, pas de zone,
 * pas d'exercice, et jamais de contrainte.
 *
 * CE QUE CE RÉFÉRENTIEL N'EST PAS
 *
 * Ce n'est pas une nomenclature médicale. Il n'y a ici ni migraine, ni
 * hypoglycémie, ni infection : ce sont des DIAGNOSTICS, et l'application n'est
 * pas en position d'en poser un. Ce qu'on nomme, c'est ce que la personne
 * ressent et sait dire elle-même, et « autre » existe précisément pour que la
 * liste n'ait pas à prétendre être complète.
 */

export const SYMPTOMES_GENERAUX = [
  { valeur: "mal_de_tete", libelle: "Mal de tête" },
  { valeur: "nausee", libelle: "Nausée" },
  { valeur: "vertige", libelle: "Vertige" },
  { valeur: "malaise", libelle: "Sensation de malaise" },
  { valeur: "essoufflement_inhabituel", libelle: "Essoufflement inhabituel" },
  { valeur: "autre", libelle: "Autre symptôme général" },
] as const;

export type SymptomeGeneral = (typeof SYMPTOMES_GENERAUX)[number]["valeur"];

const PAR_VALEUR = new Map<string, string>(
  SYMPTOMES_GENERAUX.map((s) => [s.valeur, s.libelle]),
);

export function estSymptomeGeneral(valeur: unknown): valeur is SymptomeGeneral {
  return typeof valeur === "string" && PAR_VALEUR.has(valeur);
}

/** Le libellé français, ou la valeur brute si elle vient d'une version future. */
export function libelleSymptome(valeur: string): string {
  return PAR_VALEUR.get(valeur) ?? valeur;
}

/**
 * Où le symptôme a été déclaré.
 *
 * Deux moments, et la distinction porte une conséquence réelle : celui d'avant
 * la séance peut faire proposer un allègement AVANT de commencer ; celui de
 * pendant ne réécrit pas rétroactivement le feu biologique du matin, il agit
 * sur la suite. Voir `lib/engine/symptome-general.ts`.
 */
export const MOMENTS_SYMPTOME = ["avant_seance", "pendant_seance"] as const;
export type MomentSymptome = (typeof MOMENTS_SYMPTOME)[number];

/**
 * La longueur maximale d'une note.
 *
 * Une note sert à préciser en passant — « depuis ce matin », « après le café ».
 * Bornée, parce qu'un champ libre sans limite dans une colonne `jsonb` finit
 * par recevoir un récit, et qu'un récit dans un contexte envoyé à un modèle
 * n'est plus une donnée d'entraînement.
 */
export const NOTE_SYMPTOME_MAX = 200;

/** Un symptôme tel qu'il est déclaré, et tel qu'il est stocké. */
export interface SymptomeDeclare {
  symptome: SymptomeGeneral;
  /** 1 à 10, déclaré par la personne. Jamais déduit. */
  intensite: number;
  /** Facultative, et bornée. Absente plutôt que vide. */
  note?: string;
  moment: MomentSymptome;
}
