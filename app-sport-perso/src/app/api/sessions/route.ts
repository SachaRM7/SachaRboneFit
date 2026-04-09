import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { sessionLogs, setLogs, seanceTemplates } from "@/db/schema";
import { MOCK_USER_ID } from "@/lib/constants";
import { eq, asc, desc } from "drizzle-orm";

export async function GET() {
  try {
    const templates = await db.query.seanceTemplates.findMany({
      orderBy: [asc(seanceTemplates.ordreDansSemaine)],
    });

    return NextResponse.json(templates);
  } catch (error) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      seanceTemplateId,
      gymId,
      date,
      dureeMinutes,
      energieFin,
      notesSeance,
      sets,
      dailyStateId,
      feuBiologiqueJour,
      feuBiologiqueTendance,
      volumeAjustePct,
      volumeAjusteRaison,
    } = body;

    const validSets = sets
      ? sets.filter(
          (s: { repsEffectuees: number | null; charge: number | null }) =>
            s.repsEffectuees !== null && s.charge !== null
        )
      : [];

    if (validSets.length === 0) {
      return NextResponse.json(
        { error: "Au moins une serie est requise" },
        { status: 400 }
      );
    }

    const [newSession] = await db
      .insert(sessionLogs)
      .values({
        userId: MOCK_USER_ID,
        seanceTemplateId: seanceTemplateId || null,
        dailyStateId: dailyStateId || null,
        gymId: gymId || null,
        date,
        dureeMinutes: dureeMinutes || null,
        energieFin: energieFin || null,
        notesSeance: notesSeance || null,
        feuBiologiqueJour: feuBiologiqueJour || null,
        feuBiologiqueTendance: feuBiologiqueTendance || null,
        volumeAjustePct: volumeAjustePct || null,
        volumeAjusteRaison: volumeAjusteRaison || null,
      })
      .returning();

    if (!newSession) {
      return NextResponse.json(
        { error: "Failed to create session" },
        { status: 500 }
      );
    }

    await db.insert(setLogs).values(
      validSets.map(
        (s: {
          exerciseInstanceId: string;
          numeroSerie: number;
          repsEffectuees: number;
          charge: number;
          rpeEffectif?: number | null;
          notes?: string;
        }) => ({
          sessionLogId: newSession.id,
          exerciseInstanceId: s.exerciseInstanceId,
          numeroSerie: s.numeroSerie,
          repsEffectuees: s.repsEffectuees,
          charge: s.charge,
          rpeEffectif: s.rpeEffectif || null,
          notes: s.notes || null,
        })
      )
    );

    return NextResponse.json(newSession, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to save session" }, { status: 500 });
  }
}
