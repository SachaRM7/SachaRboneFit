import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { propositionsEnAttente } from "@/services/propositions-coach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ce qui attend une décision de l'athlète.
 *
 * Le tiroir du coach l'interroge après chaque réponse : une proposition ne
 * s'affiche pas parce que le modèle a dit qu'il en avait faite une, mais parce
 * qu'elle existe en base, calculée et contrôlée. Si le modèle raconte une
 * modification qu'il n'a pas proposée, rien n'apparaît.
 */
export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const conversationId = new URL(request.url).searchParams.get("conversationId");
  const propositions = await propositionsEnAttente(userId, conversationId);
  return NextResponse.json(propositions);
}
