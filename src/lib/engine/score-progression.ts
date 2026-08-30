/**
 * Classer les exercices par clarté de la progression, pas par pourcentage.
 *
 * Le classement précédent triait sur le gain relatif depuis la première mesure.
 * C'est une mesure biaisée, et le biais est mécanique : les incréments
 * disponibles ne sont pas proportionnels à la charge. Passer de 8 à 10 kg aux
 * élévations latérales, c'est un cran de plus sur le rack et +25 %. Passer de
 * 100 à 110 kg au développé, c'est quatre disques et +10 %. Le pourcentage
 * classe le petit exercice devant, systématiquement, quel que soit le travail
 * réellement accompli.
 *
 * Le score ci-dessous répond donc à une autre question — « sur quels exercices
 * les données montrent-elles le plus clairement une amélioration récente ? » —
 * et il combine quatre choses :
 *
 *   confiance × (ampleur, régularité, récence)
 *
 * La confiance est un MULTIPLICATEUR, pas un terme : un exercice vu deux fois
 * ne peut pas devancer un exercice documenté sur douze séances, quelle que
 * soit l'ampleur affichée. Un terme additif l'aurait seulement pénalisé ; un
 * multiplicateur l'écarte tant que la comparaison n'est pas fiable.
 *
 * L'ampleur SATURE. Au-delà d'un gain de référence, gagner plus ne fait plus
 * monter le score : c'est ce qui neutralise l'avantage arithmétique des
 * petites charges, sans nier qu'un gain de 10 % vaut mieux qu'un gain de 2 %.
 *
 * Ce score n'est pas une mesure physiologique. C'est un ordre d'affichage, et
 * il est décomposé (`composantes`) pour qu'on puisse toujours dire pourquoi un
 * exercice est passé devant un autre.
 */

import { estimer1RM, type SerieRealisee } from "./records";
import { joursEntre } from "@/lib/semaines";

/**
 * Toutes les pondérations, ici et nulle part ailleurs.
 *
 * Les changer change l'ordre affiché et rien d'autre : aucune de ces valeurs
 * n'entre dans une décision d'entraînement.
 */
export const POIDS = {
  /** Répartition du score, hors confiance. La somme fait 1. */
  ampleur: 0.4,
  regularite: 0.35,
  recence: 0.25,

  /** En deçà, aucune comparaison n'est tentée. */
  seancesMinimum: 3,
  /** À partir d'ici, l'historique est considéré comme pleinement documenté. */
  seancesPleineConfiance: 8,
  /** Plancher de confiance au seuil minimum : un début compte, mais peu. */
  confianceAuMinimum: 0.35,

  /** Gain de maximum estimé au-delà duquel l'ampleur sature, en pourcentage. */
  gainDeReference: 12,

  /** Une amélioration de moins de deux jours vaut la fraîcheur maximale. */
  joursRecenceMaximale: 14,
  /** Au-delà, l'amélioration est trop ancienne pour être dite « récente ». */
  joursRecenceNulle: 56,

  /**
   * Part de séries devant porter un RPE pour que la réserve entre dans le
   * calcul. En dessous, la réserve serait renseignée une fois sur trois et
   * ferait bouger le maximum estimé au gré des oublis de saisie, pas des
   * progrès.
   */
  partRpeSuffisante: 0.6,

  /**
   * Variation relative en deçà de laquelle deux maximums estimés ne se
   * distinguent pas. Sans elle, une erreur d'arrondi vaudrait une progression.
   */
  bruitRelatif: 0.001,
} as const;

export interface SerieDatee extends SerieRealisee {
  date: string;
}

export interface Composantes {
  confiance: number;
  ampleur: number;
  regularite: number;
  recence: number;
}

export interface ProgressionExercice {
  /** 0 à 100. Un ordre d'affichage, pas une mesure. */
  score: number;
  composantes: Composantes;

  // --- Métriques brutes, conservées pour l'affichage détaillé -------------
  seances: number;
  /** Séances ayant battu quelque chose d'antérieur. */
  ameliorations: number;
  /** Gain de maximum estimé depuis la première séance, en pourcentage. */
  progressionPct: number;
  e1rmDebut: number;
  e1rmActuel: number;
  meilleureSerie: { charge: number; reps: number; date: string };
  premiereSeance: string;
  derniereAmelioration: string | null;
  joursDepuisAmelioration: number | null;
  /**
   * Vrai quand la réserve a été prise en compte. Faux si les RPE sont trop
   * lacunaires : le calcul retombe alors sur charge × répétitions seules.
   */
  reserveUtilisee: boolean;
}

const borner01 = (v: number) => Math.min(1, Math.max(0, v));
const arrondi = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * Confiance dans la comparaison, d'après le nombre de séances.
 *
 * Nulle sous le seuil, puis montée linéaire jusqu'à 1. C'est ce facteur qui
 * empêche un exercice vu trois fois de coiffer un exercice suivi sur douze.
 */
export function confiance(seances: number): number {
  if (seances < POIDS.seancesMinimum) return 0;
  if (seances >= POIDS.seancesPleineConfiance) return 1;
  const etendue = POIDS.seancesPleineConfiance - POIDS.seancesMinimum;
  const avancement = (seances - POIDS.seancesMinimum) / etendue;
  return POIDS.confianceAuMinimum + avancement * (1 - POIDS.confianceAuMinimum);
}

/** Ampleur saturante : au-delà du gain de référence, plus rien n'est gagné. */
export function ampleur(gainPct: number): number {
  return borner01(gainPct / POIDS.gainDeReference);
}

/** Fraîcheur de la dernière amélioration, de 1 à 0. */
export function recence(jours: number | null): number {
  if (jours === null) return 0;
  if (jours <= POIDS.joursRecenceMaximale) return 1;
  if (jours >= POIDS.joursRecenceNulle) return 0;
  const etendue = POIDS.joursRecenceNulle - POIDS.joursRecenceMaximale;
  return borner01(1 - (jours - POIDS.joursRecenceMaximale) / etendue);
}

/**
 * La réserve est-elle assez renseignée pour entrer dans le calcul ?
 *
 * « Une baisse de RPE à performance égale est une progression » — à condition
 * que le RPE soit saisi assez souvent. Sinon, une séance où on a pensé à le
 * noter battrait une séance où on a oublié.
 */
export function reserveFiable(series: SerieRealisee[]): boolean {
  if (series.length === 0) return false;
  const renseignees = series.filter((s) => s.rir != null).length;
  return renseignees / series.length >= POIDS.partRpeSuffisante;
}

/**
 * Progression d'un exercice, à partir de son historique complet.
 *
 * Renvoie `null` quand l'historique ne permet pas de conclure : trop peu de
 * séances, ou aucune amélioration jamais constatée.
 */
export function progressionDeLExercice(
  series: SerieDatee[],
  aujourdhui: string,
): ProgressionExercice | null {
  const valides = series
    .filter((s) => s.charge > 0 && s.reps > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (valides.length === 0) return null;

  const dates = [...new Set(valides.map((s) => s.date))].sort();
  const seances = dates.length;
  if (seances < POIDS.seancesMinimum) return null;

  // La réserve n'entre dans le maximum estimé que si elle est assez renseignée.
  const avecReserve = reserveFiable(valides);
  const mesurable = (s: SerieDatee): SerieRealisee =>
    avecReserve ? s : { date: s.date, charge: s.charge, reps: s.reps, rir: null };

  const e1rmParDate = new Map<string, number>();
  for (const s of valides) {
    const v = estimer1RM(mesurable(s));
    e1rmParDate.set(s.date, Math.max(e1rmParDate.get(s.date) ?? 0, v));
  }

  const e1rmDebut = e1rmParDate.get(dates[0]!)!;
  const e1rmMeilleur = Math.max(...e1rmParDate.values());
  if (e1rmDebut <= 0) return null;

  // Séances ayant réellement dépassé tout ce qui précédait. Compter les
  // dépassements plutôt que le seul écart début/fin distingue une progression
  // régulière d'un unique bon jour suivi de trois semaines de stagnation.
  //
  // La comparaison porte sur le maximum estimé, et non sur les records par
  // plage de répétitions : ceux-ci ne se battent qu'à la charge, donc ils ne
  // verraient ni « même charge, deux répétitions de plus », ni « même série,
  // deux répétitions de réserve en plus ». Ce sont pourtant deux progressions.
  let ameliorations = 0;
  let derniereAmelioration: string | null = null;
  let plafond = e1rmDebut;
  for (const date of dates.slice(1)) {
    const duJour = e1rmParDate.get(date)!;
    if (duJour > plafond * (1 + POIDS.bruitRelatif)) {
      ameliorations += 1;
      derniereAmelioration = date;
      plafond = duJour;
    }
  }
  if (ameliorations === 0) return null;

  const gainPct = ((e1rmMeilleur - e1rmDebut) / e1rmDebut) * 100;
  const jours = derniereAmelioration ? joursEntre(derniereAmelioration, aujourdhui) : null;

  const composantes: Composantes = {
    confiance: arrondi(confiance(seances), 2),
    ampleur: arrondi(ampleur(gainPct), 2),
    // Une occasion de progresser par séance après la première.
    regularite: arrondi(borner01(ameliorations / (seances - 1)), 2),
    recence: arrondi(recence(jours), 2),
  };

  const brut =
    POIDS.ampleur * composantes.ampleur +
    POIDS.regularite * composantes.regularite +
    POIDS.recence * composantes.recence;

  const meilleure = valides.reduce((m, s) =>
    estimer1RM(mesurable(s)) > estimer1RM(mesurable(m)) ? s : m,
  );

  return {
    score: arrondi(100 * composantes.confiance * brut, 1),
    composantes,
    seances,
    ameliorations,
    progressionPct: arrondi(gainPct, 1),
    e1rmDebut: arrondi(e1rmDebut),
    e1rmActuel: arrondi(e1rmMeilleur),
    meilleureSerie: { charge: meilleure.charge, reps: meilleure.reps, date: meilleure.date },
    premiereSeance: dates[0]!,
    derniereAmelioration,
    joursDepuisAmelioration: jours,
    reserveUtilisee: avecReserve,
  };
}
