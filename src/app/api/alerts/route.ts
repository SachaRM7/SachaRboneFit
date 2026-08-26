import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { alertes } from "@/services/progression";

/**
 * Alertes de progression : fourchette complétée, deload conseillé, stagnation,
 * tendance rouge.
 *
 * Cette route existait, son moteur était correct, et personne ne l'appelait :
 * le composant qui les affiche n'était monté nulle part. Elle renvoyait par
 * ailleurs des valeurs partielles — « For now, return basic alerts » — parce que
 * les agrégats attendus n'étaient calculés par aucune requête.
 */
export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return NextResponse.json({ alertes: await alertes(userId) });
  } catch (error) {
    console.error("[alerts GET]", error);
    return NextResponse.json({ error: "Calcul des alertes impossible" }, { status: 500 });
  }
}
