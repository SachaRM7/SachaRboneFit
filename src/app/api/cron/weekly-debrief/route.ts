import { NextRequest, NextResponse } from "next/server";
import { seancesRealisees } from "@/db/archivage";
import { db } from "@/db/client";
import { users, sessionLogs, setLogs, exerciseInstances, exercises, sessionIncidents, weeklyDebriefs } from "@/db/schema";
import { eq, desc, and, gte, lte, isNull } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";

const CRON_SECRET = process.env.CRON_SECRET || "";

function getWeekBounds(date: Date): { start: string; end: string } {
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay() + 1); // Monday
  const end = new Date(start);
  end.setDate(start.getDate() + 6); // Sunday

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export async function GET(request: NextRequest) {
  // Check CRON_SECRET
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get all users who have had a session in the last 14 days
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const fourteenDaysAgoStr = fourteenDaysAgo.toISOString().slice(0, 10);

    const recentUsers = await db.query.sessionLogs.findMany({
      where: gte(sessionLogs.date, fourteenDaysAgoStr),
    });

    const userIds = [...new Set(recentUsers.map(s => s.userId))];
    const results = { processed: 0, errors: [] as string[] };

    for (const userId of userIds) {
      try {
        const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
        if (!user) continue;

        const { start: weekStart, end: weekEnd } = getWeekBounds(new Date());

        // Get all sessions for this week
        const sessions = await db.query.sessionLogs.findMany({
          where: and(
            seancesRealisees(userId),
            gte(sessionLogs.date, weekStart),
            lte(sessionLogs.date, weekEnd)
          ),
        });

        // Calculate stats
        let totalSets = 0;
        let volumeTotal = 0;
        const feuCounts = { vert: 0, orange: 0, rouge: 0 };
        const progressions: string[] = [];
        const stagnations: string[] = [];
        const exerciseProgress: Record<string, boolean> = {};

        for (const session of sessions) {
          if (session.feuBiologiqueJour === "vert") feuCounts.vert++;
          else if (session.feuBiologiqueJour === "orange") feuCounts.orange++;
          else if (session.feuBiologiqueJour === "rouge") feuCounts.rouge++;

          const sets = await db.query.setLogs.findMany({
            where: eq(setLogs.sessionLogId, session.id),
          });
          totalSets += sets.length;

          for (const set of sets) {
            volumeTotal += set.charge * set.repsEffectuees;
          }
        }

        // Get incidents
        const sessionIds = sessions.map(s => s.id);
        const incidents = await db.query.sessionIncidents.findMany({
          where: (si, { eq, inArray }) => inArray(si.sessionLogId, sessionIds),
        });

        const contenu = `[Debrief hebdomadaire pour ${user.nom || user.email}]\n\nSemaine du ${weekStart} au ${weekEnd}:\n${sessions.length} séances effectuées\n${totalSets} séries au total\nVolume: ${Math.round(volumeTotal)}kg\n\nFeu biologique: ${feuCounts.vert}V ${feuCounts.orange}O ${feuCounts.rouge}R\n\n${incidents.length} incident(s) enregistré(s).\n\nConfigurez l'intégration LLM pour un debrief personnalisé.`;

        // Upsert weekly debrief
        const existing = await db.query.weeklyDebriefs.findFirst({
          where: and(eq(weeklyDebriefs.userId, userId), eq(weeklyDebriefs.weekStart, weekStart)),
        });

        const stats = {
          nbSeances: sessions.length,
          volumeTotal: Math.round(volumeTotal),
          feux: feuCounts,
          progressions,
          stagnations,
          incidentsNb: incidents.length,
        };

        if (existing) {
          await db.update(weeklyDebriefs)
            .set({ contenu, stats })
            .where(eq(weeklyDebriefs.id, existing.id));
        } else {
          await db.insert(weeklyDebriefs).values({
            userId,
            weekStart,
            weekEnd,
            contenu,
            stats,
          });
        }

        results.processed++;
      } catch (e) {
        results.errors.push(`User ${userId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return NextResponse.json(results);
  } catch (e) {
    return NextResponse.json({ error: "Internal error", details: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}