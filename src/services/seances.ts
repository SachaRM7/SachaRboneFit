import { db } from "@/db/client";
import {
  exerciseInstances, programmeBlocs, seanceTemplates,
  sessionIncidents, sessionLogs, sessionPlanItems, setLogs,
} from "@/db/schema";
import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import type { SessionLog } from "@/db/schema";
import { estUneSeanceRealisee } from "@/db/archivage";
import {
  effortRequisPour, LIBELLES_MOTIF_INVALIDE, motifSerieInvalide,
  type MotifSerieInvalide,
} from "@/lib/engine/serie-realisee";
import { feuDeTendance } from "./progression";

/**
 * Couche service des seances.
 *
 * Auparavant, l'orchestration vivait dans un composant client : chaque seance
 * creait DEUX lignes session_logs — une au demarrage portant le contexte
 * (feu du jour, ajustement de volume, etat du jour) mais aucune serie, et une
 * a la fin portant les series mais aucun contexte. L'historique etait donc faux
 * des la premiere seance.
 *
 * Le cycle est desormais : creerSeance() au demarrage, puis terminerSeance()
 * qui complete LA MEME ligne et insere les series dans une transaction.
 */

export interface SerieASauver {
  exerciseInstanceId: string;
  numeroSerie: number;
  repsEffectuees: number;
  charge: number;
  rpeEffectif?: number | null;
  tempoRespecte?: boolean | null;
  reposReelSecondes?: number | null;
  notes?: string | null;
}

export interface CreationSeance {
  userId: string;
  date: string;
  seanceTemplateId?: string | null;
  gymId?: string | null;
  dailyStateId?: string | null;
  feuBiologiqueJour?: string | null;
  volumeAjustePct?: number | null;
  volumeAjusteRaison?: string | null;
}

/**
 * Démarre une séance, ou reprend celle qui est déjà ouverte.
 *
 * La création était inconditionnelle, et appelée depuis un effet du client.
 * Un rafraîchissement, un retour arrière, un double appui, une reconnexion
 * après un échec réseau : chacun produisait une ligne de plus. Ces séances
 * vides ne se voient nulle part — mais elles comptaient comme des séances
 * faites dans la vue du programme, et faisaient avancer la rotation.
 *
 * Reprendre plutôt que recréer se décide ici, côté serveur, parce que c'est le
 * seul endroit qui voit toutes les tentatives. « Déjà ouverte » veut dire : le
 * même jour, la même séance du programme, pas encore clôturée.
 */
export async function creerSeance(donnees: CreationSeance): Promise<SessionLog> {
  const ouverte = await db.query.sessionLogs.findFirst({
    where: and(
      eq(sessionLogs.userId, donnees.userId),
      eq(sessionLogs.date, donnees.date),
      isNull(sessionLogs.archiveLe),
      isNull(sessionLogs.dureeMinutes),
      donnees.seanceTemplateId
        ? eq(sessionLogs.seanceTemplateId, donnees.seanceTemplateId)
        : isNull(sessionLogs.seanceTemplateId),
    ),
    orderBy: [desc(sessionLogs.createdAt)],
  });
  if (ouverte) return ouverte;

  const [seance] = await db
    .insert(sessionLogs)
    .values({
      userId: donnees.userId,
      date: donnees.date,
      seanceTemplateId: donnees.seanceTemplateId ?? null,
      gymId: donnees.gymId ?? null,
      dailyStateId: donnees.dailyStateId ?? null,
      feuBiologiqueJour: donnees.feuBiologiqueJour ?? null,
      volumeAjustePct: donnees.volumeAjustePct ?? null,
      volumeAjusteRaison: donnees.volumeAjusteRaison ?? null,
    })
    .returning();

  if (!seance) throw new Error("Creation de la seance impossible");
  return seance;
}

/**
 * Une séance est terminée quand elle porte une durée.
 *
 * Définition unique, parce qu'elle était inférée différemment selon l'écran.
 * `seanceCourante` et l'adaptation de lieu lisent `duree_minutes` ; la rotation
 * des séances et la vue du programme, elles, considéraient qu'une LIGNE
 * `session_logs` suffisait à dire qu'une séance avait eu lieu. Une séance
 * ouverte puis abandonnée était donc « en cours » pour les uns et « faite »
 * pour les autres.
 *
 * Le modèle n'a pas de colonne d'état : `duree_minutes` en tient lieu, et c'est
 * une inférence assumée — la clôture est le seul moment qui l'écrit. Une
 * colonne explicite serait plus honnête ; elle est notée en dette.
 */
/**
 * Qui s'est réellement entraîné depuis cette date.
 *
 * Le précalcul de la séance du jour lisait `session_logs` sans filtre pour
 * décider qui traiter : une séance archivée suffisait à rendre quelqu'un
 * « actif » pendant quatorze jours, et donc à lui faire calculer chaque nuit
 * une séance qu'il n'a pas demandée. Le tort est mince — du travail inutile,
 * pas un chiffre faux —, mais la règle est la même partout : une séance retirée
 * du calcul ne décide plus de rien.
 *
 * Extraite de la route pour être vérifiable seule : le reste du cron appelle un
 * modèle, ce qui n'a pas sa place dans un test de cette propriété.
 */
export async function utilisateursActifsDepuis(depuisISO: string): Promise<string[]> {
  const seances = await db.query.sessionLogs.findMany({
    where: and(gte(sessionLogs.date, depuisISO), estUneSeanceRealisee()),
    columns: { userId: true },
  });
  return [...new Set(seances.map((s) => s.userId))];
}

export function estTerminee(seance: { dureeMinutes: number | null }): boolean {
  return seance.dureeMinutes !== null;
}

/**
 * La séance en cours, résolue côté serveur.
 *
 * Trois outils du coach recevaient `sessionLogId` du modèle. Un identifiant
 * fourni par un modèle est au mieux recopié d'un résultat précédent, au pire
 * inventé — et une écriture sur la mauvaise séance ne lève aucune erreur : elle
 * range une donnée juste au mauvais endroit, où personne ne la cherchera.
 *
 * « En cours » veut dire : d'aujourd'hui, non archivée, pas encore clôturée.
 * `dureeMinutes` est ce que la clôture renseigne — c'est donc lui qui distingue
 * une séance ouverte d'une séance finie.
 */
export async function seanceCourante(
  userId: string,
  aujourdhui = new Date().toISOString().slice(0, 10),
): Promise<SessionLog | null> {
  const seance = await db.query.sessionLogs.findFirst({
    where: and(
      eq(sessionLogs.userId, userId),
      eq(sessionLogs.date, aujourdhui),
      isNull(sessionLogs.archiveLe),
      isNull(sessionLogs.dureeMinutes),
    ),
    orderBy: [desc(sessionLogs.createdAt)],
  });
  return seance ?? null;
}

export interface CloturSeance {
  userId: string;
  sessionLogId: string;
  dureeMinutes?: number | null;
  /** Echelle 1-10, identique a daily_states.energieDepart. */
  energieFin?: number | null;
  notesSeance?: string | null;
  feuBiologiqueTendance?: string | null;
  series: SerieASauver[];
}

/** Erreur metier : la seance n'existe pas ou n'appartient pas a l'utilisateur. */
export class SeanceIntrouvable extends Error {
  constructor() {
    super("Seance introuvable ou non autorisee");
    this.name = "SeanceIntrouvable";
  }
}

/**
 * Erreur métier : clôturer une séance dont aucune série n'a été validée.
 *
 * La clôture écrivait alors `duree_minutes` sur une ligne sans la moindre
 * série, et cette durée passait pour une preuve d'entraînement dans la moitié
 * de l'application. Refuser est plus honnête que d'enregistrer une séance dont
 * personne ne saurait dire ce qu'elle contient : la ligne reste ouverte, donc
 * reprenable, et l'athlète peut soit valider une série, soit l'abandonner.
 */
export class SeanceSansSerie extends Error {
  constructor() {
    super("Une séance ne peut être terminée sans série validée");
    this.name = "SeanceSansSerie";
  }
}

/**
 * Erreur métier : une série reçue n'est pas une série réalisée.
 *
 * Elle porte le numéro et le motif, parce qu'un refus doit dire QUOI corriger.
 * Le client applique déjà la même règle : l'arrivée d'une série invalide ici
 * signale un désaccord entre les deux, pas une saisie ordinaire.
 */
export class SerieInvalide extends Error {
  constructor(readonly numeroSerie: number, readonly motif: MotifSerieInvalide) {
    super(`Série ${numeroSerie} : ${LIBELLES_MOTIF_INVALIDE[motif]}`);
    this.name = "SerieInvalide";
  }
}

/**
 * La phase du cycle dont relève cette séance.
 *
 * Le serveur ne la demande pas au client : c'est elle qui décide si la réserve
 * est obligatoire, et une exigence qu'on peut désactiver depuis le navigateur
 * n'en est pas une.
 */
async function phaseDuCycle(seanceTemplateId: string | null): Promise<string | null> {
  if (!seanceTemplateId) return null;
  const ligne = await db
    .select({ typeCycle: programmeBlocs.typeCycle })
    .from(seanceTemplates)
    .innerJoin(programmeBlocs, eq(programmeBlocs.id, seanceTemplates.blocId))
    .where(eq(seanceTemplates.id, seanceTemplateId))
    .limit(1);
  return ligne[0]?.typeCycle ?? null;
}

export async function terminerSeance(donnees: CloturSeance): Promise<SessionLog> {
  const existante = await db.query.sessionLogs.findFirst({
    where: and(
      eq(sessionLogs.id, donnees.sessionLogId),
      eq(sessionLogs.userId, donnees.userId),
      // Une séance retirée du calcul ne se re-clôture pas : la rouvrir en
      // écriture reviendrait à la faire réapparaître par une autre porte.
      isNull(sessionLogs.archiveLe),
    ),
  });
  if (!existante) throw new SeanceIntrouvable();

  /**
   * Ce qui a réellement eu lieu — et un refus explicite pour le reste.
   *
   * Le filtre ne demandait que « ni l'un ni l'autre n'est `null` ». Zéro n'est
   * pas `null` : une série à 0 répétition et 0 kilo entrait en base, comptait
   * dans le volume et nourrissait la progression.
   *
   * La première correction se contentait d'ÉCARTER ces séries. C'était encore
   * une correction silencieuse : l'écran avait montré une ligne validée, la
   * base n'en gardait rien, et personne n'était prévenu. Une série invalide
   * qui atteint le serveur est maintenant une erreur — le client la refuse
   * déjà, donc son arrivée ici signale un vrai désaccord entre les deux.
   */
  const instancesCitees = [...new Set(donnees.series.map((s) => s.exerciseInstanceId).filter(Boolean))];
  const conventions = instancesCitees.length
    ? await db
        .select({
          id: exerciseInstances.id,
          conventionCharge: exerciseInstances.conventionCharge,
          natureCharge: exerciseInstances.natureCharge,
        })
        .from(exerciseInstances)
        .where(inArray(exerciseInstances.id, instancesCitees))
    : [];
  const conventionParInstance = new Map(conventions.map((c) => [c.id, c]));

  // En calibration, la réserve est LA mesure : c'est elle qui fixera les
  // charges des blocs suivants. Une série de calibration sans effort renseigné
  // ne mesure rien, et le serveur le sait sans avoir à croire le client.
  const exigences = { effortRequis: effortRequisPour(await phaseDuCycle(existante.seanceTemplateId)) };

  const series: SerieASauver[] = [];
  for (const s of donnees.series) {
    if (!s.exerciseInstanceId) continue;
    const motif = motifSerieInvalide(
      s, conventionParInstance.get(s.exerciseInstanceId) ?? {}, exigences,
    );
    if (motif) throw new SerieInvalide(s.numeroSerie, motif);
    series.push(s);
  }

  // Le seul signal durable d'un entraînement est la série. Sans elle, il n'y a
  // rien à clore — et surtout rien qui doive compter comme une séance faite.
  if (series.length === 0) throw new SeanceSansSerie();

  // Transaction : sans elle, un echec sur l'insertion des series laissait une
  // seance close mais vide en base.
  const cloturee = await db.transaction(async (tx) => {
    const [maj] = await tx
      .update(sessionLogs)
      .set({
        dureeMinutes: donnees.dureeMinutes ?? existante.dureeMinutes,
        energieFin: donnees.energieFin ?? existante.energieFin,
        notesSeance: donnees.notesSeance ?? existante.notesSeance,
        feuBiologiqueTendance: donnees.feuBiologiqueTendance ?? existante.feuBiologiqueTendance,
        updatedAt: new Date(),
      })
      .where(eq(sessionLogs.id, donnees.sessionLogId))
      .returning();

    if (!maj) throw new SeanceIntrouvable();

    // Reprise possible d'une seance : on repart d'un jeu de series propre.
    await tx.delete(setLogs).where(eq(setLogs.sessionLogId, donnees.sessionLogId));

    if (series.length > 0) {
      await tx.insert(setLogs).values(
        series.map((s) => ({
          sessionLogId: donnees.sessionLogId,
          exerciseInstanceId: s.exerciseInstanceId,
          numeroSerie: s.numeroSerie,
          repsEffectuees: s.repsEffectuees,
          charge: s.charge,
          rpeEffectif: s.rpeEffectif ?? null,
          tempoRespecte: s.tempoRespecte ?? null,
          // Ces deux colonnes existaient mais n'etaient jamais alimentees :
          // le client les transmettait et l'insertion les ignorait.
          reposReelSecondes: s.reposReelSecondes ?? null,
          notes: s.notes ?? null,
        })),
      );
    }

    return maj;
  });

  // Le feu de tendance est calcule APRES la cloture, quand les series de cette
  // seance sont en base : il portait auparavant sur des donnees appauvries
  // (nom d'exercice litteral "Exercice", feu du jour force a null, ce qui
  // degradait systematiquement le contexte).
  const tendance = await feuDeTendance(donnees.userId);
  if (!tendance) return cloturee;

  const [avecTendance] = await db
    .update(sessionLogs)
    .set({ feuBiologiqueTendance: tendance, updatedAt: new Date() })
    .where(eq(sessionLogs.id, donnees.sessionLogId))
    .returning();

  return avecTendance ?? cloturee;
}

/**
 * Erreur métier : abandonner une séance qui contient déjà des séries.
 *
 * Abandonner efface. Une séance où quelque chose a réellement été fait ne
 * s'efface pas d'un bouton : elle se termine, ou elle reste ouverte.
 */
export class SeanceNonVide extends Error {
  constructor() {
    super("Cette séance contient des séries : termine-la plutôt que de l'abandonner");
    this.name = "SeanceNonVide";
  }
}

/**
 * La séance ouverte de ce compte, s'il y en a une.
 *
 * « Ouverte » veut dire : créée, pas encore clôturée, pas archivée. Il ne
 * devrait jamais y en avoir deux — c'est l'invariant que fait respecter
 * `construireSeanceDuJour`. En cas d'héritage, la plus récente gagne : c'est
 * celle que l'écran de séance porte.
 */
export async function seanceOuverte(userId: string): Promise<SessionLog | null> {
  const seance = await db.query.sessionLogs.findFirst({
    where: and(
      eq(sessionLogs.userId, userId),
      isNull(sessionLogs.archiveLe),
      isNull(sessionLogs.dureeMinutes),
    ),
    orderBy: [desc(sessionLogs.createdAt)],
  });
  return seance ?? null;
}

/**
 * Abandonner une séance commencée.
 *
 * Le bouton du tableau de bord n'appelait que `clear()` — une remise à zéro du
 * store React. La ligne `session_logs` restait ouverte en base : au
 * rechargement suivant, « Séance en cours — 0 séries enregistrées »
 * réapparaissait, et une nouvelle tentative en créait une de plus. C'est ce
 * qui a produit les séances fantômes et le « 4 séances cette semaine ».
 *
 * Ce qui part : la ligne et son plan, qui n'ont jamais rien mesuré. Ce qui ne
 * bouge pas : le gabarit, le bloc, l'inventaire, et toute séance qui porte des
 * séries — la suppression est refusée dans ce cas plutôt que silencieuse.
 */
export async function abandonnerSeance(userId: string, sessionLogId: string): Promise<void> {
  const seance = await db.query.sessionLogs.findFirst({
    where: and(
      eq(sessionLogs.id, sessionLogId),
      eq(sessionLogs.userId, userId),
      isNull(sessionLogs.archiveLe),
    ),
  });
  if (!seance) throw new SeanceIntrouvable();

  const series = await db.query.setLogs.findMany({
    where: eq(setLogs.sessionLogId, sessionLogId),
    columns: { id: true },
  });
  if (series.length > 0) throw new SeanceNonVide();

  await db.transaction(async (tx) => {
    // Le plan cite la séance : il part avec elle, et lui seul. Les lignes de
    // gabarit qu'il référence ne sont pas touchées.
    await tx.delete(sessionPlanItems).where(eq(sessionPlanItems.sessionLogId, sessionLogId));
    await tx.delete(sessionIncidents).where(eq(sessionIncidents.sessionLogId, sessionLogId));
    await tx.delete(sessionLogs).where(eq(sessionLogs.id, sessionLogId));
  });
}
