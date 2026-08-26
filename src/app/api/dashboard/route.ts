import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { sessionLogs, dailyStates, bodyWeights, seanceTemplates, programmeBlocs, precalcSessions, weeklyDebriefs, gyms } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { computeFeuJour } from "@/lib/engine/feu-biologique";
import { alertes } from "@/services/progression";
import { prochaineSeance } from "@/services/programmes";
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

    // La rotation était dupliquée ici, avec le même défaut qu'ailleurs : lettres
    // A/B/C en dur, cycle figé à trois séances. Elle passe par le service, qui
    // s'appuie sur `ordreDansSemaine` et le nombre réel de séances du bloc.
    const suite = await prochaineSeance(userId);
    const seanceSuivante = suite
      ? { lettre: suite.template.lettre, templateId: suite.template.id, templateNom: suite.template.nom }
      : { lettre: "", templateId: "", templateNom: "Aucune séance programmée" };

    const todayStr = new Date().toISOString().slice(0, 10);
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
    const weekStartStr = startOfWeek.toISOString().slice(0, 10);

    const weeklyDebrief = await db.query.weeklyDebriefs.findFirst({
      where: and(eq(weeklyDebriefs.userId, userId), eq(weeklyDebriefs.weekStart, weekStartStr)),
    });

    const lastWeekStart = new Date(startOfWeek);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekStartStr = lastWeekStart.toISOString().slice(0, 10);

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
      prochaineSeance: seanceSuivante,
      feuJour,
      feuTendance,
      // Renvoyait un tableau vide en dur : le moteur d'alertes tournait dans le
      // vide, ses agrégats n'étant calculés nulle part.
      alertesPreSeance: await alertes(userId),
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