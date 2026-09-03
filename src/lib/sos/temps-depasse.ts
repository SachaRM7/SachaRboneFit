import type { TempsDepasseResult, ExerciceRestant } from "./types";

/**
 * Ce qu'il reste à faire, et ce que ça coûterait en temps.
 *
 * L'ancienne version disait « Temps OK après recalcul » à quelqu'un affiché à
 * 105 minutes pour une cible de 60. Le défaut était dans la comparaison : elle
 * confrontait le travail restant au DÉPASSEMENT déjà accumulé
 *
 *     temps_disponible = cible - ecoulee            // négatif quand on dépasse
 *     if (restant <= Math.abs(temps_disponible))    // « OK »
 *
 * autrement dit : « il reste moins de travail que le retard déjà pris, donc
 * tout va bien ». Plus on dépassait, plus il devenait facile d'être déclaré
 * dans les temps. À 105 minutes sur 60, n'importe quelle fin de séance passait.
 *
 * Ce module ne compare plus qu'à une chose : le temps qui reste avant la borne.
 * Il ne coupe rien de lui-même et ne conclut jamais « il faut arrêter » — il
 * dit ce que ça coûte, et ce qu'on gagnerait à retirer quoi. La décision reste
 * à l'athlète, qui est le seul à savoir de combien de temps il dispose vraiment.
 */

/** Une série dure une série. Le reste du temps d'un exercice, c'est du repos. */
const TEMPS_SERIE_SEC = 45;

/** Repos retenu quand le gabarit n'en prescrit aucun — même valeur qu'au plan. */
const REPOS_PAR_DEFAUT_SEC = 120;

export interface CoutDUnExercice {
  exercise_instance_id: string;
  nom: string;
  categorie_role: "pilier" | "substitut" | "accessoire";
  ordre: number;
  /** Séries qu'il reste à faire dessus. */
  seriesRestantes: number;
  secondes: number;
}

/**
 * Le temps que coûte encore chaque exercice.
 *
 * L'estimation comptait UNE série par exercice, quel qu'il soit : un exercice
 * de quatre séries et un de une pesaient pareil. Elle compte maintenant les
 * séries qui restent, et le repos réellement prescrit sur cette machine.
 */
export function coutDesExercicesRestants(
  exercices: ExerciceRestant[],
  seriesRestantesPar: Record<string, number> = {},
  reposSecondesPar: Record<string, number> = {},
): CoutDUnExercice[] {
  return exercices
    .map((ex) => {
      const series = Math.max(0, seriesRestantesPar[ex.exercise_instance_id] ?? 1);
      const repos = reposSecondesPar[ex.exercise_instance_id] ?? REPOS_PAR_DEFAUT_SEC;
      return {
        exercise_instance_id: ex.exercise_instance_id,
        nom: ex.nom,
        categorie_role: ex.categorie_role,
        ordre: ex.ordre ?? 0,
        seriesRestantes: series,
        secondes: series * (TEMPS_SERIE_SEC + repos),
      };
    })
    .sort((a, b) => a.ordre - b.ordre);
}

/**
 * Ce qu'on retirerait, et dans quel ordre.
 *
 * Les accessoires d'abord, en commençant par la fin de séance : ce sont eux
 * qu'on sacrifie en premier quand le temps manque, et les derniers sont ceux
 * dont l'absence pèse le moins sur l'équilibre de la séance. Les piliers ne
 * sont jamais proposés — retirer un pilier, ce n'est plus gérer le temps,
 * c'est changer la séance.
 */
export function tempsDepasse(
  duree_actuelle_min: number,
  duree_cible_min: number,
  exercices_restants: ExerciceRestant[],
  repos_secondes_by_exercice: Record<string, number> = {},
  series_restantes_by_exercice: Record<string, number> = {},
): TempsDepasseResult {
  const couts = coutDesExercicesRestants(
    exercices_restants, series_restantes_by_exercice, repos_secondes_by_exercice,
  );
  const restantSec = couts.reduce((total, c) => total + c.secondes, 0);
  const finEstimeeMin = Math.ceil(duree_actuelle_min + restantSec / 60);

  // Le seul repère qui compte : où l'on arriverait en finissant tout.
  if (finEstimeeMin <= duree_cible_min) {
    return {
      exercices_coupes: [],
      temps_estime_apres_coupe_min: finEstimeeMin,
      message: `En finissant tout, tu termines vers ${finEstimeeMin} min — dans ta cible de ${duree_cible_min} min.`,
    };
  }

  const coupes: string[] = [];
  let projectionSec = restantSec;

  const sacrifiables = couts
    .filter((c) => c.categorie_role === "accessoire")
    .reverse();

  for (const candidat of sacrifiables) {
    if (duree_actuelle_min + projectionSec / 60 <= duree_cible_min) break;
    coupes.push(candidat.nom);
    projectionSec -= candidat.secondes;
  }

  const apresMin = Math.ceil(duree_actuelle_min + projectionSec / 60);

  if (coupes.length === 0) {
    return {
      exercices_coupes: [],
      temps_estime_apres_coupe_min: finEstimeeMin,
      message: `En finissant tout, tu termines vers ${finEstimeeMin} min, au-delà de ta cible de `
        + `${duree_cible_min} min. Il ne reste que des exercices principaux : les retirer changerait `
        + `la séance, pas seulement sa durée.`,
    };
  }

  return {
    exercices_coupes: coupes,
    temps_estime_apres_coupe_min: apresMin,
    message: `Sans ${coupes.join(", ")}, tu termines vers ${apresMin} min au lieu de ${finEstimeeMin}.`,
  };
}
