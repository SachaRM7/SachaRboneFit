import { NextResponse } from "next/server";
import { seancesRealisees } from "@/db/archivage";
import { db } from "@/db/client";
import { sessionLogs } from "@/db/schema";
import { eq, desc, gte, and } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";

export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const months = parseInt(searchParams.get("months") || "3", 10);

  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - months);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);

  // Une reprise après interruption archive l'ancien historique : la carte des
  // feux était le seul écran de Progression à continuer de l'afficher.
  const sessions = await db.query.sessionLogs.findMany({
    where: and(seancesRealisees(userId), gte(sessionLogs.date, cutoffStr)),
    orderBy: [desc(sessionLogs.date)],
  });

  const result = sessions.map(s => ({
    date: s.date,
    feuJour: s.feuBiologiqueJour as "vert" | "orange" | "rouge" | null,
    feuTendance: s.feuBiologiqueTendance as "vert" | "orange" | "rouge" | null,
    templateLettre: s.seanceTemplateId ? "?" : null,
  }));

  return NextResponse.json(result);
}