import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import {
  activerProgramme,
  archiverProgramme,
  ProgrammeManagementError,
} from "@/services/programme-management";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const programme = await activerProgramme(userId, id);
    return NextResponse.json(programme);
  } catch (error) {
    if (error instanceof ProgrammeManagementError) {
      return NextResponse.json({ error: error.reason }, { status: error.status });
    }
    console.error("[programme/blocs/:id PATCH]", error);
    return NextResponse.json({ error: "Activation impossible" }, { status: 500 });
  }
}


export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const resultat = await archiverProgramme(userId, id);
    return NextResponse.json(resultat);
  } catch (error) {
    if (error instanceof ProgrammeManagementError) {
      return NextResponse.json({ error: error.reason }, { status: error.status });
    }
    console.error("[programme/blocs/:id DELETE]", error);
    return NextResponse.json({ error: "Suppression impossible" }, { status: 500 });
  }
}
