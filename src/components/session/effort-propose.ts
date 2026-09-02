/**
 * Ce que la séance propose comme effort, avant toute saisie.
 *
 * Le tableau de séries pré-remplissait la colonne RPE avec
 *
 *     Math.max(6, (exercice.rpeCible ?? 8) - rpeReduction)
 *
 * et cette valeur partait en base à la validation, que la personne l'ait
 * touchée ou non. Un exercice sans cible d'effort — le cas de tous ceux que
 * propose le Coach — produisait donc, série après série, des `rpe_effectif`
 * de 8 que personne n'avait ressentis ni saisis. L'historique était plein
 * d'une valeur inventée, et rien ne permettait de la distinguer d'un vrai 8.
 *
 * La règle tient en une phrase : sans cible, rien n'est proposé, et une
 * absence de saisie reste une absence de donnée.
 */

/** Plancher de l'effort proposé : une réduction ne descend pas plus bas. */
export const RPE_PROPOSE_MINIMUM = 6;

/**
 * L'effort proposé pour une série, ou `null` s'il n'y a rien à proposer.
 *
 * `rpeReduction` module une prescription existante — les jours où la fatigue
 * accumulée justifie de viser moins dur. Elle ne peut pas en fabriquer une :
 * réduire un effort qui n'a jamais été prescrit ne veut rien dire, et le
 * résultat serait indiscernable d'une cible choisie.
 */
export function effortPropose(
  rpeCible: number | null | undefined,
  rpeReduction: number,
): number | null {
  if (rpeCible == null || !Number.isFinite(rpeCible)) return null;
  return Math.max(RPE_PROPOSE_MINIMUM, rpeCible - rpeReduction);
}

/** Le contenu du champ RPE d'une ligne vierge : vide quand rien n'est proposé. */
export function champEffortPropose(
  rpeCible: number | null | undefined,
  rpeReduction: number,
): string {
  const propose = effortPropose(rpeCible, rpeReduction);
  return propose === null ? "" : String(propose);
}

/**
 * Ce qui a été saisi dans le champ RPE, tel qu'il partira en base.
 *
 * Un champ vide, des espaces, un texte : autant de façons de ne rien dire.
 * Toutes rendent `null` — jamais un nombre de repli.
 */
export function effortSaisi(champ: string): number | null {
  const valeur = Number.parseFloat(champ.replace(",", "."));
  return Number.isFinite(valeur) && valeur > 0 ? valeur : null;
}
