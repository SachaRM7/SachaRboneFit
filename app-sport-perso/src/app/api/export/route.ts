import { NextResponse } from "next/server";
import { db } from "@/db/client";
import {
  users, sessionLogs, setLogs, dailyStates, bodyWeights,
  programmeBlocs, seanceTemplates, exerciseInTemplate, exerciseInstances, exercises, gyms
} from "@/db/schema";
import { MOCK_USER_ID } from "@/lib/constants";
import { eq } from "drizzle-orm";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") || "json";

  // Get all user data
  const user = await db.query.users.findFirst({ where: eq(users.id, MOCK_USER_ID) });
  const sessions = await db.query.sessionLogs.findMany({ where: eq(sessionLogs.userId, MOCK_USER_ID) });
  const dailyStatesData = await db.query.dailyStates.findMany({ where: eq(dailyStates.userId, MOCK_USER_ID) });
  const bodyWeightsData = await db.query.bodyWeights.findMany({ where: eq(bodyWeights.userId, MOCK_USER_ID) });
  const programmes = await db.query.programmeBlocs.findMany({ where: eq(programmeBlocs.userId, MOCK_USER_ID) });

  // Get all set logs for user sessions
  const sessionIds = sessions.map(s => s.id);
  const allSets: any[] = [];
  for (const sid of sessionIds) {
    const sets = await db.query.setLogs.findMany({ where: eq(setLogs.sessionLogId, sid) });
    allSets.push(...sets);
  }

  // Get templates and instances used in sessions
  const templateIds = [...new Set(sessions.map(s => s.seanceTemplateId).filter(Boolean))];
  const templatesData: any[] = [];
  for (const tid of templateIds) {
    if (!tid) continue;
    const t = await db.query.seanceTemplates.findFirst({ where: eq(seanceTemplates.id, tid) });
    if (t) templatesData.push(t);
  }

  const instanceIds = [...new Set(allSets.map(s => s.exerciseInstanceId).filter(Boolean))];
  const instancesData: any[] = [];
  for (const iid of instanceIds) {
    if (!iid) continue;
    const inst = await db.query.exerciseInstances.findFirst({ where: eq(exerciseInstances.id, iid) });
    if (inst) instancesData.push(inst);
  }

  const exerciseIds: string[] = [...new Set(instancesData.map(i => i.exerciseId).filter(Boolean) as string[])];
  const exercisesData: any[] = [];
  for (const eid of exerciseIds) {
    if (!eid) continue;
    const ex = await db.query.exercises.findFirst({ where: eq(exercises.id, eid) });
    if (ex) exercisesData.push(ex);
  }

  const gymIds: string[] = [...new Set<string>([...sessions.map(s => s.gymId).filter(Boolean) as string[], ...instancesData.map(i => i.gymId).filter(Boolean) as string[]])];
  const gymsData: any[] = [];
  for (const gid of gymIds) {
    const g = await db.query.gyms.findFirst({ where: eq(gyms.id, gid) });
    if (g) gymsData.push(g);
  }

  const exportData = {
    exportedAt: new Date().toISOString(),
    user: user ? { id: user.id, email: user.email, nom: user.nom, dateNaissance: user.dateNaissance, taille: user.taille, objectifChiffre: user.objectifChiffre } : null,
    sessions: sessions.map(s => ({
      id: s.id, date: s.date, dureeMinutes: s.dureeMinutes, energieFin: s.energieFin,
      feuBiologiqueJour: s.feuBiologiqueJour, feuBiologiqueTendance: s.feuBiologiqueTendance,
      volumeAjustePct: s.volumeAjustePct, volumeAjusteRaison: s.volumeAjusteRaison,
      notesSeance: s.notesSeance, seanceTemplateId: s.seanceTemplateId, gymId: s.gymId, dailyStateId: s.dailyStateId,
    })),
    sets: allSets.map(s => ({
      id: s.id, sessionLogId: s.sessionLogId, exerciseInstanceId: s.exerciseInstanceId,
      numeroSerie: s.numeroSerie, repsEffectuees: s.repsEffectuees, charge: s.charge,
      rpeEffectif: s.rpeEffectif, reposReelSecondes: s.reposReelSecondes, notes: s.notes,
    })),
    dailyStates: dailyStatesData,
    bodyWeights: bodyWeightsData,
    programmes,
    templates: templatesData,
    instances: instancesData,
    exercises: exercisesData,
    gyms: gymsData,
  };

  if (format === "csv") {
    // Return JSON for now (ZIP requires additional library)
    return NextResponse.json(exportData);
  }

  return NextResponse.json(exportData);
}