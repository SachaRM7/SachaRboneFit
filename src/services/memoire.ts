import { db } from "@/db/client";
import { exerciseInstances, exercises, sessionLogs, sessionPlanItems } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { empecheParLesCirconstances, type ContexteAdaptation } from "@/lib/engine/tracabilite";
import {
  classerEmpechements,
  suggestionsProgramme,
  type EmpechementBrut,
  type EmpechementClasse,
  type SuggestionProgramme,
} from "@/lib/engine/memoire-empechements";

/**
 * La mémoire des empêchements, lue en base.
 *
 * Elle ne décide rien : elle rend disponible ce que le planificateur pourra
 * choisir de prendre en compte. Le tri entre empêchement subi et remplacement
 * volontaire est fait ici, une fois, par `tracabilite` — un exercice écarté par
 * préférence n'entre jamais dans cette mémoire.
 */

export interface MemoireEmpechements {
  classes: EmpechementClasse[];
  suggestions: SuggestionProgramme[];
}

export async function memoireEmpechements(
  userId: string,
  aujourdhui = new Date().toISOString().slice(0, 10),
): Promise<MemoireEmpechements> {
  const lignes = await db
    .select({
      prevuInstanceId: sessionPlanItems.exerciseInstancePrevuId,
      faitInstanceId: sessionPlanItems.exerciseInstanceId,
      raison: sessionPlanItems.raisonSubstitution,
      contexte: sessionPlanItems.contexteAdaptation,
      date: sessionLogs.date,
      exerciceId: exercises.id,
      nom: exercises.nom,
    })
    .from(sessionPlanItems)
    .innerJoin(sessionLogs, eq(sessionLogs.id, sessionPlanItems.sessionLogId))
    // La jointure porte sur l'instance PRÉVUE : ce qui nous intéresse est
    // l'exercice qu'on n'a pas pu faire, pas celui qui l'a remplacé.
    .innerJoin(exerciseInstances, eq(exerciseInstances.id, sessionPlanItems.exerciseInstancePrevuId))
    .innerJoin(exercises, eq(exercises.id, exerciseInstances.exerciseId))
    .where(and(eq(sessionLogs.userId, userId), isNull(sessionLogs.archiveLe)));

  const empechements: EmpechementBrut[] = [];
  for (const l of lignes) {
    const tracee = {
      exerciseInstanceId: l.faitInstanceId,
      exerciseInstancePrevuId: l.prevuInstanceId,
      raisonSubstitution: l.raison,
      contexteAdaptation: l.contexte as ContexteAdaptation | null,
    };
    if (!empecheParLesCirconstances(tracee)) continue;
    empechements.push({
      exerciceId: l.exerciceId,
      instanceId: l.prevuInstanceId!,
      nom: l.nom,
      date: l.date,
      contexte: tracee.contexteAdaptation,
    });
  }

  const classes = classerEmpechements({ empechements, aujourdhui });
  return { classes, suggestions: suggestionsProgramme(classes) };
}
