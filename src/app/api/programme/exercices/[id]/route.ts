import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { retirerExerciceDuTemplate, RessourceIntrouvable } from "@/services/programmes";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    await retirerExerciceDuTemplate(userId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RessourceIntrouvable) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("[programme/exercices DELETE]", error);
    return NextResponse.json({ error: "Suppression impossible" }, { status: 500 });
  }
}
