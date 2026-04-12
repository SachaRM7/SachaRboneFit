import { db } from "@/db/client";
import { users, programmeBlocs, sessionLogs, dailyStates, bodyWeights, seanceTemplates } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export interface CoachContext {
  userId: string;
  userName: string | null;
  userEmail: string | null;
  currentWeight: number | null;
  phaseNutritionnelle: string | null;
  objectifChiffre: string | null;
  blocActif: {
    nom: string;
    typeCycle: string;
    semaineActuelle: number;
  } | null;
  dailyStateToday: {
    sommeilHeures: number | null;
    jeuneBool: boolean;
    energieDepart: number | null;
    feuJour: "vert" | "orange" | "rouge" | null;
  } | null;
  last5Sessions: Array<{
    date: string;
    lettre: string | null;
    feuJour: string | null;
    feuTendance: string | null;
    energieFin: number | null;
  }>;
  today: string;
}

export async function loadCoachContext(userId: string): Promise<CoachContext> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  const lastWeight = await db.query.bodyWeights.findFirst({
    where: eq(bodyWeights.userId, userId),
    orderBy: [desc(bodyWeights.date)],
  });

  const blocActif = await db.query.programmeBlocs.findFirst({
    where: eq(programmeBlocs.actif, true),
  });

  const today = new Date().toISOString().split("T")[0] ?? "";
  const dailyStateToday = await db.query.dailyStates.findFirst({
    where: (ds, { eq, and }) => and(eq(ds.userId, userId), eq(ds.date, today)),
  });

  const last5Sessions = await db.query.sessionLogs.findMany({
    where: eq(sessionLogs.userId, userId),
    orderBy: [desc(sessionLogs.createdAt)],
    limit: 5,
  });

  // Get template letters for each session
  const sessionsWithLetters = await Promise.all(
    last5Sessions.map(async (session) => {
      let lettre: string | null = null;
      if (session.seanceTemplateId) {
        const template = await db.query.seanceTemplates.findFirst({
          where: eq(seanceTemplates.id, session.seanceTemplateId),
        });
        lettre = template?.lettre || null;
      }
      return {
        date: session.date,
        lettre,
        feuJour: session.feuBiologiqueJour,
        feuTendance: session.feuBiologiqueTendance,
        energieFin: session.energieFin,
      };
    })
  );

  // Import computeFeuJour dynamically to avoid circular deps
  let feuJour: "vert" | "orange" | "rouge" | null = null;
  if (dailyStateToday) {
    const { computeFeuJour } = await import("@/lib/engine/feu-biologique");
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

  return {
    userId,
    userName: user?.nom ?? null,
    userEmail: user?.email ?? null,
    currentWeight: lastWeight?.poids ?? null,
    phaseNutritionnelle: user?.phaseNutritionnelle ?? null,
    objectifChiffre: user?.objectifChiffre ?? null,
    blocActif: blocActif
      ? {
          nom: blocActif.nom,
          typeCycle: blocActif.typeCycle,
          semaineActuelle: blocActif.semaineActuelle ?? 1,
        }
      : null,
    dailyStateToday: dailyStateToday
      ? {
          sommeilHeures: dailyStateToday.sommeilHeures ?? null,
          jeuneBool: dailyStateToday.jeuneBool ?? false,
          energieDepart: dailyStateToday.energieDepart ?? null,
          feuJour,
        }
      : null,
    last5Sessions: sessionsWithLetters,
    today,
  };
}
