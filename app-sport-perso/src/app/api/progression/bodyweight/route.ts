import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { bodyWeights } from "@/db/schema";
import { eq, desc, gte } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";

export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const months = parseInt(searchParams.get("months") || "6", 10);

  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - months);
  const cutoffStr = cutoffDate.toISOString().split("T")[0] ?? "";

  const weights = await db.query.bodyWeights.findMany({
    where: (bw, { eq, and, gte }) =>
      and(eq(bw.userId, userId), gte(bw.date, cutoffStr)),
    orderBy: [desc(bodyWeights.date)],
  });

  // Sort chronologically for chart
  const chronological = [...weights].sort((a, b) => a.date.localeCompare(b.date));

  // Calculate moving average (7 last weighings, not 7 days)
  const withMovingAvg = chronological.map((w, i) => {
    const windowSize = Math.min(7, i + 1);
    const window = chronological.slice(Math.max(0, i - windowSize + 1), i + 1);
    const avg = window.reduce((sum, bw) => sum + bw.poids, 0) / window.length;
    return {
      date: w.date,
      poids: w.poids,
      movingAvg: Math.round(avg * 10) / 10,
    };
  });

  return NextResponse.json(withMovingAvg);
}