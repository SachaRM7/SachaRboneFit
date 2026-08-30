/**
 * Réserve de répétitions.
 *
 * L'écran de séance demandait un RPE : un nombre de 6 à 10, sur une échelle
 * qu'il faut avoir apprise. « Combien aurais-tu pu en faire de plus ? » demande
 * la même information et se répond sans échelle, surtout après des mois
 * d'arrêt — c'est la question qui fait tout le travail de la calibration.
 *
 * La conversion existait déjà, écrite à la main, dans les outils du coach.
 * Elle est ici pour que la saisie et la lecture ne divergent jamais.
 */

/** Le plus grand nombre proposé est un « ou plus » : au-delà, la mesure ne dit plus rien d'utile. */
export const RESERVE_MAX = 5;

export const CHOIX_RESERVE = [0, 1, 2, 3, 4, 5] as const;

export const LIBELLES_RESERVE: Record<number, string> = {
  0: "Aucune, j'étais à bout",
  1: "1 de plus",
  2: "2 de plus",
  3: "3 de plus",
  4: "4 de plus",
  5: "5 ou plus",
};

/** RPE 10 = plus rien en réserve. Le plancher à 5 évite un RPE négatif. */
export function reserveVersRpe(reserve: number): number {
  const bornee = Math.min(RESERVE_MAX, Math.max(0, Math.round(reserve)));
  return 10 - bornee;
}

export function rpeVersReserve(rpe: number | null | undefined): number | null {
  if (rpe == null || !Number.isFinite(rpe)) return null;
  return Math.min(RESERVE_MAX, Math.max(0, Math.round(10 - rpe)));
}

/**
 * Une série exploitable pour fixer une charge de travail.
 *
 * Au-delà de quatre répétitions en réserve, la série n'a pas assez chargé le
 * muscle pour dire quoi que ce soit de la charge de travail : on l'enregistre,
 * mais on ne s'en sert pas pour décider.
 */
export function reserveExploitable(reserve: number | null): boolean {
  return reserve !== null && reserve <= 4;
}
