import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { seanceTemplates, programmeBlocs } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { z } from "zod";
import { creerSeance } from "@/services/seances";

const creationSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  seanceTemplateId: z.string().uuid().nullable().optional(),
  gymId: z.string().uuid().nullable().optional(),
  dailyStateId: z.string().uuid().nullable().optional(),
  feuBiologiqueJour: z.enum(["vert", "orange", "rouge"]).nullable().optional(),
  volumeAjustePct: z.number().int().nullable().optional(),
  volumeAjusteRaison: z.string().nullable().optional(),
});

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

    const parsed = creationSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Donnees invalides", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Creation seule. La cloture (duree, energie, series) passe par
    // PATCH /api/session-logs/[id], qui complete CETTE ligne au lieu d'en creer
    // une seconde comme le faisait l'ancien flux.
    const seance = await creerSeance({ userId, ...parsed.data });
    return NextResponse.json(seance, { status: 201 });
  } catch (error) {
    console.error("[sessions POST] error:", error);
    return NextResponse.json({ error: "Echec de la creation de seance" }, { status: 500 });
  }
}
