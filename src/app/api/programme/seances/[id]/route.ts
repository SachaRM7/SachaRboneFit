import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import {
  deplacerSeanceVersProgramme,
  ProgrammeManagementError,
} from "@/services/programme-management";

const schema = z.object({ destinationBlocId: z.string().uuid() });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Destination invalide" }, { status: 400 });
  }

  const { id } = await params;
  try {
    const template = await deplacerSeanceVersProgramme(userId, id, parsed.data.destinationBlocId);
    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof ProgrammeManagementError) {
      return NextResponse.json({ error: error.reason }, { status: error.status });
    }
    console.error("[programme/seances/:id PATCH]", error);
    return NextResponse.json({ error: "Déplacement impossible" }, { status: 500 });
  }
}
