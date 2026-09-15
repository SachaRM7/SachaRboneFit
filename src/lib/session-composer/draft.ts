import { z } from "zod";
import { reserveVersRpe } from "@/lib/engine/reserve";
import type { PrescriptionParDefaut } from "@/db/schema";

/**
 * Les valeurs de prescription HISTORIQUES de l'application.
 *
 * Elles servaient deja de defauts dans les formulaires ; elles sont nommees ici
 * parce qu'elles font desormais autre chose que remplir un champ : quand l'un
 * de ces nombres n'a PAS ete choisi, il est ecrit a la creation puis signale
 * comme tel (`prescription_par_defaut`), pour que l'ecran puisse demander de le
 * confirmer. Une seule definition, partagee par le compositeur et par le
 * programme : la meme donnee ne peut pas avoir deux defauts.
 */
export const SERIES_PAR_DEFAUT = 3;
export const REPS_MIN_PAR_DEFAUT = 8;
export const REPS_MAX_PAR_DEFAUT = 12;
export const REPOS_PAR_DEFAUT_SECONDES = 120;

/**
 * Résout une prescription partielle SANS jamais inventer de charge.
 *
 * Trois séries, 8 à 12 répétitions, 120 s de repos : ce sont les valeurs que
 * l'écran proposait déjà, et ce sont celles que le moteur de volume et la
 * double progression savent lire. Les colonnes `series_cibles`,
 * `fourchette_reps_min` et `fourchette_reps_max` restent donc NOT NULL — rendre
 * tout le schéma nullable obligerait chaque lecture du moteur à gérer une
 * absence, pour aucun gain.
 *
 * Le compromis est explicite : un défaut ÉCRIT n'est pas une prescription. Les
 * champs que personne n'a choisis sont rendus dans `prescriptionParDefaut`, et
 * l'écran peut alors demander de les confirmer au lieu de présenter
 * « 3 × 8-12 » comme une décision de l'utilisateur.
 *
 * La charge, elle, n'a pas de défaut : un « 0 kg » écrit s'afficherait comme une
 * charge réelle. Elle reste `null` tant que personne ne l'a déclarée.
 */
export function prescrireAvecDefauts(donnees: {
  seriesCibles?: number | null;
  fourchetteRepsMin?: number | null;
  fourchetteRepsMax?: number | null;
  reposSecondes?: number | null;
}): {
  seriesCibles: number;
  fourchetteRepsMin: number;
  fourchetteRepsMax: number;
  reposSecondes: number | null;
  prescriptionParDefaut: PrescriptionParDefaut | null;
} {
  const omis: PrescriptionParDefaut = [];
  if (donnees.seriesCibles == null) omis.push("seriesCibles");
  if (donnees.fourchetteRepsMin == null) omis.push("fourchetteRepsMin");
  if (donnees.fourchetteRepsMax == null) omis.push("fourchetteRepsMax");
  if (donnees.reposSecondes == null) omis.push("reposSecondes");

  return {
    seriesCibles: donnees.seriesCibles ?? SERIES_PAR_DEFAUT,
    fourchetteRepsMin: donnees.fourchetteRepsMin ?? REPS_MIN_PAR_DEFAUT,
    fourchetteRepsMax: donnees.fourchetteRepsMax ?? REPS_MAX_PAR_DEFAUT,
    reposSecondes: donnees.reposSecondes ?? null,
    prescriptionParDefaut: omis.length > 0 ? omis : null,
  };
}

export const sessionDraftExerciseSchema = z.object({
  clientId: z.string().uuid(),
  exerciseInstanceId: z.string().uuid(),
  order: z.number().int().min(0).max(11),
  /**
   * Toute la config peut etre omise.
   *
   * `default()` rend la valeur facultative en ENTREE et obligatoire en SORTIE :
   * un brouillon sans nombre de series decrit 3 series, et les modules qui
   * lisent ce type continuent de lire un nombre. L'absence est resolue ici,
   * une fois, plutot que par un `?? 3` recopie dans chaque appelant.
   */
  sets: z.number().int().min(1).max(12).optional().default(SERIES_PAR_DEFAUT),
  repMin: z.number().int().min(1).max(50).optional().default(REPS_MIN_PAR_DEFAUT),
  repMax: z.number().int().min(1).max(50).optional().default(REPS_MAX_PAR_DEFAUT),
  targetRir: z.number().int().min(0).max(5).nullable(),
  tempo: z.string().trim().max(16).nullable(),
  restSeconds: z.number().int().min(0).max(900).optional().default(REPOS_PAR_DEFAUT_SECONDES),
  /**
   * La charge programmee, en kg.
   *
   * Nullable, et sans defaut : `null` veut dire « rien n'a ete programme ».
   * Inventer un nombre ici afficherait une charge que personne n'a choisie.
   */
  chargeCible: z.number().gt(0).max(1000).nullable().optional(),
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
