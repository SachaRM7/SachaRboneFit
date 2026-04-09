import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { sessionLogs, dailyStates, bodyWeights, seanceTemplates, programmeBlocs } from "@/db/schema";
import { MOCK_USER_ID } from "@/lib/constants";
import { eq, desc, and, isNull, asc } from "drizzle-orm";
import { computeFeuJour } from "@/lib/engine/feu-biologique";

export async function GET() {
  try {
    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, MOCK_USER_ID),
    });

    const lastWeight = await db.query.bodyWeights.findFirst({
      where: eq(bodyWeights.userId, MOCK_USER_ID),
      orderBy: [desc(bodyWeights.date)],
    });

    const blocActif = await db.query.programmeBlocs.findFirst({
      where: eq(programmeBlocs.actif, true),
    });

    const lastSession = await db.query.sessionLogs.findFirst({
      where: eq(sessionLogs.userId, MOCK_USER_ID),
      orderBy: [desc(sessionLogs.createdAt)],
    });

    let prochaineSeance = { lettre: "A", templateId: "", templateNom: "Seance A" };

    if (lastSession && lastSession.seanceTemplateId) {
      const lastTemplate = await db.query.seanceTemplates.findFirst({
        where: eq(seanceTemplates.id, lastSession.seanceTemplateId),
      });
      if (lastTemplate && blocActif) {
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
    } else if (blocActif) {
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

    const today = new Date().toISOString().split("T")[0] ?? "";
    const dailyStateToday = await db.query.dailyStates.findFirst({
      where: and(eq(dailyStates.userId, MOCK_USER_ID), eq(dailyStates.date, today)),
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
      where: eq(bodyWeights.userId, MOCK_USER_ID),
      orderBy: [desc(bodyWeights.date)],
    });

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
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 });
  }
}
