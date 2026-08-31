import { NextResponse } from "next/server";
import { estimer1RMDepuisRpe } from "@/lib/engine/records";
import { db } from "@/db/client";
import { sessionLogs, setLogs, exerciseInstances, exercises } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
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

  // Get sessions for this template
  const sessions = await db.query.sessionLogs.findMany({
    where: eq(sessionLogs.seanceTemplateId, seanceTemplateId),
    orderBy: [desc(sessionLogs.createdAt)],
  });

  const result = [];

  for (const session of sessions) {
    // Only include sessions belonging to the authenticated user
    if (session.userId !== userId) continue;

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
