import { db } from "@/db/client";
import { sessionLogs, setLogs } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { SessionLog } from "@/db/schema";
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

export async function terminerSeance(donnees: CloturSeance): Promise<SessionLog> {
  const existante = await db.query.sessionLogs.findFirst({
    where: and(eq(sessionLogs.id, donnees.sessionLogId), eq(sessionLogs.userId, donnees.userId)),
  });
  if (!existante) throw new SeanceIntrouvable();

  const series = donnees.series.filter(
    (s) => s.repsEffectuees !== null && s.charge !== null && s.exerciseInstanceId,
  );

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
