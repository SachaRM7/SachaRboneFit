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
  | "charge_nulle"
  | "effort_absent"
  | "effort_hors_plage";

export const LIBELLES_MOTIF_INVALIDE: Record<MotifSerieInvalide, string> = {
  reps_absentes: "Indique le nombre de répétitions.",
  reps_nulles: "Une série sans répétition n'a pas eu lieu.",
  charge_absente: "Indique la charge utilisée.",
  charge_nulle: "Une charge à zéro ne peut pas être une série réalisée.",
  effort_absent: "En calibration, indique ce qu'il te restait en réserve : c'est cette réponse qui fixera tes charges.",
  effort_hors_plage: "Cet effort n'est pas dans l'échelle : corrige-le avant de valider.",
};

/**
 * Ce que le contexte impose EN PLUS de ce que le mouvement impose.
 *
 * Un seul cas aujourd'hui, et il est fondé : pendant la calibration, la
 * réserve de répétitions n'est pas une donnée d'ambiance, c'est LA mesure —
 * c'est elle qui fixera les charges des blocs suivants. Une série de
 * calibration sans effort renseigné ne mesure rien.
 *
 * Hors calibration, l'effort reste facultatif : aucune règle du moteur ne le
 * lit, et exiger une saisie dont personne ne se sert reviendrait à fabriquer
 * de la donnée pour la forme.
 */
export interface ExigencesDeLaSerie {
  /** La réserve/effort est-elle obligatoire pour que la série mesure quelque chose ? */
  effortRequis?: boolean;
}

export function effortRequisPour(phaseCycle: string | null | undefined): boolean {
  return phaseCycle === "calibration";
}

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
  exigences: ExigencesDeLaSerie = {},
): MotifSerieInvalide | null {
  const reps = serie.repsEffectuees;
  if (reps == null || !Number.isFinite(reps)) return "reps_absentes";
  if (reps <= 0) return "reps_nulles";

  const charge = serie.charge;
  if (charge == null || !Number.isFinite(charge)) {
    // Sans charge externe, la colonne vaut zéro par convention et l'écran
    // laisse le champ vide : ne rien saisir est ici la saisie attendue.
    if (convention.conventionCharge !== "sans_charge") return "charge_absente";
  } else if (charge < 0 || (charge === 0 && !chargeZeroEstLegitime(convention))) {
    return "charge_nulle";
  }

  /**
   * L'effort, quand il est obligatoire ou quand il a été saisi.
   *
   * Une valeur hors échelle — le 99 tapé en recette — n'est pas une mesure. On
   * ne la jetait pas assez fort : la garder en écartant la donnée revenait à
   * afficher une série verte dont l'effort n'existait plus nulle part. Elle
   * empêche maintenant la validation, et l'écran demande de la corriger. La
   * série n'est pas perdue pour autant : les répétitions saisies restent à
   * l'écran, c'est le Check qui attend.
   */
  const effort = serie.rpeEffectif;
  const effortSaisi = effort != null && Number.isFinite(effort);
  if (!effortSaisi) {
    return exigences.effortRequis ? "effort_absent" : null;
  }
  if (effort < RPE_MIN_EXPLOITABLE || effort > RPE_MAX_EXPLOITABLE) return "effort_hors_plage";

  return null;
}

export function estUneSerieRealisee(
  serie: SerieCandidate,
  convention: ConventionDeLaSerie = {},
  exigences: ExigencesDeLaSerie = {},
): boolean {
  return motifSerieInvalide(serie, convention, exigences) === null;
}

/**
 * Les bornes de l'échelle d'effort.
 *
 * Hors de ces bornes, il n'y a pas de mesure — et surtout pas de correction
 * silencieuse. Ramener un 99 à `null` en gardant la série produisait une ligne
 * verte à l'écran dont l'effort avait disparu en base : exactement l'écart
 * UI/DB qu'on élimine partout ailleurs. La saisie est refusée, à l'écran comme
 * au serveur, et l'utilisateur corrige.
 */
export const RPE_MIN_EXPLOITABLE = 1;
export const RPE_MAX_EXPLOITABLE = 10;

export function rpeDansLEchelle(rpe: number | null | undefined): boolean {
  if (rpe == null || !Number.isFinite(rpe)) return false;
  return rpe >= RPE_MIN_EXPLOITABLE && rpe <= RPE_MAX_EXPLOITABLE;
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
  // Aucune exigence de contexte ici : ce filtre relit l'historique, où la
  // phase du cycle de l'époque n'est plus connue. Il écarte ce qui n'a pas eu
  // lieu, pas ce qui a été mesuré sans réserve.
  return series.filter((s) => estUneSerieRealisee(s, conventionPour(s)));
}
