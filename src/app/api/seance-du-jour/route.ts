import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { construireSeanceDuJour, lirePlan } from "@/services/plan-seance";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gymId: z.string().uuid(),
  seanceTemplateId: z.string().uuid(),
});

/**
 * Construit la séance du jour : résolution vers la salle, ajustement du volume,
 * charge suggérée, puis persistance du plan.
 *
 * Cette orchestration vivait dans un composant client, avec un passage de relais
 * par sessionStorage que la page destinataire ne relisait jamais.
 */
export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const resultat = await construireSeanceDuJour({ userId, ...parsed.data });
    return NextResponse.json(resultat, { status: 201 });
  } catch (error) {
    console.error("[seance-du-jour POST]", error);
    return NextResponse.json({ error: "Construction de la séance impossible" }, { status: 500 });
  }
}

/** Relit le plan d'une séance déjà construite. */
export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessionLogId = new URL(request.url).searchParams.get("sessionLogId");
  if (!sessionLogId) {
    return NextResponse.json({ error: "sessionLogId requis" }, { status: 400 });
  }

  const plan = await lirePlan(userId, sessionLogId);
  if (!plan) return NextResponse.json({ error: "Séance introuvable" }, { status: 404 });
  return NextResponse.json(plan);
}
