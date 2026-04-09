import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { sessionLogs, setLogs, exerciseInstances, exercises } from "@/db/schema";
import { MOCK_USER_ID } from "@/lib/constants";
import { eq, desc, gte } from "drizzle-orm";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const instanceId = searchParams.get("instanceId");
  const months = parseInt(searchParams.get("months") || "3", 10);

  if (!instanceId) {
    return NextResponse.json({ error: "instanceId required" }, { status: 400 });
  }

  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - months);
  const cutoffStr = cutoffDate.toISOString().split("T")[0] ?? "";

  // Get all sessions for this instance within the time period
  const sets = await db
    .select()
    .from(setLogs)
    .where(eq(setLogs.exerciseInstanceId, instanceId));

  // Group by session and compute best 1RM per session
  const sessionMap = new Map<string, { date: string; best1RM: number; totalVolume: number; bestSet: { charge: number; reps: number } }>();

  for (const set of sets) {
    const session = await db.query.sessionLogs.findFirst({
      where: eq(sessionLogs.id, set.sessionLogId),
    });

    if (!session || session.date < cutoffStr) continue;
    if (session.userId !== MOCK_USER_ID) continue;

    const estimated1RM = set.charge * (1 + set.repsEffectuees / 30);
    const volume = set.charge * set.repsEffectuees;

    const existing = sessionMap.get(session.id);
    if (!existing) {
      sessionMap.set(session.id, {
        date: session.date,
        best1RM: estimated1RM,
        totalVolume: volume,
        bestSet: { charge: set.charge, reps: set.repsEffectuees },
      });
    } else {
      if (estimated1RM > existing.best1RM) {
        existing.best1RM = estimated1RM;
        existing.bestSet = { charge: set.charge, reps: set.repsEffectuees };
      }
      existing.totalVolume += volume;
    }
  }

  const result = Array.from(sessionMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(r => ({
      date: r.date,
      best1RM: Math.round(r.best1RM),
      totalVolume: Math.round(r.totalVolume),
      bestSet: r.bestSet,
    }));

  return NextResponse.json(result);
}