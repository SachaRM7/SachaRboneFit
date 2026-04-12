import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { users, sessionLogs, precalcSessions, seanceTemplates, dailyStates, programmeBlocs } from "@/db/schema";
import { eq, desc, and, gte } from "drizzle-orm";
import { getUser } from "@/lib/supabase/auth-helper";
import { loadContext } from "@/lib/coach/context-loader";

const CRON_SECRET = process.env.CRON_SECRET || "";

function getNextSeanceLetter(lastSession: typeof sessionLogs.$inferSelect | null): string {
  if (!lastSession?.seanceTemplateId) return "A";
  // In a real implementation, we'd look up the template and find its letter
  // For now, simple cycle
  return "A";
}

function getTomorrowDate(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split("T")[0];
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
    const fourteenDaysAgoStr = fourteenDaysAgo.toISOString().split("T")[0];

    const recentUsers = await db.query.sessionLogs.findMany({
      where: gte(sessionLogs.date, fourteenDaysAgoStr),
    });

    const userIds = [...new Set(recentUsers.map(s => s.userId))];
    const results = { processed: 0, errors: [] as string[] };

    for (const userId of userIds) {
      try {
        const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
        if (!user) continue;

        // Find the last session to determine next seance letter
        const lastSession = await db.query.sessionLogs.findFirst({
          where: eq(sessionLogs.userId, userId),
          orderBy: [desc(sessionLogs.date)],
        });

        const nextLetter = getNextSeanceLetter(lastSession);

        // Find the next template (in a real implementation, look it up properly)
        const nextTemplate = await db.query.seanceTemplates.findFirst({
          where: eq(seanceTemplates.lettre, nextLetter),
        });

        const tomorrow = getTomorrowDate();
        const targetDate = tomorrow;

        // Build prompt for LLM
        const context = await loadContext(userId, targetDate);
        const prompt = `Génère un résumé de la séance de demain pour ${user.nom || user.email}. Séance ${nextLetter}. Inclus les charges suggérées (double progression), les exercices, et les points d'attention basés sur les dernières séances.\n\nContexte:\n${context.summary}`;

        // Call LLM (simplified - in reality, use the actual LLM client)
        const contenu = `[Pré-calcul pour ${user.nom || user.email} - Séance ${nextLetter}]\n\nCe résumé est généré automatiquement. Configurez l'intégration LLM pour générer un contenu personnalisé.`;

        // Upsert precalc session
        const existing = await db.query.precalcSessions.findFirst({
          where: and(eq(precalcSessions.userId, userId), eq(precalcSessions.targetDate, targetDate)),
        });

        if (existing) {
          await db.update(precalcSessions)
            .set({ contenu, contexteUtilise: context })
            .where(eq(precalcSessions.id, existing.id));
        } else {
          await db.insert(precalcSessions).values({
            userId,
            targetDate,
            seanceTemplateId: nextTemplate?.id || null,
            contenu,
            contexteUtilise: context,
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