import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { volumeParMuscle } from "@/services/progression";

/** Volume par muscle sur une fenêtre glissante (28 jours par défaut). */
export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jours = Math.min(365, Math.max(7, Number(new URL(request.url).searchParams.get("jours") ?? 28)));
  const depuis = new Date(Date.now() - jours * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return NextResponse.json({ jours, depuis, volumes: await volumeParMuscle(userId, depuis) });
}
