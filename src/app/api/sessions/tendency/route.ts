import { NextResponse } from "next/server";
import { estimer1RMDepuisRpe } from "@/lib/engine/records";
import { db } from "@/db/client";
import { sessionLogs, setLogs, exerciseInstances, exercises } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { seancesActives } from "@/db/archivage";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import type { SessionPilierPerf } from "@/lib/engine/feu-biologique";

export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const seanceTemplateId = searchParams.get("seanceTemplateId");
  const limit = parseInt(searchParams.get("limit") || "3", 10);

  if (!seanceTemplateId) {
    return NextResponse.json({ error: "seanceTemplateId required" }, { status: 400 });
  }

  /**
   * Les séances de ce gabarit qui comptent encore.
   *
   * Le tri par utilisateur se faisait en mémoire, après coup, et l'archivage ne
   * se faisait nulle part : une séance retirée du calcul continuait de peser sur
   * la tendance du feu biologique de ce gabarit. Les deux critères descendent
   * dans la requête — celui du compte parce qu'il n'a jamais eu de raison d'en
   * sortir, celui de l'archivage parce qu'il manquait.
   */
  const sessions = await db.query.sessionLogs.findMany({
    where: and(seancesActives(userId), eq(sessionLogs.seanceTemplateId, seanceTemplateId)),
    orderBy: [desc(sessionLogs.createdAt)],
  });

  const result = [];

  for (const session of sessions) {
    // Get set logs for this session with exercise instance info
    const sets = await db.query.setLogs.findMany({
      where: eq(setLogs.sessionLogId, session.id),
    });

    const pilierPerfs: SessionPilierPerf[] = [];

    for (const sl of sets) {
      // Get exercise instance info
      const instance = await db.query.exerciseInstances.findFirst({
        where: eq(exerciseInstances.id, sl.exerciseInstanceId),
      });
      if (!instance) continue;

      const exercise = await db.query.exercises.findFirst({
        where: eq(exercises.id, instance.exerciseId),
      });
      if (!exercise) continue;

      if (exercise.categorieRole === "pilier") {
        const estimated1RM = estimer1RMDepuisRpe(sl.charge, sl.repsEffectuees, sl.rpeEffectif);
        pilierPerfs.push({
          exerciseInstanceId: sl.exerciseInstanceId,
          exerciseName: exercise.nom,
          volumeTotal: sl.charge * sl.repsEffectuees,
          estimated1RM,
        });
      }
    }

    result.push({
      date: session.date,
      feuJour: session.feuBiologiqueJour as "vert" | "orange" | "rouge",
      pilierPerfs,
    });
  }

  return NextResponse.json(result);
}
