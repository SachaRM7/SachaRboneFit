import { createHash } from "node:crypto";
import { db } from "@/db/client";
import { seancesRealisees } from "@/db/archivage";
import {
  exerciseInstances, exercises, seanceTemplates, sessionDebriefs, sessionLogs, setLogs,
} from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { SeanceIntrouvable } from "./seances";

export interface DebriefDeSeance {
  contenu: string;
  genereLe: Date;
  modele: string | null;
  perime: boolean;
}

export { SeanceIntrouvable } from "./seances";

function empreinte(lignes: Array<{ id: string; numeroSerie: number; reps: number; charge: number; rpe: number | null }>): string {
  const contenu = lignes
    .map((l) => `${l.id}:${l.numeroSerie}:${l.reps}:${l.charge}:${l.rpe ?? ""}`)
    .sort()
    .join("|");
  return createHash("sha256").update(contenu).digest("hex").slice(0, 32);
}

async function lireLaSeance(userId: string, sessionLogId: string) {
  const seance = await db.query.sessionLogs.findFirst({
    where: and(eq(sessionLogs.id, sessionLogId), seancesRealisees(userId)),
  });
  if (!seance) throw new SeanceIntrouvable();

  const lignes = await db
    .select({
      id: setLogs.exerciseInstanceId,
      numeroSerie: setLogs.numeroSerie,
      reps: setLogs.repsEffectuees,
      charge: setLogs.charge,
      rpe: setLogs.rpeEffectif,
      exercice: exercises.nom,
      machine: exerciseInstances.machineNom,
    })
    .from(setLogs)
    .innerJoin(exerciseInstances, eq(exerciseInstances.id, setLogs.exerciseInstanceId))
    .innerJoin(exercises, eq(exercises.id, exerciseInstances.exerciseId))
    .where(eq(setLogs.sessionLogId, sessionLogId))
    .orderBy(asc(setLogs.numeroSerie));

  const gabarit = seance.seanceTemplateId
    ? await db.query.seanceTemplates.findFirst({ where: eq(seanceTemplates.id, seance.seanceTemplateId) })
    : null;

  return { seance, lignes, gabarit };
}

export async function debriefEnregistre(
  userId: string,
  sessionLogId: string,
): Promise<DebriefDeSeance | null> {
  const [enregistre] = await db
    .select()
    .from(sessionDebriefs)
    .where(and(eq(sessionDebriefs.sessionLogId, sessionLogId), eq(sessionDebriefs.userId, userId)))
    .limit(1);
  if (!enregistre) return null;

  const lignes = await db
    .select({
      id: setLogs.exerciseInstanceId,
      numeroSerie: setLogs.numeroSerie,
      reps: setLogs.repsEffectuees,
      charge: setLogs.charge,
      rpe: setLogs.rpeEffectif,
    })
    .from(setLogs)
    .where(eq(setLogs.sessionLogId, sessionLogId));

  return {
    contenu: enregistre.contenu,
    genereLe: enregistre.genereLe,
    modele: enregistre.modele,
    perime: enregistre.empreinteSource !== null && enregistre.empreinteSource !== empreinte(lignes),
  };
}

export async function genererDebrief(
  userId: string,
  sessionLogId: string,
): Promise<DebriefDeSeance> {
  const { seance, lignes, gabarit } = await lireLaSeance(userId, sessionLogId);

  const parExercice = new Map<string, typeof lignes>();
  for (const ligne of lignes) {
    parExercice.set(ligne.id, [...(parExercice.get(ligne.id) ?? []), ligne]);
  }

  const nom = gabarit ? `${gabarit.lettre} — ${gabarit.nom}` : "Séance libre";
  const parties: string[] = [
    `${nom} terminée : ${parExercice.size} exercice${parExercice.size > 1 ? "s" : ""}, ${lignes.length} série${lignes.length > 1 ? "s" : ""}${seance.dureeMinutes ? `, ${seance.dureeMinutes} min` : ""}.`,
  ];

  for (const series of [...parExercice.values()].slice(0, 4)) {
    const tete = series[0]!;
    const meilleure = series.reduce((a, b) => (b.charge * b.reps > a.charge * a.reps ? b : a), series[0]!);
    const rpes = series.map((s) => s.rpe).filter((r): r is number => r !== null);
    const rpeMax = rpes.length ? Math.max(...rpes) : null;
    parties.push(`${tete.exercice} : ${series.length} série${series.length > 1 ? "s" : ""}, repère ${meilleure.charge} kg × ${meilleure.reps}${rpeMax !== null ? `, RPE max ${rpeMax}` : ""}.`);
  }

  if (seance.energieFin !== null && seance.energieFin !== undefined) {
    parties.push(`Énergie en fin de séance : ${seance.energieFin}/10.`);
  }

  parties.push("La prochaine prescription sera recalculée à partir de l'exécution enregistrée.");

  const contenu = parties.join("\n");
  const valeurs = {
    userId,
    sessionLogId,
    contenu,
    genereLe: new Date(),
    modele: "deterministe:debrief-v1",
    empreinteSource: empreinte(lignes),
  };

  await db
    .insert(sessionDebriefs)
    .values(valeurs)
    .onConflictDoUpdate({ target: sessionDebriefs.sessionLogId, set: valeurs });

  return {
    contenu,
    genereLe: valeurs.genereLe,
    modele: valeurs.modele,
    perime: false,
  };
}
