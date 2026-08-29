import type { PhaseCycle, TendancePerformance } from "./etat-cycle";

/**
 * Score de récupération d'un muscle.
 *
 * La règle précédente était une horloge : moins de deux jours, avertissement.
 * Elle avait tort dans les deux sens. Quarante-huit heures suffisent largement
 * après six séries menées loin de l'échec ; elles ne suffisent pas après vingt
 * séries à RIR 0. Ce n'est pas le temps écoulé qui décide, c'est le rapport
 * entre la dette contractée et le temps dont on a disposé pour la rembourser.
 *
 * Le score part donc du temps, puis retranche ce que la dernière exposition a
 * coûté : son volume, sa proximité de l'échec, les courbatures qu'elle a
 * laissées. La phase du cycle module l'exigence — en décharge on ne réclame pas
 * une fraîcheur totale, en surcharge on accepte de travailler entamé.
 */

export interface EntreeRecuperation {
  /** Jours depuis la dernière sollicitation. `null` si jamais travaillé. */
  joursDepuis: number | null;
  /** Séries réalisées lors de cette dernière exposition. */
  seriesDerniereExposition: number;
  /** RIR moyen de cette exposition. `null` si non renseigné. */
  rirMoyen: number | null;
  /** Courbature signalée aujourd'hui, 0-10. */
  courbature: number;
  tendancePerformance: TendancePerformance;
  phase: PhaseCycle;
}

export interface ScoreRecuperation {
  /** 0 à 100. Au-delà du seuil de la phase, le muscle est prêt. */
  score: number;
  pret: boolean;
  /** Ce qui a pesé, pour que la décision puisse être expliquée. */
  motifs: string[];
}

/**
 * Récupération apportée par le seul écoulement du temps.
 *
 * La progression est rapide les deux premiers jours puis s'aplatit : c'est la
 * forme habituelle du retour de la capacité de force après une séance.
 */
const RECUPERATION_PAR_JOUR = [0, 40, 72, 88, 96, 100];

function baseTemporelle(jours: number): number {
  if (jours >= RECUPERATION_PAR_JOUR.length) return 100;
  return RECUPERATION_PAR_JOUR[jours]!;
}

/** Au-delà, le volume d'une séance pèse durablement sur la récupération. */
const SERIES_SANS_DETTE = 8;

/** Coût, en points de score, de chaque série au-delà du seuil. */
const COUT_PAR_SERIE_EXCEDENTAIRE = 2.5;

/** En deçà de ce RIR, la série a été menée assez près de l'échec pour coûter. */
const RIR_COUTEUX = 2;

/** Coût par unité de RIR manquante sous le seuil. */
const COUT_PAR_RIR_MANQUANT = 7;

/** Coût par point de courbature signalée. */
const COUT_PAR_POINT_COURBATURE = 4;

/** Une baisse générale des performances signale une dette non remboursée. */
const COUT_PERFORMANCE_EN_BAISSE = 10;

/**
 * Seuil au-delà duquel un muscle est jugé prêt, selon ce que la phase demande.
 *
 * Une surcharge assume de travailler sur fond de fatigue — c'est son objet. Une
 * décharge n'a de sens que si l'on part frais, sans quoi elle ne décharge rien.
 */
const SEUILS_PAR_PHASE: Record<PhaseCycle, number> = {
  accumulation: 65,
  surcharge: 50,
  decharge: 80,
  hors_cycle: 65,
};

export function scoreRecuperation(entree: EntreeRecuperation): ScoreRecuperation {
  const motifs: string[] = [];

  // Jamais travaillé : rien à récupérer.
  if (entree.joursDepuis === null) {
    return { score: 100, pret: true, motifs: [] };
  }

  let score = baseTemporelle(entree.joursDepuis);
  motifs.push(
    entree.joursDepuis === 0
      ? "travaillé aujourd'hui"
      : `${entree.joursDepuis} jour${entree.joursDepuis > 1 ? "s" : ""} depuis la dernière fois`,
  );

  const excedent = Math.max(0, entree.seriesDerniereExposition - SERIES_SANS_DETTE);
  if (excedent > 0) {
    const cout = excedent * COUT_PAR_SERIE_EXCEDENTAIRE;
    score -= cout;
    motifs.push(`${entree.seriesDerniereExposition} séries la dernière fois`);
  }

  if (entree.rirMoyen !== null && entree.rirMoyen < RIR_COUTEUX) {
    const manquant = RIR_COUTEUX - entree.rirMoyen;
    score -= manquant * COUT_PAR_RIR_MANQUANT;
    motifs.push(`RIR ${entree.rirMoyen} — proche de l'échec`);
  }

  if (entree.courbature > 0) {
    score -= entree.courbature * COUT_PAR_POINT_COURBATURE;
    motifs.push(`courbatures ${entree.courbature}/10`);
  }

  if (entree.tendancePerformance === "baisse") {
    score -= COUT_PERFORMANCE_EN_BAISSE;
    motifs.push("performances en baisse");
  }

  const borne = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: borne,
    pret: borne >= SEUILS_PAR_PHASE[entree.phase],
    motifs,
  };
}

export function seuilDePhase(phase: PhaseCycle): number {
  return SEUILS_PAR_PHASE[phase];
}
