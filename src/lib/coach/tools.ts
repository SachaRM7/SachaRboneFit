import { db } from "@/db/client";
import { estimer1RMDepuisRpe } from "@/lib/engine/records";
import { setLogs, sessionLogs, exercises, exerciseInstances, sessionIncidents } from "@/db/schema";
import { eq, desc, isNull } from "drizzle-orm";
import { findSubstitutes, type ExerciseInstanceWithExercise, type SubstitutionCriteria } from "@/lib/engine/substitutions";
import { computeNextSets } from "@/lib/engine/double-progression";
import { libelleProfilTension, libelleTypeMouvement } from "@/lib/referentiels/libelles";
import { configurationDe } from "@/lib/engine/charges";
import { DEFINITIONS_CONTEXTE, EXECUTEURS_CONTEXTE } from "./outils-contexte";
import { DEFINITIONS_PROGRAMME, EXECUTEURS_PROGRAMME } from "./outils-programme";
import {
  DEFINITIONS_ECRITURE, EXECUTEURS_ECRITURE,
  DEFINITIONS_CONTRAINTES, EXECUTEURS_CONTRAINTES,
} from "./outils-ecriture";
import { seanceCourante } from "@/services/seances";

export interface CoachTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolExecutionResult {
  success: boolean;
  output: string;
}

/**
 * Références de l'objet regardé, résolues et vérifiées côté serveur.
 *
 * Redéclarées ici plutôt qu'importées du service : les outils ne doivent pas
 * dépendre d'une couche au-dessus d'eux. Le service fournit la valeur, ce type
 * dit ce qu'un outil a le droit d'en attendre.
 */
export interface RefsContexteOutil {
  ecran: string;
  blocId: string | null;
  seanceTemplateId: string | null;
  exerciseInstanceId: string | null;
  /** Séance du jour en cours, quand l'écran en désigne une. Jamais du modèle. */
  sessionLogId: string | null;
}

/**
 * Un outil reçoit ses arguments, l'utilisateur authentifié, et — pour ceux que
 * ça concerne — les références de ce qui est affiché à l'écran.
 *
 * Le troisième paramètre est facultatif : les outils qui n'en ont pas besoin
 * gardent leur signature à deux arguments. Il ne vient jamais du modèle, qui
 * ne peut donc ni le fabriquer ni désigner l'objet d'un autre utilisateur.
 */
export type ToolExecutor = (
  params: Record<string, unknown>,
  userId: string,
  contexte?: RefsContexteOutil,
) => Promise<ToolExecutionResult>;

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
    // Arrondi à l'affichage seulement : le calcul, lui, passe par la référence.
    const estimated1RM = Math.round(estimer1RMDepuisRpe(set.charge, set.repsEffectuees, set.rpeEffectif));

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

  // Les séances archivées sont exclues partout ailleurs — bilan, progression,
  // tableau de bord. Le coach était le seul à les compter : il annonçait un
  // volume hebdomadaire que l'écran Progression contredisait.
  const sessions = await db.query.sessionLogs.findMany({
    where: (sl, { eq, and, gte, lte, isNull }) =>
      and(eq(sl.userId, userId), isNull(sl.archiveLe), gte(sl.date, startStr), lte(sl.date, endStr)),
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
    where: isNull(exerciseInstances.archiveLe),
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
    type?: string;
    nom?: string;
    categorieRole?: string;
    musclesPrincipaux?: string[];
  } | null;

  if (!targetExercise) {
    return { success: false, output: "Exercice non trouvé" };
  }

  const instancesWithNom: ExerciseInstanceWithExercise[] = allInstances.map(i => {
    const ex = i.exercise as { pilier?: string; nom?: string; categorieRole?: string; profilTension?: string; type?: string; musclesPrincipaux?: string[] } | null;
    return {
      id: i.id,
      gymId: i.gymId,
      exerciseId: i.exerciseId,
      nom: ex?.nom || "",
      machineNom: i.machineNom,
      categorieRole: (ex?.categorieRole as "pilier" | "substitut" | "accessoire") || "accessoire",
      profilTension: ex?.profilTension || "",
      type: ex?.type || "",
      musclesPrincipaux: ex?.musclesPrincipaux || [],
      pilier: ex?.pilier || "",
    };
  });

  const criteria: SubstitutionCriteria = {
    pilier: targetExercise.pilier,
    profilTension: targetExercise.profilTension,
    // À profil égal, un substitut de même nature est plus fidèle.
    type: targetExercise.type,
    gymId,
    excludeExerciseIds: [exerciseInstanceId],
  };

  const substitutes = findSubstitutes(instancesWithNom, criteria);

  if (substitutes.length === 0) {
    return { success: true, output: "Aucun substitut disponible dans cette salle" };
  }

  return {
    success: true,
    output: substitutes
      .map((s) => `- ${s.exerciseName} (${s.machineName}) - ${s.categorieRole} `
        + `[${libelleProfilTension(s.profilTension)}, ${libelleTypeMouvement(s.type)}]`)
      .join("\n"),
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
    charge: configurationDe(instance),
  };

  const suggestion = computeNextSets({ sets: sessionSets }, target);

  return {
    success: true,
    output: suggestion.charge === null
      ? `Prochaine séance : [${suggestion.reps.join(", ")}] reps — les sauts de charge de cet appareil `
        + `ne sont pas renseignés, aucune charge ne peut être proposée.\n${suggestion.messageProgression || ""}`
      : `Prochaine séance: ${suggestion.charge}kg x [${suggestion.reps.join(", ")}] reps\n${suggestion.messageProgression || ""}`,
  };
}

/**
 * Consigne un incident survenu pendant la séance du jour.
 *
 * Le seul outil d'écriture immédiate qui reste, et il l'est pour une raison
 * précise : il n'ajoute qu'une ligne à un journal, il ne modifie rien
 * d'existant, et ce qu'il consigne vient d'être dit par l'athlète — le
 * soumettre à confirmation reviendrait à lui redemander ce qu'il vient
 * d'affirmer.
 *
 * La séance n'est plus nommée par le modèle. Elle est résolue ici, et son
 * absence est une raison de ne rien écrire plutôt que d'écrire ailleurs.
 */
export async function logIncidentTool(
  type: "machine_occupee" | "douleur" | "energie_chute" | "temps_depasse",
  contexte: Record<string, unknown>,
  decision: string,
  impactProgramme: string | null,
  userId: string,
  sessionLogId: string | null,
): Promise<ToolExecutionResult> {
  const seance = sessionLogId ?? (await seanceCourante(userId))?.id ?? null;
  if (!seance) {
    return {
      success: false,
      output:
        "Aucune séance en cours aujourd'hui : un incident se rattache à une séance, il n'est pas enregistré. Dis-le à l'athlète plutôt que de réessayer.",
    };
  }

  await db.insert(sessionIncidents).values({
    sessionLogId: seance,
    type,
    contexte,
    decision,
    impactProgramme,
  });

  return { success: true, output: `Incident ${type} enregistré sur la séance du jour` };
}

/**
 * Ce qu'on dit au modèle plutôt que de le laisser deviner un identifiant.
 *
 * Un identifiant recopié de travers est un identifiant faux, pas une erreur
 * visible : le champ devient facultatif, et son absence désigne l'objet que le
 * serveur a lui-même résolu depuis l'écran.
 */
const OMETTRE_POUR_ECRAN =
  "Omets l'identifiant pour désigner l'exercice actuellement affiché à l'écran.";

export function createCoachTools(): CoachToolSet {
  const definitions: CoachTool[] = [
    {
      name: "get_exercise_history",
      description:
        "Retourne l'historique des séries pour un exercice. " + OMETTRE_POUR_ECRAN,
      input_schema: {
        type: "object",
        properties: {
          exerciseInstanceId: { type: "string", description: "ID de l'instance d'exercice. " + OMETTRE_POUR_ECRAN },
          limit: { type: "number", description: "Nombre de séances à retourner (défaut: 10)" },
        },
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
      description: "Retourne la liste des exercices substituables. " + OMETTRE_POUR_ECRAN,
      input_schema: {
        type: "object",
        properties: {
          exerciseInstanceId: { type: "string", description: "ID de l'exercice à remplacer. " + OMETTRE_POUR_ECRAN },
          gymId: { type: "string", description: "ID de la salle" },
        },
        required: ["gymId"],
      },
    },
    {
      name: "suggest_next_sets",
      description:
        "Suggère la prochaine charge et reps via double progression. " + OMETTRE_POUR_ECRAN,
      input_schema: {
        type: "object",
        properties: {
          exerciseInstanceId: { type: "string", description: "ID de l'instance d'exercice. " + OMETTRE_POUR_ECRAN },
        },
      },
    },
    {
      name: "log_incident",
      description:
        "Consigne un incident survenu pendant la séance du jour : machine occupée, douleur, " +
        "énergie en chute, temps dépassé. La séance concernée est déterminée par l'application — " +
        "ne la demande pas et ne la nomme pas.",
      input_schema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["machine_occupee", "douleur", "energie_chute", "temps_depasse"], description: "Type d'incident" },
          contexte: { type: "object", description: "Contexte de l'incident (détails spécifiques au type)" },
          decision: { type: "string", description: "Décision prise pour gérer l'incident" },
          impactProgramme: { type: "string", description: "Impact sur le programme si applicable" },
        },
        required: ["type", "contexte", "decision"],
      },
    },
  ];

  const executors: Record<string, ToolExecutor> = {
    get_exercise_history: async (params, userId, contexte) => {
      // À défaut d'identifiant fourni, celui de l'écran : « pourquoi cet
      // exercice ? » ne nomme rien, et le modèle n'a pas à deviner.
      const id = (params.exerciseInstanceId as string) || contexte?.exerciseInstanceId;
      if (!id) return { success: false, output: "Aucun exercice désigné." };
      return getExerciseHistory(id, (params.limit as number) || 10, userId);
    },
    get_weekly_summary: async (params, userId) => {
      return getWeeklySummary((params.weekOffset as number) || 0, userId);
    },
    get_available_substitutes: async (params, userId, contexte) => {
      const id = (params.exerciseInstanceId as string) || contexte?.exerciseInstanceId;
      if (!id) return { success: false, output: "Aucun exercice désigné." };
      return getAvailableSubstitutes(id, params.gymId as string, userId);
    },
    suggest_next_sets: async (params, userId, contexte) => {
      const id = (params.exerciseInstanceId as string) || contexte?.exerciseInstanceId;
      if (!id) return { success: false, output: "Aucun exercice désigné." };
      return suggestNextSetsTool(id, userId);
    },
    log_incident: async (params, userId, contexte) => {
      return logIncidentTool(
        params.type as "machine_occupee" | "douleur" | "energie_chute" | "temps_depasse",
        (params.contexte as Record<string, unknown>) ?? {},
        params.decision as string,
        (params.impactProgramme as string) || null,
        userId,
        // La séance de l'écran quand il y en a une, celle du jour sinon. Dans
        // les deux cas résolue par le serveur.
        contexte?.sessionLogId ?? null,
      );
    },
  };

  // Les outils de séance ne suffisent pas : sans profil, sans état du jour et
  // sans le parc réel de la salle, le modèle doit improviser ce que
  // l'application sait déjà. Les outils d'écriture ferment la dernière lacune —
  // le coach pouvait tout analyser du programme sans pouvoir en toucher une
  // ligne — et le font par proposition, jamais par mutation directe.
  return {
    definitions: [
      ...definitions, ...DEFINITIONS_CONTEXTE, ...DEFINITIONS_PROGRAMME, ...DEFINITIONS_ECRITURE,
      ...DEFINITIONS_CONTRAINTES,
    ],
    executors: {
      ...executors, ...EXECUTEURS_CONTEXTE, ...EXECUTEURS_PROGRAMME, ...EXECUTEURS_ECRITURE,
      ...EXECUTEURS_CONTRAINTES,
    },
  };
}
