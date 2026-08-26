import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { recordsPersonnels } from "@/services/progression";

/** Meilleur 1RM estimé par machine. */
export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ records: await recordsPersonnels(userId) });
}
