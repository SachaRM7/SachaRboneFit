/**
 * Ce qu'on sait d'une séance au moment de la clôturer.
 *
 * Deux questions, et une seule règle : ne rien enregistrer qu'on n'ait
 * réellement observé.
 *
 * La première est la durée. Elle valait `maintenant − démarrée`, or le brouillon
 * de séance est conservé dans le navigateur : quelqu'un qui commence le soir,
 * se fait interrompre et clôture le lendemain matin enregistrait une séance de
 * neuf cents minutes. Cette valeur part ensuite dans la médiane « durée
 * habituelle » du bilan, qu'elle suffit à rendre fausse. La durée se compte
 * donc jusqu'au DERNIER GESTE réel — la dernière série validée — et non
 * jusqu'à l'instant où l'on a rouvert l'application.
 *
 * La seconde est ce qui manque. Une série sans réserve renseignée n'est pas
 * une série ratée, mais elle est muette : le maximum estimé la sous-évalue, et
 * la progression double n'a rien pour décider de la charge suivante. Autant le
 * demander tant que la séance est fraîche, en une question par exercice plutôt
 * qu'une par série.
 */

/** Au-delà, la durée mesurée par l'horloge n'est plus crédible. */
export const DUREE_PLAUSIBLE_MAX_MINUTES = 240;
/** En deçà, on considère qu'aucune durée n'a de sens. */
export const DUREE_PLANCHER_MINUTES = 1;

export interface SerieBrute {
  exerciseInstanceId: string;
  numeroSerie: number;
  repsEffectuees: number | null;
  charge: number | null;
  rpeEffectif: number | null;
  /** Horodatage de validation de la série, quand elle a été validée. */
  validatedAt?: number;
}

export interface EntreeFinDeSeance {
  demarreeA: number;
  maintenant: number;
  series: SerieBrute[];
}

export type SourceDuree = "dernier_geste" | "horloge" | "aucune";

export interface DureeSeance {
  minutes: number;
  source: SourceDuree;
  /**
   * Vrai quand la séance est restée ouverte bien après la dernière série :
   * l'écran doit alors montrer la durée retenue, pas l'imposer en silence.
   */
  reprisePlusTard: boolean;
}

/** Une série compte comme faite dès qu'elle porte une charge et des répétitions. */
export function serieRenseignee(s: SerieBrute): boolean {
  return s.repsEffectuees !== null && s.charge !== null;
}

/**
 * Durée réelle de la séance.
 *
 * On compte du départ jusqu'à la dernière série validée. L'échauffement et les
 * temps morts du milieu restent inclus — ils font partie de la séance ; seule
 * la traîne d'après coup est écartée.
 */
export function dureeDeLaSeance(e: EntreeFinDeSeance): DureeSeance {
  const enMinutes = (ms: number) => Math.round(ms / 60000);
  const borner = (m: number) =>
    Math.min(DUREE_PLAUSIBLE_MAX_MINUTES, Math.max(DUREE_PLANCHER_MINUTES, m));

  const gestes = e.series
    .filter((s) => serieRenseignee(s) && typeof s.validatedAt === "number")
    .map((s) => s.validatedAt!);

  const parHorloge = enMinutes(e.maintenant - e.demarreeA);

  if (gestes.length === 0) {
    // Aucune série validée : on n'a que l'horloge, et elle vaut ce qu'elle vaut.
    if (parHorloge > DUREE_PLAUSIBLE_MAX_MINUTES || parHorloge < DUREE_PLANCHER_MINUTES) {
      return { minutes: borner(parHorloge), source: "aucune", reprisePlusTard: true };
    }
    return { minutes: parHorloge, source: "horloge", reprisePlusTard: false };
  }

  const dernier = Math.max(...gestes);
  const parLesGestes = enMinutes(dernier - e.demarreeA);

  return {
    minutes: borner(parLesGestes),
    source: "dernier_geste",
    // Un quart d'heure d'écart peut être un rangement ; une heure, non.
    reprisePlusTard: parHorloge - parLesGestes > 30,
  };
}

export interface ExerciceIncomplet {
  exerciseInstanceId: string;
  /** Numéros des séries faites mais sans réserve renseignée. */
  series: number[];
}

/**
 * Exercices dont au moins une série faite n'a pas de réserve.
 *
 * Regroupé par exercice, et non par série : demander six fois de suite
 * « et celle-là ? » n'est pas un retour de dix secondes. Une réponse par
 * exercice s'applique à ses séries muettes, ce qui est déjà bien mieux que
 * l'absence totale d'information.
 */
export function exercicesSansReserve(series: SerieBrute[]): ExerciceIncomplet[] {
  const parExercice = new Map<string, number[]>();

  for (const s of series) {
    if (!serieRenseignee(s)) continue;
    if (s.rpeEffectif !== null) continue;
    parExercice.set(s.exerciseInstanceId, [
      ...(parExercice.get(s.exerciseInstanceId) ?? []),
      s.numeroSerie,
    ]);
  }

  return [...parExercice.entries()]
    .map(([exerciseInstanceId, numeros]) => ({
      exerciseInstanceId,
      series: [...numeros].sort((a, b) => a - b),
    }))
    .sort((a, b) => a.exerciseInstanceId.localeCompare(b.exerciseInstanceId));
}

/** Part des séries faites qui portent une réserve. Entre 0 et 1. */
export function couvertureReserve(series: SerieBrute[]): number {
  const faites = series.filter(serieRenseignee);
  if (faites.length === 0) return 0;
  return faites.filter((s) => s.rpeEffectif !== null).length / faites.length;
}

export interface RecapSeance {
  duree: DureeSeance;
  exercices: number;
  series: number;
  tonnage: number;
  couvertureReserve: number;
  aCompleter: ExerciceIncomplet[];
}

export function recapDeLaSeance(e: EntreeFinDeSeance): RecapSeance {
  const faites = e.series.filter(serieRenseignee);
  return {
    duree: dureeDeLaSeance(e),
    exercices: new Set(faites.map((s) => s.exerciseInstanceId)).size,
    series: faites.length,
    tonnage: Math.round(faites.reduce((t, s) => t + s.charge! * s.repsEffectuees!, 0)),
    couvertureReserve: couvertureReserve(e.series),
    aCompleter: exercicesSansReserve(e.series),
  };
}
