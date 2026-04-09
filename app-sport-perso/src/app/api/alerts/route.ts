import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { programmeBlocs, sessionLogs, seanceTemplates } from "@/db/schema";
import { MOCK_USER_ID } from "@/lib/constants";
import { eq, desc, and, gte } from "drizzle-orm";
import { computeAlerts, type Alert } from "@/lib/engine/alerts";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const timing = searchParams.get("timing") as "pre_seance" | "post_seance";
  const seanceTemplateId = searchParams.get("seanceTemplateId");
  const sessionLogId = searchParams.get("sessionLogId");

  if (timing === "pre_seance" && seanceTemplateId) {
    // Find bloc for this template
    const template = await db.query.seanceTemplates.findFirst({
      where: eq(seanceTemplates.id, seanceTemplateId),
    });

    if (!template) {
      return NextResponse.json([]);
    }

    // Check weeks since last deload
    const blocs = await db.query.programmeBlocs.findMany({
      where: eq(programmeBlocs.userId, MOCK_USER_ID),
      orderBy: [desc(programmeBlocs.dateDebut)],
    });

    let semainesSansDeload = 0;
    const firstBloc = blocs.length > 0 ? blocs[0] : undefined;
    if (firstBloc) {
      const start = new Date(firstBloc.dateDebut);
      const now = new Date();
      semainesSansDeload = Math.floor((now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
    }

    // For now, return basic alerts
    const alerts = computeAlerts({
      completedRanges: [],
      semainesSansDeload,
      stagnations: [],
      feuTendance: null,
    });

    return NextResponse.json(alerts.filter((a) => a.timing === "pre_seance"));
  }

  if (timing === "post_seance" && sessionLogId) {
    const session = await db.query.sessionLogs.findFirst({
      where: eq(sessionLogs.id, sessionLogId),
    });

    return NextResponse.json([]);
  }

  return NextResponse.json([]);
}
