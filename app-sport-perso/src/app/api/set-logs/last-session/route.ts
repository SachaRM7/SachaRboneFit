import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { setLogs, sessionLogs } from "@/db/schema";
import { MOCK_USER_ID } from "@/lib/constants";
import { eq, desc, sql } from "drizzle-orm";
import type { SetLog } from "@/db/schema";

export async function GET(request: Request) {
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

  // Filter sets belonging to the most recent session
  const lastSessionSets = result
    .filter((sl: SetLog) => sl.sessionLogId === mostRecentSessionLogId)
    .sort((a: SetLog, b: SetLog) => a.numeroSerie - b.numeroSerie)
    .map((sl: SetLog) => ({
      numero: sl.numeroSerie,
      reps: sl.repsEffectuees,
      charge: sl.charge,
    }));

  return NextResponse.json({ sets: lastSessionSets });
}
