import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { sessionIncidents, type NewSessionIncident } from "@/db/schema";
import { sessionLogs } from "@/db/schema";
import type { IncidentType } from "./types";

export async function createIncident(data: {
  sessionLogId: string;
  type: IncidentType;
  contexte: Record<string, unknown>;
  decision: string;
  impactProgramme?: string;
}) {
  const incident: NewSessionIncident = {
    sessionLogId: data.sessionLogId,
    type: data.type,
    contexte: data.contexte,
    decision: data.decision,
    impactProgramme: data.impactProgramme || null,
  };

  const [created] = await db.insert(sessionIncidents).values(incident).returning();
  return created;
}

export async function getIncidentsBySession(sessionLogId: string) {
  return db
    .select()
    .from(sessionIncidents)
    .where(eq(sessionIncidents.sessionLogId, sessionLogId))
    .orderBy(sessionIncidents.createdAt);
}