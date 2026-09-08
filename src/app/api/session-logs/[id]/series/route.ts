import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import {
  enregistrerSerie, retirerSerie, seriesDeLaSeance,
  SeanceIntrouvable, SerieInvalide,
} from "@/services/seances";

/**
 * Une série, persistée au moment où elle est validée.
 *
 * LE DÉFAUT QUE CETTE ROUTE FERME
 *
 * Rien de la séance n'atteignait Postgres avant l'écran de fin : une heure
 * d'entraînement tenait entièrement dans le `localStorage` du navigateur. Un
 * crash de Safari, un onglet fermé par le système sous pression mémoire, et la
 * séance n'avait jamais eu lieu.
 *
 * Elle ne remplace pas la clôture. `PATCH /api/session-logs/[id]` reste le
 * moment où la séance devient un fait — durée, énergie de fin, débrief — et
 * réécrit la liste complète des séries. Cette route-ci met la base à jour au
 * fil de l'eau pour qu'un accident ne coûte plus rien.
 *
 * IDEMPOTENTE. Le triplet (séance, entrée, numéro) identifie la série : rejouer
 * l'appel après un échec réseau ne crée pas de doublon, et revalider une série
 * corrigée met à jour la bonne ligne. Aucune migration.
 */

export const runtime = "nodejs";

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

const retraitSchema = z.object({
  exerciseInstanceId: z.string().uuid(),
  numeroSerie: z.number().int().positive(),
});

/** Ce que la base porte déjà — la source de vérité de la reprise. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    return NextResponse.json(await seriesDeLaSeance(userId, id));
  } catch (error) {
    if (error instanceof SeanceIntrouvable) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("[series GET] échec :", error instanceof Error ? error.name : typeof error);
    return NextResponse.json({ error: "Lecture impossible" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsed = serieSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await enregistrerSerie({ userId, sessionLogId: id, serie: parsed.data });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    if (error instanceof SeanceIntrouvable) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    /*
     * 422 : la requête est bien formée, c'est la SÉRIE qui ne mesure rien. Le
     * même refus qu'à la clôture, au même moment du moteur — une série acceptée
     * en route ne doit pas être rejetée à la fin.
     */
    if (error instanceof SerieInvalide) {
      return NextResponse.json(
        { error: error.message, numeroSerie: error.numeroSerie, motif: error.motif },
        { status: 422 },
      );
    }
    console.error("[series POST] échec :", error instanceof Error ? error.name : typeof error);
    return NextResponse.json({ error: "Enregistrement impossible" }, { status: 500 });
  }
}

/** Décocher une série pendant la séance la retire aussi de la base. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsed = retraitSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  try {
    await retirerSerie({ userId, sessionLogId: id, ...parsed.data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SeanceIntrouvable) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("[series DELETE] échec :", error instanceof Error ? error.name : typeof error);
    return NextResponse.json({ error: "Retrait impossible" }, { status: 500 });
  }
}
