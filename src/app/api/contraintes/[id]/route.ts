import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { repondreAReevaluation, ContrainteIntrouvable } from "@/services/contraintes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ reponse: z.enum(["toujours", "un_peu_mieux", "resolu"]) });

/**
 * La réponse de l'athlète à « est-ce toujours le cas ? ».
 *
 * Le même point d'entrée sert à la relance programmée et à la résolution
 * anticipée : dire que ça va mieux un mardi n'a pas à attendre une échéance.
 * Rien d'autre que la réponse ne transite — ni sévérité, ni date : c'est le
 * moteur qui décide de la transition.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Contrainte inconnue" }, { status: 404 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Réponse invalide" }, { status: 400 });
  }

  try {
    return NextResponse.json(await repondreAReevaluation(userId, id, parsed.data.reponse));
  } catch (erreur) {
    if (erreur instanceof ContrainteIntrouvable) {
      return NextResponse.json({ error: erreur.message }, { status: 404 });
    }
    console.error("[contraintes POST]", erreur);
    return NextResponse.json({ error: "Mise à jour impossible" }, { status: 500 });
  }
}
