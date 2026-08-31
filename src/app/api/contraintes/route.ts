import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { contraintesPourAffichage } from "@/services/contraintes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ce que l'athlète ménage aujourd'hui, et ce qu'il a ménagé autrefois. */
export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await contraintesPourAffichage(userId));
}
