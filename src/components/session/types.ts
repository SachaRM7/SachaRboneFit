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
  chargeSuggeree?: number | null;
  repsSuggerees?: number[] | null;
  messageProgression?: string | null;
  raisonSubstitution?: string | null;
  historique?: { charge: number; reps: number }[];
}
