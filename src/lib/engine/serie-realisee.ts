import type { NatureCharge } from "./charges";

/**
 * Qu'est-ce qu'une série RÉALISÉE ?
 *
 * La question n'avait pas de réponse unique, et l'application en payait le
 * prix partout. La clôture de séance ne demandait que
 *
 *     s.repsEffectuees !== null && s.charge !== null
 *
 * Zéro n'est pas `null` : une série à 0 répétition et 0 kilo passait ce filtre,
 * s'inscrivait en base, comptait dans le volume, nourrissait la double
 * progression, remontait dans les records et déclenchait des alertes de
 * progression. Une séance de test entièrement remplie de zéros produisait
 * « 17 séries, 0 kg de volume » — et une suggestion de monter la charge.
 *
 * Une série réalisée est une série qui a EU LIEU. Ce module en donne la
 * définition, une seule fois, pour le client comme pour le serveur.
 *
 * La règle ne peut pas être « charge > 0 » partout : elle dépend de ce que la
 * charge MESURE sur cet appareil.
 *
 *   résistance          la charge résiste, et zéro veut dire que rien n'a été
 *                       soulevé — la série n'a pas eu lieu.
 *   assistance          la machine aide ; zéro est l'aboutissement, pas
 *                       l'absence. Une traction sans aucune assistance est la
 *                       meilleure série possible.
 *   sans_charge         le poids du corps ; la colonne vaut zéro par
 *                       convention, et seules les répétitions comptent.
 *
 * Les répétitions, elles, ne se négocient pas : aucune convention ne rend une
 * série de zéro répétition réalisée.
 */

export interface SerieCandidate {
  repsEffectuees: number | null | undefined;
  charge: number | null | undefined;
  rpeEffectif?: number | null;
}

export interface ConventionDeLaSerie {
  conventionCharge?: string | null;
  natureCharge?: NatureCharge | string | null;
}

export type MotifSerieInvalide =
  | "reps_absentes"
  | "reps_nulles"
  | "charge_absente"
  | "charge_nulle";

export const LIBELLES_MOTIF_INVALIDE: Record<MotifSerieInvalide, string> = {
  reps_absentes: "Indique le nombre de répétitions.",
  reps_nulles: "Une série sans répétition n'a pas eu lieu.",
  charge_absente: "Indique la charge utilisée.",
  charge_nulle: "Une charge à zéro ne peut pas être une série réalisée.",
};

/**
 * Une charge de zéro est-elle une valeur légitime sur cet appareil ?
 *
 * Deux cas seulement, et tous deux sont des faits sur le matériel, pas des
 * tolérances : l'assistance qu'on a fini par ne plus demander, et l'exercice
 * qui n'a jamais eu de charge externe.
 */
export function chargeZeroEstLegitime(convention: ConventionDeLaSerie): boolean {
  return convention.natureCharge === "assistance"
    || convention.conventionCharge === "sans_charge";
}

/**
 * Pourquoi cette série n'est pas réalisée — ou `null` si elle l'est.
 *
 * Rendre le motif plutôt qu'un booléen : l'écran doit pouvoir dire ce qui
 * manque, et un refus muet est exactement ce qu'on corrige ici.
 */
export function motifSerieInvalide(
  serie: SerieCandidate,
  convention: ConventionDeLaSerie = {},
): MotifSerieInvalide | null {
  const reps = serie.repsEffectuees;
  if (reps == null || !Number.isFinite(reps)) return "reps_absentes";
  if (reps <= 0) return "reps_nulles";

  const charge = serie.charge;
  if (charge == null || !Number.isFinite(charge)) {
    // Sans charge externe, la colonne vaut zéro par convention et l'écran
    // laisse le champ vide : ne rien saisir est ici la saisie attendue.
    return convention.conventionCharge === "sans_charge" ? null : "charge_absente";
  }
  if (charge < 0) return "charge_nulle";
  if (charge === 0 && !chargeZeroEstLegitime(convention)) return "charge_nulle";

  return null;
}

export function estUneSerieRealisee(
  serie: SerieCandidate,
  convention: ConventionDeLaSerie = {},
): boolean {
  return motifSerieInvalide(serie, convention) === null;
}

/**
 * Plage d'un effort perçu exploitable.
 *
 * Hors plage, la valeur n'est pas une mesure — mais elle n'annule pas la série
 * pour autant : les répétitions ont bien été faites. On jette la donnée
 * douteuse, pas la performance. C'est la même règle que pour une cible non
 * prescrite : une absence de donnée vaut mieux qu'un chiffre inventé.
 */
export const RPE_MIN_EXPLOITABLE = 1;
export const RPE_MAX_EXPLOITABLE = 10;

export function rpeExploitable(rpe: number | null | undefined): number | null {
  if (rpe == null || !Number.isFinite(rpe)) return null;
  return rpe >= RPE_MIN_EXPLOITABLE && rpe <= RPE_MAX_EXPLOITABLE ? rpe : null;
}

/**
 * Filtre partagé par toutes les lectures d'historique.
 *
 * Les séries absurdes déjà en base — celles de la séance de recette du
 * 3 septembre — ne sont pas corrigées : elles restent la trace de ce qui a été
 * saisi. Elles sont simplement écartées de tout calcul, ici, au même endroit
 * pour le volume, la progression, les records et la calibration.
 */
export function seriesRealisees<T extends SerieCandidate>(
  series: T[],
  conventionPour: (serie: T) => ConventionDeLaSerie = () => ({}),
): T[] {
  return series.filter((s) => estUneSerieRealisee(s, conventionPour(s)));
}
