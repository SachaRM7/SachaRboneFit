import { db } from "@/db/client";
import type { Lecteur } from "@/db/lecteur";
import { libelleMuscle } from "@/lib/referentiels/libelles";
import {
  activiteMusculaire, courbaturesDuJour, etatMusclesDepuis,
} from "@/lib/coach/outils-programme";
import { mesurerCycle } from "@/services/cycle";
import { contraintesActives } from "@/services/contraintes";
import { scoreRecuperation, seuilDePhase } from "@/lib/engine/recuperation";
import { SEVERITE } from "@/lib/engine/contraintes";
import type { PhaseCycle } from "@/lib/engine/etat-cycle";

/**
 * L'état de récupération, calculé UNE fois, pour le moteur comme pour l'écran.
 *
 * Le calcul existait déjà et fonctionnait : `activiteMusculaire` pèse la
 * dernière exposition, `etatMusclesDepuis` la met en forme, `scoreRecuperation`
 * en tire un score et un seuil de phase. `validerSeanceComplete` s'en sert pour
 * refuser une séance, et le coach pour répondre.
 *
 * Il n'était visible nulle part. L'athlète pouvait donc voir une séance
 * signalée « récupération insuffisante » sans jamais savoir quel muscle, ni
 * depuis quand, ni pourquoi.
 *
 * Ce service ne recalcule RIEN. Il assemble les mêmes fonctions, dans le même
 * ordre, et met un nom sur ce que le moteur décide déjà. Un second calcul écrit
 * dans un composant React aurait divergé au premier ajustement de seuil — et
 * personne ne saurait lequel des deux fait autorité.
 */

/**
 * Trois états, et ils viennent tous du moteur.
 *
 *   pret        le score dépasse le seuil de la phase — `scoreRecuperation`.
 *   en_cours    il ne le dépasse pas encore. C'est le même verdict qui fait
 *               lever `recuperation_insuffisante` au validateur.
 *   a_menager   une contrainte active écarte ce muscle. Elle prime : ce n'est
 *               pas une question de fatigue, et le temps ne la lèvera pas.
 *
 * Aucun seuil n'est défini ici. Les ajouter dans React aurait produit une
 * seconde règle, invisible depuis le moteur.
 */
export const ETATS_RECUPERATION = ["pret", "en_cours", "a_menager"] as const;
export type EtatRecuperation = (typeof ETATS_RECUPERATION)[number];

export const LIBELLES_ETAT_RECUPERATION: Record<EtatRecuperation, string> = {
  pret: "Prêt",
  en_cours: "Récupération en cours",
  a_menager: "À ménager",
};

export interface MuscleRecupere {
  muscle: string;
  libelle: string;
  etat: EtatRecuperation;
  /** 0 à 100, tel que `scoreRecuperation` le rend. */
  score: number;
  /** Jours depuis la dernière sollicitation. `null` : jamais travaillé. */
  joursDepuis: number | null;
  seriesDerniereExposition: number;
  rirMoyen: number | null;
  /** Courbature signalée aujourd'hui, 0-10. */
  courbature: number;
  /** Sévérité de la contrainte active, si le muscle en porte une. */
  severiteContrainte: number | null;
  /**
   * Ce qui a pesé, en clair — les motifs du moteur, pas une reformulation.
   *
   * C'est ce qui permet à l'écran d'expliquer « quadriceps, récupération en
   * cours : hier, 8 séries, RIR 2 » sans réinventer le raisonnement.
   */
  motifs: string[];
}

export interface RecuperationMusculaire {
  /** Les muscles qui méritent d'être montrés. Voir `estPertinent`. */
  muscles: MuscleRecupere[];
  phase: PhaseCycle;
  /** Le seuil au-delà duquel la phase juge un muscle prêt. */
  seuil: number;
  /** Combien de muscles ont été écartés parce que rien ne les distingue. */
  neutresMasques: number;
}

/**
 * Ce muscle mérite-t-il d'apparaître ?
 *
 * Quinze lignes dont douze disent « prêt » ne se lisent pas : l'information
 * utile s'y noie. On garde ce qui a bougé — travaillé récemment, courbaturé,
 * sous contrainte, ou pas encore prêt — et on masque le reste en le comptant,
 * pour que l'absence se distingue d'un calcul manquant.
 *
 * Sept jours : la fenêtre au-delà de laquelle `RECUPERATION_PAR_JOUR` a de
 * toute façon plafonné, donc au-delà de laquelle le muscle est prêt et le
 * restera.
 */
const JOURS_RECENTS = 7;

function estPertinent(m: MuscleRecupere): boolean {
  if (m.etat !== "pret") return true;
  if (m.courbature > 0) return true;
  if (m.severiteContrainte !== null) return true;
  return m.joursDepuis !== null && m.joursDepuis <= JOURS_RECENTS;
}

/**
 * L'ordre d'affichage : ce qui demande une décision d'abord.
 *
 * À ménager, puis en récupération, puis prêt — et à état égal, le score le plus
 * bas en premier. Trier par nom d'abord ferait descendre l'épaule contrainte
 * sous les mollets frais.
 */
const RANG_ETAT: Record<EtatRecuperation, number> = { a_menager: 0, en_cours: 1, pret: 2 };

/**
 * L'état de récupération d'un compte, prêt à afficher.
 *
 * Trois lectures menées en parallèle, plus le cycle et les contraintes — les
 * mêmes que `validerSeanceComplete`, exactement. Pas une requête par muscle :
 * `activiteMusculaire` fait une seule jointure et agrège en mémoire.
 *
 * Un muscle jamais travaillé n'est PAS fatigué : `scoreRecuperation` rend 100
 * et aucun motif. C'est important — l'inverse ferait apparaître comme épuisé
 * un débutant qui n'a encore rien fait.
 */
export async function recuperationMusculaire(
  userId: string,
  executeur: Lecteur = db,
): Promise<RecuperationMusculaire> {
  const [activite, courbatures, cycle, contraintes] = await Promise.all([
    // 21 jours : la même fenêtre que le validateur, pour que les deux voient
    // rigoureusement la même dernière exposition.
    activiteMusculaire(userId, 21, executeur),
    courbaturesDuJour(userId, executeur),
    mesurerCycle(userId, executeur),
    contraintesActives(userId, executeur),
  ]);

  const etats = etatMusclesDepuis(activite, courbatures);
  const seuil = seuilDePhase(cycle.phase);
  const severiteParMuscle = new Map(contraintes.map((c) => [c.muscle, c.severite]));

  // Les muscles connus du calcul, plus ceux que seule une contrainte désigne :
  // une épaule contrainte et jamais travaillée doit quand même se voir.
  const tous = new Set([...Object.keys(etats), ...severiteParMuscle.keys()]);

  const muscles: MuscleRecupere[] = [...tous].map((muscle) => {
    const e = etats[muscle] ?? {
      joursDepuis: null, seriesDerniereExposition: 0, rirMoyen: null, courbature: 0,
    };
    const score = scoreRecuperation({
      ...e,
      tendancePerformance: cycle.tendancePerformance,
      phase: cycle.phase,
    });

    const severite = severiteParMuscle.get(muscle) ?? null;
    // La contrainte prime sur la fatigue : elle ne se lève pas avec le temps,
    // et c'est elle qui écarte réellement l'exercice.
    const etat: EtatRecuperation = severite !== null && severite >= SEVERITE.ecartement
      ? "a_menager"
      : score.pret ? "pret" : "en_cours";

    return {
      muscle,
      libelle: libelleMuscle(muscle),
      etat,
      score: score.score,
      joursDepuis: e.joursDepuis,
      seriesDerniereExposition: e.seriesDerniereExposition,
      rirMoyen: e.rirMoyen,
      courbature: e.courbature,
      severiteContrainte: severite,
      motifs: score.motifs,
    };
  });

  const pertinents = muscles.filter(estPertinent);
  pertinents.sort(
    (a, b) => RANG_ETAT[a.etat] - RANG_ETAT[b.etat]
      || a.score - b.score
      || a.libelle.localeCompare(b.libelle),
  );

  return {
    muscles: pertinents,
    phase: cycle.phase,
    seuil,
    neutresMasques: muscles.length - pertinents.length,
  };
}

/**
 * Une phrase par muscle, pour le brief du coach et pour l'écran.
 *
 * Elle décrit un état d'ENTRAÎNEMENT, jamais un diagnostic : « récupération en
 * cours » dit ce que l'application va proposer, pas ce que le corps fait.
 */
export function resumeRecuperation(m: MuscleRecupere): string {
  const parts: string[] = [LIBELLES_ETAT_RECUPERATION[m.etat]];
  if (m.joursDepuis === 0) parts.push("travaillé aujourd'hui");
  else if (m.joursDepuis === 1) parts.push("hier");
  else if (m.joursDepuis !== null) parts.push(`il y a ${m.joursDepuis} jours`);
  if (m.seriesDerniereExposition > 0) parts.push(`${m.seriesDerniereExposition} séries`);
  if (m.rirMoyen !== null) parts.push(`RIR moyen ${Math.round(m.rirMoyen * 10) / 10}`);
  if (m.courbature > 0) parts.push(`courbature ${m.courbature}/10`);
  return parts.join(" · ");
}
