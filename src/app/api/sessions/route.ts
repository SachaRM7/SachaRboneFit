import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { sessionLogs, setLogs, seanceTemplates, programmeBlocs } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Les templates appartiennent a l'utilisateur via programme_blocs.
    // Sans cette jointure la route renvoyait les templates de tous les utilisateurs.
    const templates = await db
      .select({
        id: seanceTemplates.id,
        blocId: seanceTemplates.blocId,
        lettre: seanceTemplates.lettre,
        nom: seanceTemplates.nom,
        ordreDansSemaine: seanceTemplates.ordreDansSemaine,
        createdAt: seanceTemplates.createdAt,
        updatedAt: seanceTemplates.updatedAt,
      })
      .from(seanceTemplates)
      .innerJoin(programmeBlocs, eq(programmeBlocs.id, seanceTemplates.blocId))
      .where(eq(programmeBlocs.userId, userId))
      .orderBy(asc(seanceTemplates.ordreDansSemaine));

    return NextResponse.json(templates);
  } catch (error) {
    console.error("[sessions GET] error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

    const filteredSets = Array.isArray(sets)
      ? sets.filter(
          (s: { repsEffectuees: number | null; charge: number | null }) =>
            s.repsEffectuees !== null && s.charge !== null
        )
      : [];

    const [newSession] = await db
      .insert(sessionLogs)
      .values({
        userId,
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
      return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
    }

    if (filteredSets.length > 0) {
      await db.insert(setLogs).values(
        filteredSets.map(
          (s: { exerciseInstanceId: string; numeroSerie: number; repsEffectuees: number; charge: number; rpeEffectif?: number | null; notes?: string }) => ({
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
    }

    return NextResponse.json(newSession, { status: 201 });
  } catch (error) {
    console.error("[sessions POST] error:", error);
    return NextResponse.json({ error: "Failed to save session", details: String(error) }, { status: 500 });
  }
}