import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { bilanDeProgression } from "@/services/bilan";

/** Ce qui évolue, sans avoir à choisir un exercice d'abord. */
export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ bilan: await bilanDeProgression(userId) });
}
