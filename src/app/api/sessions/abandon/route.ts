import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import {
  abandonnerSeance,
  seanceOuverte,
  SeanceIntrouvable,
  SeanceNonVide,
} from "@/services/seances";

const schema = z.object({ sessionLogId: z.string().uuid().optional() });

/**
 * Abandonner la séance en cours.
 *
 * Le bouton du tableau de bord ne faisait qu'un `clear()` du store React : la
 * ligne restait ouverte en base et « Séance en cours — 0 séries » revenait au
 * rechargement suivant. Le geste a maintenant un effet côté serveur, et une
 * réponse — un échec ne peut plus passer pour une absence de réaction.
 *
 * `sessionLogId` est facultatif : sans lui, c'est la séance ouverte du compte
 * qui est visée. L'identifiant ne décide jamais du propriétaire — le service
 * refuse toute séance qui n'est pas celle de l'appelant.
 */
export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  try {
    const cible = parsed.data.sessionLogId ?? (await seanceOuverte(userId))?.id;
    // Rien d'ouvert : le geste a déjà son effet. Ne pas répondre en erreur —
    // l'écran doit pouvoir se remettre d'aplomb sans afficher un échec.
    if (!cible) return NextResponse.json({ ok: true, abandonnee: false });

    await abandonnerSeance(userId, cible);
    return NextResponse.json({ ok: true, abandonnee: true });
  } catch (error) {
    if (error instanceof SeanceIntrouvable) {
      return NextResponse.json({ error: "Séance introuvable" }, { status: 404 });
    }
    if (error instanceof SeanceNonVide) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("[sessions/abandon POST]", error);
    return NextResponse.json({ error: "Abandon impossible" }, { status: 500 });
  }
}
