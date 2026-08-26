import { db } from "@/db/client";
import { sessionLogs, setLogs } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { SessionLog } from "@/db/schema";

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

export async function creerSeance(donnees: CreationSeance): Promise<SessionLog> {
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
  return db.transaction(async (tx) => {
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
}
