import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { terminerSeance, SeanceIntrouvable } from "@/services/seances";

const serieSchema = z.object({
  exerciseInstanceId: z.string().uuid(),
  numeroSerie: z.number().int().positive(),
  repsEffectuees: z.number().int().nonnegative(),
  charge: z.number().nonnegative(),
  rpeEffectif: z.number().min(1).max(10).nullable().optional(),
  tempoRespecte: z.boolean().nullable().optional(),
  reposReelSecondes: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const clotureSchema = z.object({
  dureeMinutes: z.number().int().nonnegative().nullable().optional(),
  // Meme echelle que daily_states.energieDepart : la seance de fin utilisait
  // auparavant une echelle 0-100, ce qui rendait toute comparaison impossible.
  energieFin: z.number().int().min(1).max(10).nullable().optional(),
  notesSeance: z.string().nullable().optional(),
  feuBiologiqueTendance: z.enum(["vert", "orange", "rouge"]).nullable().optional(),
  series: z.array(serieSchema).default([]),
});

/** Cloture une seance : complete la ligne existante et enregistre ses series. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const parsed = clotureSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Donnees invalides", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const seance = await terminerSeance({ userId, sessionLogId: id, ...parsed.data });
    return NextResponse.json(seance);
  } catch (error) {
    if (error instanceof SeanceIntrouvable) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("[session-logs PATCH] error:", error);
    return NextResponse.json({ error: "Echec de la cloture" }, { status: 500 });
  }
}
