import { NextResponse } from "next/server";
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
  const cutoffStr = cutoffDate.toISOString().split("T")[0] ?? "";

  const sessions = await db.query.sessionLogs.findMany({
    where: (sl, { eq, and, gte }) =>
      and(eq(sl.userId, userId), gte(sl.date, cutoffStr)),
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