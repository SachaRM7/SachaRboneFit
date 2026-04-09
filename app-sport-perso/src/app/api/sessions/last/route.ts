import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { sessionLogs, setLogs, exerciseInstances, exercises } from "@/db/schema";
import { MOCK_USER_ID } from "@/lib/constants";
import { eq, desc } from "drizzle-orm";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const exerciseInstanceId = searchParams.get("exerciseInstanceId");
  const gymId = searchParams.get("gymId");

  // If exerciseInstanceId is provided, find the last session with this exercise
  if (exerciseInstanceId) {
    const sets = await db.query.setLogs.findMany({
      where: eq(setLogs.exerciseInstanceId, exerciseInstanceId),
      orderBy: [desc(setLogs.createdAt)],
    });

    if (sets.length === 0) {
      return NextResponse.json(null);
    }

    const lastSessionLogId = sets[0]!.sessionLogId;

    // Get exercise instance info
    const instance = await db.query.exerciseInstances.findFirst({
      where: eq(exerciseInstances.id, exerciseInstanceId),
    });

    if (!instance) {
      return NextResponse.json(null);
    }

    const exercise = await db.query.exercises.findFirst({
      where: eq(exercises.id, instance.exerciseId),
    });

    return NextResponse.json({
      exerciseName: exercise?.nom || "Exercice",
      machineNom: instance.machineNom,
      pilier: exercise?.pilier || "core",
      sessionLogId: lastSessionLogId,
    });
  }

  if (!gymId) {
    return NextResponse.json({ error: "gymId required" }, { status: 400 });
  }

  const lastSession = await db.query.sessionLogs.findFirst({
    where: (sl, { eq, and }) =>
      and(eq(sl.userId, MOCK_USER_ID), eq(sl.gymId, gymId)),
    orderBy: (sl, { desc }) => [desc(sl.createdAt)],
  });

  return NextResponse.json(lastSession || null);
}
