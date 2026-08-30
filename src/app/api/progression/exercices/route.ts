import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { exercicesTravailles } from "@/services/bilan";

/** Les exercices réellement travaillés — de quoi remplir le sélecteur. */
export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ exercices: await exercicesTravailles(userId) });
}
