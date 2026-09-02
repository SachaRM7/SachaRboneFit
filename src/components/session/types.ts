import type { MotifProgression } from "@/lib/engine/double-progression";
/**
 * Description d'un exercice tel qu'il est prescrit pour la séance du jour.
 *
 * Ce type vivait dans `BlocExercice`, le composant qui affichait un exercice à
 * la fois. Cet écran ayant été remplacé par un tableau de séries, le type est
 * isolé ici pour ne plus dépendre d'un composant supprimé.
 */

export interface ExercicePrescrit {
  id: string;
  planItemId?: string;
  nom: string;
  /**
   * Le MOUVEMENT, distinct de `id` qui désigne l'appareil.
   *
   * La fiche technique et le tempo par défaut appartiennent à l'exercice ;
   * les réglages et la note, au couple personne × appareil. Sans cet
   * identifiant, l'écran ne saurait pas où chercher la première moitié.
   */
  exerciseId?: string | null;
  machineNom: string;
  slug?: string | null;
  seriesCibles: number;
  seriesPrevuesAvantAjustement?: number | null;
  fourchetteRepsMin: number;
  fourchetteRepsMax: number;
  rpeCible?: number | null;
  tempo?: string | null;
  reposSecondes?: number | null;
  incrementsPossibles: number[];
  poidsNonCompte?: number | null;
  /** Ce que le nombre saisi signifie sur cet appareil. */
  conventionCharge?: string | null;
  natureCharge?: string | null;
  chargeSuggeree?: number | null;
  repsSuggerees?: number[] | null;
  messageProgression?: string | null;
  /** La nature de `messageProgression`, pour la peindre sans la relire. */
  motifProgression?: MotifProgression | null;
  raisonSubstitution?: string | null;
  historique?: { charge: number; reps: number }[];
}
