import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { creerBloc } from "@/services/programmes";

const schema = z.object({
  nom: z.string().trim().min(1).max(120),
  dateDebut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateFinPrevue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  typeCycle: z.string().trim().min(1).max(60),
  actif: z.boolean().default(true),
});

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const bloc = await creerBloc({ userId, ...parsed.data });
    return NextResponse.json(bloc, { status: 201 });
  } catch (error) {
    console.error("[programme/blocs POST]", error);
    return NextResponse.json({ error: "Création impossible" }, { status: 500 });
  }
}
