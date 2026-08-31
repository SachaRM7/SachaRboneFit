import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { setLogs, sessionLogs } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import type { SetLog } from "@/db/schema";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";

export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const exerciseInstanceId = searchParams.get("exerciseInstanceId");

  if (!exerciseInstanceId) {
    return NextResponse.json({ error: "exerciseInstanceId required" }, { status: 400 });
  }

  // Get the most recent session for this exercise instance
  const result = await db
    .select()
    .from(setLogs)
    .where(eq(setLogs.exerciseInstanceId, exerciseInstanceId))
    .orderBy(desc(setLogs.createdAt))
    .limit(20);

  if (result.length === 0) {
    return NextResponse.json(null);
  }

  // Find the most recent session_log_id
  const mostRecentSessionLogId = result[0]!.sessionLogId;

  // Verify the session belongs to the authenticated user
  const session = await db.query.sessionLogs.findFirst({
    where: eq(sessionLogs.id, mostRecentSessionLogId),
  });

  if (!session || session.userId !== userId) {
    return NextResponse.json(null);
  }

  // Filter sets belonging to the most recent session
  const lastSessionSets = result
    .filter((sl: SetLog) => sl.sessionLogId === mostRecentSessionLogId)
    .sort((a: SetLog, b: SetLog) => a.numeroSerie - b.numeroSerie)
    .map((sl: SetLog) => ({
      numero: sl.numeroSerie,
      reps: sl.repsEffectuees,
      charge: sl.charge,
      // Sans le RPE, la séance précédente était estimée sans réserve et la
      // séance en cours avec : les deux côtés de la comparaison ne mesuraient
      // pas la même chose.
      rpe: sl.rpeEffectif,
    }));

  return NextResponse.json({ sets: lastSessionSets });
}
