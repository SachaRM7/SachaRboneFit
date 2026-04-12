import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { sessionLogs, setLogs, exerciseInstances, exercises } from "@/db/schema";
import { eq, desc, gte, and } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";

export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const months = parseInt(searchParams.get("months") || "3", 10);

  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - months);
  const cutoffStr = cutoffDate.toISOString().split("T")[0] ?? "";

  // Get all sessions in period
  const sessions = await db.query.sessionLogs.findMany({
    where: (sl, { eq, and, gte }) =>
      and(eq(sl.userId, userId), gte(sl.date, cutoffStr)),
    orderBy: [desc(sessionLogs.date)],
  });

  // Aggregate by week
  const weekMap = new Map<string, Record<string, number>>();

  for (const session of sessions) {
    const sets = await db.query.setLogs.findMany({
      where: eq(setLogs.sessionLogId, session.id),
    });

    // Get week identifier (YYYY-Www)
    const sessionDate = new Date(session.date);
    const year = sessionDate.getFullYear();
    const weekStart = new Date(sessionDate);
    weekStart.setDate(weekStart.getDate() - sessionDate.getDay() + 1); // Monday
    const weekKey = `${year}-W${String(Math.ceil((weekStart.getDate() + weekStart.getMonth() * 30) / 7)).padStart(2, "0")}`;

    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, {});
    }
    const weekData = weekMap.get(weekKey)!;

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
      const pilier = exercise.pilier?.toLowerCase() || "core";
      weekData[pilier] = (weekData[pilier] || 0) + volume;
    }
  }

  const result = Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, volumes]) => ({
      week,
      ...Object.fromEntries(
        Object.entries(volumes).map(([k, v]) => [k, Math.round(v)])
      ),
    }));

  return NextResponse.json(result);
}
