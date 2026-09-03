import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import {
  terminerSeance, SeanceIntrouvable, SeanceSansSerie, SerieInvalide,
} from "@/services/seances";

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
    /**
     * 422 plutôt que 400 : la requête est bien formée, c'est la SÉANCE qui ne
     * peut pas être close. La distinction compte pour le client, qui doit
     * afficher « valide au moins une série » et non « données invalides » —
     * et laisser la séance ouverte, donc reprenable.
     */
    if (error instanceof SeanceSansSerie) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    /**
     * Même statut, même raison : la requête est bien formée, c'est une série
     * qui ne mesure rien. Le refus nomme la série et ce qui manque, plutôt que
     * de l'écarter en silence — l'écran avait montré une ligne validée, la
     * base n'en gardait rien, et personne n'était prévenu.
     */
    if (error instanceof SerieInvalide) {
      return NextResponse.json(
        { error: error.message, numeroSerie: error.numeroSerie, motif: error.motif },
        { status: 422 },
      );
    }
    console.error("[session-logs PATCH] error:", error);
    return NextResponse.json({ error: "Echec de la cloture" }, { status: 500 });
  }
}
