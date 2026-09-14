import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { saveSessionDraftSchema } from "@/lib/session-composer/draft";
import {
  CompositionRefusee,
  saveSessionComposition,
} from "@/services/session-composer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = saveSessionDraftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "La séance est incomplète.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await saveSessionComposition({ userId, ...parsed.data });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof CompositionRefusee) {
      return NextResponse.json({ error: error.reason }, { status: error.status });
    }
    console.error("[session-composer]", error);
    return NextResponse.json(
      { error: "La séance n'a pas pu être enregistrée. Ton brouillon est conservé." },
      { status: 500 },
    );
  }
}
