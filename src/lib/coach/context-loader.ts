import { db } from "@/db/client";
import { seancesRealisees } from "@/db/archivage";
import { positionDuBloc } from "@/services/cycle";
import { libelleCycle } from "@/lib/referentiels/cycle";
import { users, programmeBlocs, sessionLogs, dailyStates, bodyWeights, seanceTemplates } from "@/db/schema";
import { eq, desc, and, isNull } from "drizzle-orm";

export interface CoachContext {
  userId: string;
  userName: string | null;
  userEmail: string | null;
  currentWeight: number | null;
  phaseNutritionnelle: string | null;
  objectifChiffre: string | null;
  blocActif: {
    nom: string;
    libelleCycle: string;
    semaine: number;
    semainesTotal: number | null;
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

  // La requete n'etait pas scopee : le contexte du coach pouvait charger le bloc
  // actif d'un autre compte.
  const blocActif = await db.query.programmeBlocs.findFirst({
    where: (pb, { and, eq }) => and(eq(pb.userId, userId), eq(pb.actif, true)),
  });

  const today = new Date().toISOString().slice(0, 10);
  const dailyStateToday = await db.query.dailyStates.findFirst({
    where: (ds, { eq, and }) => and(eq(ds.userId, userId), eq(ds.date, today)),
  });

  const last5Sessions = await db.query.sessionLogs.findMany({
    where: seancesRealisees(userId),
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
    // Mêmes valeurs par défaut que le constructeur de séance : c'est lui qui
    // persiste `feu_biologique_jour`, et l'affichage ne doit pas le contredire.
    const { etatPourLeMoteur } = await import("@/lib/engine/feu-biologique");
    feuJour = computeFeuJour(etatPourLeMoteur(dailyStateToday)).feu;
  }

  return {
    userId,
    userName: user?.nom ?? null,
    userEmail: user?.email ?? null,
    currentWeight: lastWeight?.poids ?? null,
    phaseNutritionnelle: user?.phaseNutritionnelle ?? null,
    objectifChiffre: user?.objectifChiffre ?? null,
    // `semaine_actuelle` est figée à 1 en base : le coach recevait « semaine 1 »
    // quelle que soit l'ancienneté du bloc, pendant que l'interface affichait
    // la vraie. Une seule définition, celle de `positionDuBloc`.
    blocActif: blocActif
      ? {
          nom: blocActif.nom,
          libelleCycle: libelleCycle(blocActif.typeCycle).libelle,
          semaine: positionDuBloc(blocActif).semaine,
          semainesTotal: positionDuBloc(blocActif).semainesTotal,
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
