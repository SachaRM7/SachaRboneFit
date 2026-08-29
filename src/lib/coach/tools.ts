import { db } from "@/db/client";
import { setLogs, sessionLogs, exercises, exerciseInstances, seanceTemplates, programmeBlocs, sessionIncidents } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { findSubstitutes, type ExerciseInstanceWithExercise, type SubstitutionCriteria, type SubstituteResult } from "@/lib/engine/substitutions";
import { computeNextSets } from "@/lib/engine/double-progression";
import { DEFINITIONS_CONTEXTE, EXECUTEURS_CONTEXTE } from "./outils-contexte";
import { DEFINITIONS_PROGRAMME, EXECUTEURS_PROGRAMME } from "./outils-programme";

export interface CoachTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolExecutionResult {
  success: boolean;
  output: string;
}

export type ToolExecutor = (params: Record<string, unknown>, userId: string) => Promise<ToolExecutionResult>;

export interface CoachToolSet {
  definitions: CoachTool[];
  executors: Record<string, ToolExecutor>;
}

export async function getExerciseHistory(
  exerciseInstanceId: string,
  limit: number = 10,
  userId: string
): Promise<ToolExecutionResult> {
  const sets = await db.query.setLogs.findMany({
    where: eq(setLogs.exerciseInstanceId, exerciseInstanceId),
    orderBy: [desc(setLogs.createdAt)],
    limit: limit * 2, // Overfetch, we'll filter by session
  });

  const results: Array<{ date: string; charge: number; reps: number; estimated1RM: number }> = [];
  const seenSessions = new Set<string>();

  for (const set of sets) {
    if (seenSessions.has(set.sessionLogId)) continue;

    const session = await db.query.sessionLogs.findFirst({
      where: eq(sessionLogs.id, set.sessionLogId),
    });

    if (!session || session.userId !== userId) continue;

    seenSessions.add(set.sessionLogId);
    const estimated1RM = Math.round(set.charge * (1 + set.repsEffectuees / 30));

    results.push({
      date: session.date,
      charge: set.charge,
      reps: set.repsEffectuees,
      estimated1RM,
    });

    if (results.length >= limit) break;
  }

  return {
    success: true,
    output: results.length > 0
      ? results.map(r => `${r.date}: ${r.charge}kg x ${r.reps} reps (est. 1RM: ${r.estimated1RM}kg)`).join("\n")
      : "Aucune historique trouvé pour cet exercice.",
  };
}

export async function getWeeklySummary(
  weekOffset: number = 0,
  userId: string
): Promise<ToolExecutionResult> {
  const now = new Date();
  if (weekOffset !== 0) {
    now.setDate(now.getDate() + weekOffset * 7);
  }

  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + 1);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  const startStr = startOfWeek.toISOString().slice(0, 10);
  const endStr = endOfWeek.toISOString().slice(0, 10);

  const sessions = await db.query.sessionLogs.findMany({
    where: (sl, { eq, and, gte, lte }) =>
      and(eq(sl.userId, userId), gte(sl.date, startStr), lte(sl.date, endStr)),
  });

  if (sessions.length === 0) {
    return { success: true, output: "Aucune séance cette semaine." };
  }

  const pilierVolumes: Record<string, number> = {};
  let totalSets = 0;

  for (const session of sessions) {
    const sets = await db.query.setLogs.findMany({
      where: eq(setLogs.sessionLogId, session.id),
    });
    totalSets += sets.length;

    for (const set of sets) {
      const instance = await db.query.exerciseInstances.findFirst({
        where: eq(exerciseInstances.id, set.exerciseInstanceId),
      });
      if (!instance) continue;

      const exercise = await db.query.exercises.findFirst({
        where: eq(exercises.id, instance.exerciseId),
      });
      if (!exercise) continue;

      const volume = set.charge * set.repsEffectuees;
      const pilier = exercise.pilier || "core";
      pilierVolumes[pilier] = (pilierVolumes[pilier] || 0) + volume;
    }
  }

  const feuCounts = { vert: 0, orange: 0, rouge: 0 };
  for (const s of sessions) {
    if (s.feuBiologiqueJour === "vert") feuCounts.vert++;
    else if (s.feuBiologiqueJour === "orange") feuCounts.orange++;
    else if (s.feuBiologiqueJour === "rouge") feuCounts.rouge++;
  }

  const volumeLines = Object.entries(pilierVolumes)
    .map(([pilier, vol]) => `${pilier}: ${Math.round(vol)}kg de volume`)
    .join("\n");

  return {
    success: true,
    output: `Semaine du ${startStr} au ${endStr}:\n${sessions.length} séances, ${totalSets} séries\n\n${volumeLines}\n\nFeu: ${feuCounts.vert}V ${feuCounts.orange}O ${feuCounts.rouge}R`,
  };
}

export async function getAvailableSubstitutes(
  exerciseInstanceId: string,
  gymId: string,
  userId: string
): Promise<ToolExecutionResult> {
  // Get all exercise instances for user at this gym
  const allInstances = await db.query.exerciseInstances.findMany({
    where: eq(exerciseInstances.userId, userId),
    with: { exercise: true },
  });

  const targetInstance = allInstances.find(i => i.id === exerciseInstanceId);
  if (!targetInstance) {
    return { success: false, output: "Exercice non trouvé" };
  }

  // Cast exercise to access properties
  const targetExercise = targetInstance.exercise as {
    pilier: string;
    profilTension: string;
    nom?: string;
    categorieRole?: string;
    musclesPrincipaux?: string[];
  } | null;

  if (!targetExercise) {
    return { success: false, output: "Exercice non trouvé" };
  }

  const instancesWithNom: ExerciseInstanceWithExercise[] = allInstances.map(i => {
    const ex = i.exercise as { pilier?: string; nom?: string; categorieRole?: string; profilTension?: string; musclesPrincipaux?: string[] } | null;
    return {
      id: i.id,
      gymId: i.gymId,
      exerciseId: i.exerciseId,
      nom: ex?.nom || "",
      machineNom: i.machineNom,
      categorieRole: (ex?.categorieRole as "pilier" | "substitut" | "accessoire") || "accessoire",
      profilTension: ex?.profilTension || "",
      musclesPrincipaux: ex?.musclesPrincipaux || [],
      pilier: ex?.pilier || "",
    };
  });

  const criteria: SubstitutionCriteria = {
    pilier: targetExercise.pilier,
    profilTension: targetExercise.profilTension,
    gymId,
    excludeExerciseIds: [exerciseInstanceId],
  };

  const substitutes = findSubstitutes(instancesWithNom, criteria);

  if (substitutes.length === 0) {
    return { success: true, output: "Aucun substitut disponible dans cette salle" };
  }

  return {
    success: true,
    output: substitutes.map(s => `- ${s.exerciseName} (${s.machineName}) - ${s.categorieRole} [${s.profilTension}]`).join("\n"),
  };
}

export async function suggestNextSetsTool(
  exerciseInstanceId: string,
  userId: string
): Promise<ToolExecutionResult> {
  // Get the exercise instance
  const instance = await db.query.exerciseInstances.findFirst({
    where: eq(exerciseInstances.id, exerciseInstanceId),
    with: { exercise: true },
  });

  if (!instance) {
    return { success: false, output: "Exercice non trouvé" };
  }

  // Get last session sets for this instance
  const lastSets = await db.query.setLogs.findMany({
    where: eq(setLogs.exerciseInstanceId, exerciseInstanceId),
    orderBy: [desc(setLogs.createdAt)],
  });

  if (lastSets.length === 0) {
    return { success: true, output: "Pas d'historique pour cet exercice. Charge de départ non connue." };
  }

  // Find the most recent session
  const mostRecentSessionLogId = lastSets[0]!.sessionLogId;
  const sessionSets = lastSets
    .filter(s => s.sessionLogId === mostRecentSessionLogId)
    .sort((a, b) => a.numeroSerie - b.numeroSerie)
    .map(s => ({ numero: s.numeroSerie, reps: s.repsEffectuees, charge: s.charge }));

  // Get template data for targets
  // For now, use default targets from the instance
  const target = {
    fourchetteRepsMin: 6,
    fourchetteRepsMax: 10,
    seriesCibles: 4,
    incrementsPossibles: instance.incrementsPossibles || [2.5, 5],
  };

  const suggestion = computeNextSets({ sets: sessionSets }, target);

  return {
    success: true,
    output: `Prochaine séance: ${suggestion.charge}kg x [${suggestion.reps.join(", ")}] reps\n${suggestion.messageProgression || ""}`,
  };
}

export async function logSetTool(
  sessionLogId: string,
  exerciseInstanceId: string,
  reps: number,
  charge: number,
  rpe: number | null,
  tempo: string | null,
  userId: string
): Promise<ToolExecutionResult> {
  // Verify session belongs to user
  const session = await db.query.sessionLogs.findFirst({
    where: eq(sessionLogs.id, sessionLogId),
  });

  if (!session || session.userId !== userId) {
    return { success: false, output: "Session non trouvée ou non autorisée" };
  }

  // Get next serie number
  const existingSets = await db.query.setLogs.findMany({
    where: eq(setLogs.sessionLogId, sessionLogId),
  });

  const maxSerie = existingSets.reduce((max, s) => Math.max(max, s.numeroSerie), 0);

  await db.insert(setLogs).values({
    sessionLogId,
    exerciseInstanceId,
    numeroSerie: maxSerie + 1,
    repsEffectuees: reps,
    charge,
    rpeEffectif: rpe ?? null,
    tempoRespecte: tempo ? true : null,
  });

  return { success: true, output: `Série enregistrée: ${charge}kg x ${reps} reps` };
}

export async function logIncidentTool(
  sessionLogId: string,
  type: "machine_occupee" | "douleur" | "energie_chute" | "temps_depasse",
  contexte: Record<string, unknown>,
  decision: string,
  impactProgramme: string | null,
  userId: string
): Promise<ToolExecutionResult> {
  // Verify session belongs to user
  const session = await db.query.sessionLogs.findFirst({
    where: eq(sessionLogs.id, sessionLogId),
  });

  if (!session || session.userId !== userId) {
    return { success: false, output: "Session non trouvée ou non autorisée" };
  }

  await db.insert(sessionIncidents).values({
    sessionLogId,
    type,
    contexte,
    decision,
    impactProgramme,
  });

  return { success: true, output: `Incident ${type} enregistré` };
}

export async function endSessionTool(
  sessionLogId: string,
  energieFin: number,
  notes: string | null,
  userId: string
): Promise<ToolExecutionResult> {
  const session = await db.query.sessionLogs.findFirst({
    where: eq(sessionLogs.id, sessionLogId),
  });

  if (!session || session.userId !== userId) {
    return { success: false, output: "Session non trouvée ou non autorisée" };
  }

  await db.update(sessionLogs)
    .set({ energieFin, notesSeance: notes, updatedAt: new Date() })
    .where(eq(sessionLogs.id, sessionLogId));

  return { success: true, output: "Séance clôturée" };
}

export function createCoachTools(): CoachToolSet {
  const definitions: CoachTool[] = [
    {
      name: "get_exercise_history",
      description: "Retourne l'historique des séries pour un exercice donné",
      input_schema: {
        type: "object",
        properties: {
          exerciseInstanceId: { type: "string", description: "ID de l'instance d'exercice" },
          limit: { type: "number", description: "Nombre de séances à retourner (défaut: 10)" },
        },
        required: ["exerciseInstanceId"],
      },
    },
    {
      name: "get_weekly_summary",
      description: "Retourne un résumé du volume par pilier pour une semaine",
      input_schema: {
        type: "object",
        properties: {
          weekOffset: { type: "number", description: "Décalage de semaine (0 = cette semaine, -1 = semaine dernière)" },
        },
      },
    },
    {
      name: "get_available_substitutes",
      description: "Retourne la liste des exercices substituables",
      input_schema: {
        type: "object",
        properties: {
          exerciseInstanceId: { type: "string", description: "ID de l'exercice à remplacer" },
          gymId: { type: "string", description: "ID de la salle" },
        },
        required: ["exerciseInstanceId", "gymId"],
      },
    },
    {
      name: "suggest_next_sets",
      description: "Suggère la prochaine charge et reps via double progression",
      input_schema: {
        type: "object",
        properties: {
          exerciseInstanceId: { type: "string", description: "ID de l'instance d'exercice" },
        },
        required: ["exerciseInstanceId"],
      },
    },
    {
      name: "log_set",
      description: "Enregistre une série dans une session",
      input_schema: {
        type: "object",
        properties: {
          sessionLogId: { type: "string" },
          exerciseInstanceId: { type: "string" },
          reps: { type: "number" },
          charge: { type: "number" },
          rpe: { type: "number" },
          tempo: { type: "string" },
        },
        required: ["sessionLogId", "exerciseInstanceId", "reps", "charge"],
      },
    },
    {
      name: "end_session",
      description: "Clôture une séance",
      input_schema: {
        type: "object",
        properties: {
          sessionLogId: { type: "string" },
          energieFin: { type: "number" },
          notes: { type: "string" },
        },
        required: ["sessionLogId", "energieFin"],
      },
    },
    {
      name: "log_incident",
      description: "Logger un incident pendant une séance (machine occupée, douleur, énergie en chute, temps dépassé)",
      input_schema: {
        type: "object",
        properties: {
          sessionLogId: { type: "string", description: "ID de la session log" },
          type: { type: "string", enum: ["machine_occupee", "douleur", "energie_chute", "temps_depasse"], description: "Type d'incident" },
          contexte: { type: "object", description: "Contexte de l'incident (détails spécifiques au type)" },
          decision: { type: "string", description: "Décision prise pour gérer l'incident" },
          impactProgramme: { type: "string", description: "Impact sur le programme si applicable" },
        },
        required: ["sessionLogId", "type", "contexte", "decision"],
      },
    },
  ];

  const executors: Record<string, ToolExecutor> = {
    get_exercise_history: async (params, userId) => {
      return getExerciseHistory(params.exerciseInstanceId as string, (params.limit as number) || 10, userId);
    },
    get_weekly_summary: async (params, userId) => {
      return getWeeklySummary((params.weekOffset as number) || 0, userId);
    },
    get_available_substitutes: async (params, userId) => {
      return getAvailableSubstitutes(params.exerciseInstanceId as string, params.gymId as string, userId);
    },
    suggest_next_sets: async (params, userId) => {
      return suggestNextSetsTool(params.exerciseInstanceId as string, userId);
    },
    log_set: async (params, userId) => {
      return logSetTool(
        params.sessionLogId as string,
        params.exerciseInstanceId as string,
        params.reps as number,
        params.charge as number,
        (params.rpe as number) || null,
        (params.tempo as string) || null,
        userId
      );
    },
    end_session: async (params, userId) => {
      return endSessionTool(params.sessionLogId as string, params.energieFin as number, (params.notes as string) || null, userId);
    },
    log_incident: async (params, userId) => {
      return logIncidentTool(
        params.sessionLogId as string,
        params.type as "machine_occupee" | "douleur" | "energie_chute" | "temps_depasse",
        params.contexte as Record<string, unknown>,
        params.decision as string,
        (params.impactProgramme as string) || null,
        userId
      );
    },
  };

  // Les outils de séance ne suffisent pas : sans profil, sans état du jour et
  // sans le parc réel de la salle, le modèle doit improviser ce que
  // l'application sait déjà.
  return {
    definitions: [...definitions, ...DEFINITIONS_CONTEXTE, ...DEFINITIONS_PROGRAMME],
    executors: { ...executors, ...EXECUTEURS_CONTEXTE, ...EXECUTEURS_PROGRAMME },
  };
}
