import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { sessionIncidents, sessionLogs } from "@/db/schema";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { symptomeDeclareSchema } from "@/lib/validators/symptome";

type IncidentType =
  | "machine_occupee" | "douleur" | "energie_chute" | "temps_depasse" | "symptome_general";

/**
 * Le type `symptome_general` s'ajoute, il ne remplace rien.
 *
 * `energie_chute` reste `energie_chute` : une baisse d'énergie et une nausée ne
 * se comptent pas ensemble, même si l'écran les propose derrière le même
 * bouton « État ↓ ». Les fusionner aurait rendu impossible de dire, dans un
 * débrief, laquelle des deux a eu lieu.
 *
 * Et surtout : ce type ne va JAMAIS vers `/api/douleur`. Un symptôme général
 * n'a pas de muscle, donc pas de contrainte, pas de substitution, pas d'effet
 * sur la récupération musculaire.
 */
const createIncidentSchema = z.object({
  session_log_id: z.string().uuid(),
  type: z.enum([
    "machine_occupee", "douleur", "energie_chute", "temps_depasse", "symptome_general",
  ]),
  contexte: z.record(z.string(), z.any()),
  decision: z.string(),
  impact_programme: z.string().optional(),
});

/**
 * Le contexte d'un symptôme est vérifié, celui des autres types ne l'est pas.
 *
 * Les quatre types historiques écrivent des formes hétérogènes qu'aucun schéma
 * ne décrit ; les contraindre ici casserait des écrans que ce lot ne touche
 * pas. Le nouveau type part propre : type connu du référentiel, intensité
 * bornée, note bornée. Un débrief qui relit ces incidents peut donc s'y fier
 * sans revalider.
 */
const contexteSymptomeSchema = symptomeDeclareSchema.extend({
  moment: z.literal("pendant_seance"),
});

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createIncidentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  // Verify session belongs to user
  const session = await db.query.sessionLogs.findFirst({
    where: and(
      eq(sessionLogs.id, parsed.data.session_log_id),
      eq(sessionLogs.userId, userId),
    ),
  });

  if (!session) {
    return NextResponse.json({ error: "Session not found or unauthorized" }, { status: 403 });
  }

  /*
   * Le contexte d'un symptôme est normalisé AVANT d'être écrit.
   *
   * Sans cette étape, une note de trois cents mots ou une intensité à 47
   * entreraient telles quelles dans le `jsonb`, et le débrief hebdomadaire les
   * enverrait au modèle sans que rien ne les ait jamais vérifiées.
   */
  let contexte = parsed.data.contexte;
  if (parsed.data.type === "symptome_general") {
    const verifie = contexteSymptomeSchema.safeParse(parsed.data.contexte);
    if (!verifie.success) {
      return NextResponse.json(
        { error: "Invalid symptom context", details: verifie.error.flatten() },
        { status: 400 },
      );
    }
    contexte = verifie.data;
  }

  const [incident] = await db
    .insert(sessionIncidents)
    .values({
      sessionLogId: parsed.data.session_log_id,
      type: parsed.data.type as IncidentType,
      contexte,
      decision: parsed.data.decision,
      impactProgramme: parsed.data.impact_programme || null,
    })
    .returning();

  return NextResponse.json(incident, { status: 201 });
}

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  }

  // Verify session belongs to user
  const session = await db.query.sessionLogs.findFirst({
    where: and(
      eq(sessionLogs.id, sessionId),
      eq(sessionLogs.userId, userId),
    ),
  });

  if (!session) {
    return NextResponse.json({ error: "Session not found or unauthorized" }, { status: 403 });
  }

  const incidents = await db
    .select()
    .from(sessionIncidents)
    .where(eq(sessionIncidents.sessionLogId, sessionId))
    .orderBy(sessionIncidents.createdAt);

  return NextResponse.json(incidents);
}