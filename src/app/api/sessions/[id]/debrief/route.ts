import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { CoachIndisponible } from "@/lib/coach/llm-client";
import { debriefEnregistre, genererDebrief, SeanceIntrouvable } from "@/services/debrief-seance";

/**
 * Le débrief d'une séance.
 *
 * Deux verbes, et la différence entre les deux est tout l'objet de cette
 * route : `GET` LIT, `POST` GÉNÈRE. Consulter une séance passée ne doit jamais
 * déclencher d'appel au modèle — c'était pourtant le comportement, à chaque
 * ouverture de fiche, pour un texte que l'écran n'affichait même pas.
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  // `debrief: null` et non 404 : l'absence de débrief est une réponse
  // normale, pas une erreur. L'écran propose alors de le générer.
  return NextResponse.json({ debrief: await debriefEnregistre(userId, id) });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    return NextResponse.json({ debrief: await genererDebrief(userId, id) });
  } catch (erreur) {
    if (erreur instanceof SeanceIntrouvable) {
      return NextResponse.json({ error: "Séance introuvable" }, { status: 404 });
    }
    if (erreur instanceof CoachIndisponible) {
      return NextResponse.json(
        { error: "Le coach n'est pas disponible pour le moment." },
        { status: 503 },
      );
    }
    console.error("[sessions/debrief]", erreur);
    return NextResponse.json({ error: "Génération impossible" }, { status: 503 });
  }
}
