import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import {
  appliquerProposition, refuserProposition, PropositionRefusee,
} from "@/services/propositions-coach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ decision: z.enum(["appliquer", "refuser"]) });

/**
 * La décision de l'athlète sur une proposition.
 *
 * Elle porte un identifiant de proposition, et rien d'autre. Ni l'opération, ni
 * les valeurs, ni la séance : tout cela a été figé au moment du calcul, et
 * laisser le client les renvoyer rouvrirait la porte que la proposition ferme —
 * confirmer une chose et en appliquer une autre.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Proposition inconnue" }, { status: 404 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Décision invalide" }, { status: 400 });
  }

  try {
    if (parsed.data.decision === "refuser") {
      await refuserProposition(userId, id);
      return NextResponse.json({ statut: "refusee" });
    }

    const application = await appliquerProposition(userId, id);
    return NextResponse.json({
      statut: "appliquee",
      apercu: application.apercu,
      avertissements: application.avertissements,
    });
  } catch (erreur) {
    if (erreur instanceof PropositionRefusee) {
      return NextResponse.json({ error: erreur.raison }, { status: erreur.statut });
    }
    console.error("[coach/propositions]", erreur);
    return NextResponse.json({ error: "Modification impossible" }, { status: 500 });
  }
}
