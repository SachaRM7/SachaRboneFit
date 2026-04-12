import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { sessionLogs, dailyStates, bodyWeights, seanceTemplates, programmeBlocs, precalcSessions, weeklyDebriefs, gyms } from "@/db/schema";
import { eq, desc, and, asc } from "drizzle-orm";
import { computeFeuJour } from "@/lib/engine/feu-biologique";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, userId),
    });

    const lastWeight = await db.query.bodyWeights.findFirst({
      where: eq(bodyWeights.userId, userId),
      orderBy: [desc(bodyWeights.date)],
    });

    const blocActif = await db.query.programmeBlocs.findFirst({
      where: and(eq(programmeBlocs.userId, userId), eq(programmeBlocs.actif, true)),
    });

    const lastSession = await db.query.sessionLogs.findFirst({
      where: eq(sessionLogs.userId, userId),
      orderBy: [desc(sessionLogs.createdAt)],
    });

    let prochaineSeance = { lettre: "A", templateId: "", templateNom: "Seance A" };

    if (lastSession && lastSession.seanceTemplateId) {
      const lastTemplate = await db.query.seanceTemplates.findFirst({
        where: eq(seanceTemplates.id, lastSession.seanceTemplateId),
      });
      if (lastTemplate && blocActif && blocActif.userId === userId) {
        const letter = lastTemplate.lettre;
        const nextLetter = letter === "A" ? "B" : letter === "B" ? "C" : "A";
        const nextTemplates = await db.query.seanceTemplates.findMany({
          where: eq(seanceTemplates.blocId, blocActif.id),
        });
        const nextTemplate = nextTemplates.find((t) => t.lettre === nextLetter);
        if (nextTemplate) {
          prochaineSeance = {
            lettre: nextTemplate.lettre,
            templateId: nextTemplate.id,
            templateNom: nextTemplate.nom,
          };
        }
      }
    } else if (blocActif && blocActif.userId === userId) {
      const templates = await db.query.seanceTemplates.findMany({
        where: eq(seanceTemplates.blocId, blocActif.id),
        orderBy: [asc(seanceTemplates.ordreDansSemaine)],
      });
      if (templates.length > 0) {
        prochaineSeance = {
          lettre: templates[0]!.lettre,
          templateId: templates[0]!.id,
          templateNom: templates[0]!.nom,
        };
      }
    }

    const todayStr = new Date().toISOString().split("T")[0];
    const dailyStateToday = await db.query.dailyStates.findFirst({
      where: and(eq(dailyStates.userId, userId), eq(dailyStates.date, todayStr)),
    });

    let feuJour: "vert" | "orange" | "rouge" | null = null;
    if (dailyStateToday) {
      const stateForFeu = {
        date: dailyStateToday.date,
        sommeilHeures: dailyStateToday.sommeilHeures ?? 7,
        jeuneBool: dailyStateToday.jeuneBool ?? false,
        shiftRecentBool: dailyStateToday.shiftRecentBool ?? false,
        shiftType: (dailyStateToday.shiftType as "jour" | "nuit" | "aucun") ?? "aucun",
        energieDepart: dailyStateToday.energieDepart ?? 5,
        courbatures: dailyStateToday.courbatures ?? [],
      };
      feuJour = computeFeuJour(stateForFeu).feu;
    }

    let feuTendance: "vert" | "orange" | "rouge" | null = null;
    if (lastSession?.feuBiologiqueTendance) {
      const f = lastSession.feuBiologiqueTendance;
      if (f === "vert" || f === "orange" || f === "rouge") {
        feuTendance = f;
      }
    }

    const poids30jours = await db.query.bodyWeights.findMany({
      where: eq(bodyWeights.userId, userId),
      orderBy: [desc(bodyWeights.date)],
    });

    const precalcSession = await db.query.precalcSessions.findFirst({
      where: and(eq(precalcSessions.userId, userId), eq(precalcSessions.targetDate, todayStr)),
    });

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + 1);
    const weekStartStr = startOfWeek.toISOString().split("T")[0];

    const weeklyDebrief = await db.query.weeklyDebriefs.findFirst({
      where: and(eq(weeklyDebriefs.userId, userId), eq(weeklyDebriefs.weekStart, weekStartStr)),
    });

    const lastWeekStart = new Date(startOfWeek);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekStartStr = lastWeekStart.toISOString().split("T")[0];

    const lastWeekDebrief = !weeklyDebrief ? await db.query.weeklyDebriefs.findFirst({
      where: and(eq(weeklyDebriefs.userId, userId), eq(weeklyDebriefs.weekStart, lastWeekStartStr)),
    }) : null;

    const recentSessions = await db.query.sessionLogs.findMany({
      where: eq(sessionLogs.userId, userId),
      orderBy: [desc(sessionLogs.createdAt)],
      limit: 5,
    });

    const recentSessionsWithData = await Promise.all(
      recentSessions.map(async (s) => {
        const gym = s.gymId ? await db.query.gyms.findFirst({ where: eq(gyms.id, s.gymId) }) : null;
        const template = s.seanceTemplateId ? await db.query.seanceTemplates.findFirst({ where: eq(seanceTemplates.id, s.seanceTemplateId) }) : null;
        return {
          id: s.id,
          date: s.date,
          dureeMinutes: s.dureeMinutes,
          energieFin: s.energieFin,
          templateNom: template?.nom ?? null,
          templateLettre: template?.lettre ?? null,
          gymNom: gym?.nom ?? null,
        };
      })
    );

    return NextResponse.json({
      user: {
        nom: user?.nom ?? "Sacha",
        poidsActuel: lastWeight?.poids ?? null,
      },
      blocActif: blocActif
        ? {
            nom: blocActif.nom,
            typeCycle: blocActif.typeCycle,
            semaineActuelle: blocActif.semaineActuelle,
          }
        : null,
      prochaineSeance,
      feuJour,
      feuTendance,
      alertesPreSeance: [],
      poids30jours: poids30jours.slice(0, 30).map((bw) => ({
        date: bw.date,
        poids: bw.poids,
      })),
      precalcSession: precalcSession ? { contenu: precalcSession.contenu } : null,
      weeklyDebrief: weeklyDebrief
        ? { contenu: weeklyDebrief.contenu, weekStart: weeklyDebrief.weekStart }
        : (lastWeekDebrief ? { contenu: lastWeekDebrief.contenu, weekStart: lastWeekDebrief.weekStart } : null),
      recentSessions: recentSessionsWithData,
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 });
  }
}