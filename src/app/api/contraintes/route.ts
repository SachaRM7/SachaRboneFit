import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { contraintesPourAffichage } from "@/services/contraintes";
import { propositionsEnAttente } from "@/services/douleur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ce que l'athlète ménage aujourd'hui, ce qu'il a ménagé autrefois — et ce
 * qu'on lui a proposé de ménager sans qu'il ait encore répondu.
 *
 * Cette dernière liste existe parce qu'une proposition ne peut pas toujours
 * être montrée sur le moment : appuyer sur « Arrêter la séance » navigue
 * aussitôt, et rien ne doit retarder cet arrêt. La question se repose donc ici,
 * sur un écran durable dont c'est précisément le sujet.
 */
export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [contraintes, enAttente] = await Promise.all([
    contraintesPourAffichage(userId),
    propositionsEnAttente(userId),
  ]);
  return NextResponse.json({ ...contraintes, enAttente });
}
