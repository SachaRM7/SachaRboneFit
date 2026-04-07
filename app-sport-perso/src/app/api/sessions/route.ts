import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { sessionLogs, setLogs } from "@/db/schema";
import { MOCK_USER_ID } from "@/lib/constants";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { seanceTemplateId, gymId, date, dureeMinutes, energieFin, notesSeance, sets } = body;

    // Validate sets
    const validSets = sets.filter(
      (s: { repsEffectuees: number | null; charge: number | null }) =>
        s.repsEffectuees !== null && s.charge !== null
    );

    if (validSets.length === 0) {
      return NextResponse.json({ error: "Au moins une série est requise" }, { status: 400 });
    }

    // Insert session log
    const [newSession] = await db.insert(sessionLogs).values({
      userId: MOCK_USER_ID,
      seanceTemplateId: seanceTemplateId || null,
      gymId: gymId || null,
      date,
      dureeMinutes: dureeMinutes || null,
      energieFin: energieFin || null,
      notesSeance: notesSeance || null,
    }).returning();

    if (!newSession) {
      return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
    }

    // Insert all set logs
    await db.insert(setLogs).values(
      validSets.map((s: { exerciseInstanceId: string; numeroSerie: number; repsEffectuees: number; charge: number; rpeEffectif?: number | null; notes?: string }) => ({
        sessionLogId: newSession.id,
        exerciseInstanceId: s.exerciseInstanceId,
        numeroSerie: s.numeroSerie,
        repsEffectuees: s.repsEffectuees,
        charge: s.charge,
        rpeEffectif: s.rpeEffectif || null,
        notes: s.notes || null,
      }))
    );

    return NextResponse.json(newSession, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to save session" }, { status: 500 });
  }
}
