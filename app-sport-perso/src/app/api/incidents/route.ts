import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { sessionIncidents, sessionLogs, type IncidentType } from "@/db/schema";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";

const createIncidentSchema = z.object({
  session_log_id: z.string().uuid(),
  type: z.enum(["machine_occupee", "douleur", "energie_chute", "temps_depasse"]),
  contexte: z.record(z.any()),
  decision: z.string(),
  impact_programme: z.string().optional(),
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

  const [incident] = await db
    .insert(sessionIncidents)
    .values({
      sessionLogId: parsed.data.session_log_id,
      type: parsed.data.type as IncidentType,
      contexte: parsed.data.contexte,
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