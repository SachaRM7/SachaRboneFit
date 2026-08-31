import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { derniereSeriesPour } from "@/services/plan-seance";

/**
 * Les séries de la dernière séance sur une machine.
 *
 * La version précédente prenait les vingt dernières séries de la machine
 * **tous comptes confondus**, puis ne gardait que celles de la séance la plus
 * récente si elle appartenait à l'appelant. Or le parc est partagé : dans une
 * salle où deux personnes s'entraînent, il suffisait qu'un autre compte passe
 * sur la machine après vous pour que votre propre dernière séance devienne
 * invisible — la colonne « Dernière » se vidait sans rien expliquer.
 *
 * Elle délègue maintenant à `derniereSeriesPour`, qui filtre en SQL sur
 * l'utilisateur, exclut les séances archivées et ordonne par date de séance.
 * C'est déjà ce que lit l'écran de séance : les deux surfaces montraient des
 * « dernières séries » différentes pour le même exercice.
 */
export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const exerciseInstanceId = new URL(request.url).searchParams.get("exerciseInstanceId");
  if (!exerciseInstanceId) {
    return NextResponse.json({ error: "exerciseInstanceId required" }, { status: 400 });
  }

  const derniere = await derniereSeriesPour(userId, exerciseInstanceId);
  if (!derniere) return NextResponse.json(null);

  return NextResponse.json({ sets: derniere.sets });
}
