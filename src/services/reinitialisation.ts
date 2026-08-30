import { db } from "@/db/client";
import {
  bodyWeights,
  coachConversations,
  coachMemoires,
  coachMessages,
  contraintes,
  dailyStates,
  exerciseInTemplate,
  exerciseInstances,
  exercises,
  gyms,
  precalcSessions,
  programmeBlocs,
  seanceTemplates,
  sessionIncidents,
  sessionLogs,
  sessionPlanItems,
  setLogs,
  users,
  weeklyDebriefs,
} from "@/db/schema";
import { and, eq, inArray, ne, sql } from "drizzle-orm";

/**
 * Remettre un compte à zéro pour rejouer le parcours depuis l'onboarding.
 *
 * Écrit pour être utilisé souvent : tester le parcours d'un nouvel utilisateur
 * demande de redevenir un nouvel utilisateur, et le faire à la main en base
 * n'est ni reproductible ni sans risque.
 *
 * Deux règles tiennent tout le reste :
 *
 *   — On n'efface QUE les lignes de ce compte. Les salles, leurs exercices et
 *     le catalogue sont communs : les supprimer effacerait le travail d'un
 *     autre compte, qui n'a rien demandé.
 *   — L'ordre de suppression suit les clés étrangères, des feuilles vers la
 *     racine. Une seule transaction : un compte à moitié réinitialisé serait
 *     pire que pas réinitialisé du tout.
 *
 * La suppression des lieux est possible mais séparée, et refusée dès qu'un
 * autre compte s'y est entraîné.
 */

export interface OptionsReinitialisation {
  /** Supprimer aussi les lieux créés par ce compte, et leur contenu. */
  supprimerMesLieux?: boolean;
}

export interface ResumeReinitialisation {
  seances: number;
  series: number;
  etatsDuJour: number;
  blocs: number;
  gabarits: number;
  contraintes: number;
  conversations: number;
  pesees: number;
  lieuxSupprimes: string[];
  lieuxConserves: Array<{ nom: string; raison: string }>;
}

export async function reinitialiserCompte(
  userId: string,
  options: OptionsReinitialisation = {},
): Promise<ResumeReinitialisation> {
  return db.transaction(async (tx) => {
    const mesSeances = await tx.query.sessionLogs.findMany({
      where: eq(sessionLogs.userId, userId),
      columns: { id: true },
    });
    const idsSeances = mesSeances.map((s) => s.id);

    const mesBlocs = await tx.query.programmeBlocs.findMany({
      where: eq(programmeBlocs.userId, userId),
      columns: { id: true },
    });
    const idsBlocs = mesBlocs.map((b) => b.id);

    const mesGabarits = idsBlocs.length
      ? await tx.query.seanceTemplates.findMany({
          where: inArray(seanceTemplates.blocId, idsBlocs),
          columns: { id: true },
        })
      : [];
    const idsGabarits = mesGabarits.map((g) => g.id);

    const mesConversations = await tx.query.coachConversations.findMany({
      where: eq(coachConversations.userId, userId),
      columns: { id: true },
    });
    const idsConversations = mesConversations.map((c) => c.id);

    // --- Feuilles d'abord : rien ne doit rester accroché à ce qu'on efface ---
    let series = 0;
    if (idsSeances.length) {
      const supprimees = await tx
        .delete(setLogs)
        .where(inArray(setLogs.sessionLogId, idsSeances))
        .returning({ id: setLogs.id });
      series = supprimees.length;
      await tx.delete(sessionPlanItems).where(inArray(sessionPlanItems.sessionLogId, idsSeances));
      await tx.delete(sessionIncidents).where(inArray(sessionIncidents.sessionLogId, idsSeances));
    }

    if (idsConversations.length) {
      await tx.delete(coachMessages).where(inArray(coachMessages.conversationId, idsConversations));
    }
    await tx.delete(coachConversations).where(eq(coachConversations.userId, userId));
    await tx.delete(coachMemoires).where(eq(coachMemoires.userId, userId));

    if (idsGabarits.length) {
      await tx.delete(exerciseInTemplate).where(inArray(exerciseInTemplate.seanceTemplateId, idsGabarits));
      await tx.delete(seanceTemplates).where(inArray(seanceTemplates.blocId, idsBlocs));
    }

    await tx.delete(sessionLogs).where(eq(sessionLogs.userId, userId));
    await tx.delete(programmeBlocs).where(eq(programmeBlocs.userId, userId));
    const etatsSupprimes = await tx
      .delete(dailyStates)
      .where(eq(dailyStates.userId, userId))
      .returning({ id: dailyStates.id });
    const peseesSupprimees = await tx
      .delete(bodyWeights)
      .where(eq(bodyWeights.userId, userId))
      .returning({ id: bodyWeights.id });
    const contraintesSupprimees = await tx
      .delete(contraintes)
      .where(eq(contraintes.userId, userId))
      .returning({ id: contraintes.id });
    await tx.delete(precalcSessions).where(eq(precalcSessions.userId, userId));
    await tx.delete(weeklyDebriefs).where(eq(weeklyDebriefs.userId, userId));

    // La préférence de salle pointe vers un lieu : la vider AVANT de pouvoir
    // supprimer ce lieu, sinon la clé étrangère refuse.
    await tx
      .update(users)
      .set({ prefSalleParDefautId: null })
      .where(eq(users.id, userId));

    // --- Lieux, seulement si demandé, et seulement s'ils sont à ce compte ---
    const lieuxSupprimes: string[] = [];
    const lieuxConserves: Array<{ nom: string; raison: string }> = [];

    if (options.supprimerMesLieux) {
      const mesLieux = await tx.query.gyms.findMany({ where: eq(gyms.userId, userId) });
      for (const lieu of mesLieux) {
        // Un lieu où quelqu'un d'autre s'est entraîné ne m'appartient plus
        // vraiment : l'effacer emporterait son historique.
        const [{ n } = { n: 0 }] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(sessionLogs)
          .where(and(eq(sessionLogs.gymId, lieu.id), ne(sessionLogs.userId, userId)));
        if (n > 0) {
          lieuxConserves.push({ nom: lieu.nom, raison: "un autre compte s'y est entraîné" });
          continue;
        }

        const machinesDAutrui = await tx.query.exerciseInstances.findMany({
          where: and(eq(exerciseInstances.gymId, lieu.id), ne(exerciseInstances.userId, userId)),
          columns: { id: true },
        });
        if (machinesDAutrui.length > 0) {
          lieuxConserves.push({ nom: lieu.nom, raison: "un autre compte y a saisi des exercices" });
          continue;
        }

        await tx.delete(exerciseInstances).where(eq(exerciseInstances.gymId, lieu.id));
        await tx.delete(gyms).where(eq(gyms.id, lieu.id));
        lieuxSupprimes.push(lieu.nom);
      }
    }

    // Les exercices créés à la main par ce compte disparaissent avec lui, sauf
    // ceux qu'une salle utilise encore : les effacer emporterait une entrée à
    // laquelle quelqu'un tient. Le catalogue commun (`user_id` nul) n'est
    // jamais touché.
    const mesExercices = await tx.query.exercises.findMany({
      where: eq(exercises.userId, userId),
      columns: { id: true },
    });
    for (const e of mesExercices) {
      const utilise = await tx.query.exerciseInstances.findFirst({
        where: eq(exerciseInstances.exerciseId, e.id),
        columns: { id: true },
      });
      if (!utilise) await tx.delete(exercises).where(eq(exercises.id, e.id));
    }

    // --- Le profil redevient celui d'un compte neuf ---
    await tx
      .update(users)
      .set({
        onboardingTermineLe: null,
        objectifType: null,
        objectifMusclesPrioritaires: null,
        objectifChiffre: null,
        dateCible: null,
        niveauExperience: null,
        anneesDePratique: null,
        moisDInterruption: null,
        frequenceCibleParSemaine: null,
        frequenceMinParSemaine: null,
        frequenceMaxParSemaine: null,
        dureeSeanceCibleMinutes: null,
        dureeSeanceMaxMinutes: null,
        preferenceMateriel: null,
        exercicesRefuses: null,
        exercicesApprecies: null,
        materielPersonnelHabituel: null,
        prefSalleParDefautId: null,
        phaseNutritionnelle: null,
        taille: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return {
      seances: idsSeances.length,
      series,
      etatsDuJour: etatsSupprimes.length,
      blocs: idsBlocs.length,
      gabarits: idsGabarits.length,
      contraintes: contraintesSupprimees.length,
      conversations: idsConversations.length,
      pesees: peseesSupprimees.length,
      lieuxSupprimes,
      lieuxConserves,
    };
  });
}
