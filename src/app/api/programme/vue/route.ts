import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { vueDuProgramme } from "@/services/cycle";

/** Le cycle, la semaine et ce que le moteur sait en dire. */
export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ vue: await vueDuProgramme(userId) });
}
