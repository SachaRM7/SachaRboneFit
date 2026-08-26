import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { prochaineSeance } from "@/services/programmes";

/** Quelle séance vient ensuite dans le bloc actif. */
export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const resultat = await prochaineSeance(userId);
  if (!resultat) {
    return NextResponse.json({ error: "Aucun bloc actif avec des séances" }, { status: 404 });
  }
  return NextResponse.json(resultat);
}
