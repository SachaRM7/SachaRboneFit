import { z } from "zod";
import { reserveVersRpe } from "@/lib/engine/reserve";

export const sessionDraftExerciseSchema = z.object({
  clientId: z.string().uuid(),
  exerciseInstanceId: z.string().uuid(),
  order: z.number().int().min(0).max(11),
  sets: z.number().int().min(1).max(12),
  repMin: z.number().int().min(1).max(50),
  repMax: z.number().int().min(1).max(50),
  targetRir: z.number().int().min(0).max(5).nullable(),
  tempo: z.string().trim().max(16).nullable(),
  restSeconds: z.number().int().min(0).max(900),
}).superRefine((exercise, context) => {
  if (exercise.repMax < exercise.repMin) {
    context.addIssue({
      code: "custom",
      path: ["repMax"],
      message: "La borne haute doit être supérieure ou égale à la borne basse.",
    });
  }
});

export const sessionDraftSchema = z.object({
  id: z.string().uuid(),
  origin: z.enum(["blank", "duplicate", "coach"]),
  sourceTemplateId: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(80),
  letter: z.string().trim().min(1).max(8),
  gymId: z.string().uuid(),
  durationMinutes: z.number().int().min(10).max(240).nullable(),
  exercises: z.array(sessionDraftExerciseSchema).min(1).max(12),
}).superRefine((draft, context) => {
  const instances = new Set<string>();
  for (const [index, exercise] of draft.exercises.entries()) {
    if (instances.has(exercise.exerciseInstanceId)) {
      context.addIssue({
        code: "custom",
        path: ["exercises", index, "exerciseInstanceId"],
        message: "Un exercice ne peut apparaître qu'une fois dans la séance.",
      });
    }
    instances.add(exercise.exerciseInstanceId);
  }
});

export const sessionScopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("today") }),
  z.object({
    type: z.literal("replace_next"),
    rotationTemplateId: z.string().uuid(),
  }),
  z.object({ type: z.literal("program") }),
]);

export const saveSessionDraftSchema = z.object({
  draft: sessionDraftSchema,
  scope: sessionScopeSchema,
});

export type SessionDraft = z.infer<typeof sessionDraftSchema>;
export type SessionDraftExercise = z.infer<typeof sessionDraftExerciseSchema>;
export type SessionScope = z.infer<typeof sessionScopeSchema>;

export function normalizeDraftExercises(
  exercises: SessionDraftExercise[],
): SessionDraftExercise[] {
  return [...exercises]
    .sort((a, b) => a.order - b.order)
    .map((exercise, order) => ({ ...exercise, order }));
}

export function targetRpe(targetRir: number | null): number | null {
  return targetRir === null ? null : reserveVersRpe(targetRir);
}

export function newBlankDraft(gymId = ""): Omit<SessionDraft, "gymId"> & { gymId: string } {
  return {
    id: crypto.randomUUID(),
    origin: "blank",
    name: "Ma séance",
    letter: "LIBRE",
    gymId,
    durationMinutes: 45,
    exercises: [],
  };
}
