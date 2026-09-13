import { createHash } from "node:crypto";
import { db } from "@/db/client";
import { seancesRealisees } from "@/db/archivage";
import {
  exerciseInstances, exercises, seanceTemplates, sessionDebriefs, sessionLogs, setLogs,
} from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { appelerLLM } from "@/lib/coach/llm-client";
import { SeanceIntrouvable } from "./seances";

export interface DebriefDeSeance {
  contenu: string;
  genereLe: Date;
  modele: string | null;
  perime: boolean;
}

const MOTS_MAXIMUM = 180;

export { SeanceIntrouvable } from "./seances";

function bornerMots(texte: string, maximum: number): string {
  const mots = texte.trim().split(/\s+/).filter(Boolean);
  if (mots.length <= maximum) return texte.trim();
  return `${mots.slice(0, maximum).join(" ")}…`;
}

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
    ? await db.query.seanceTemplates.findFirst({
        where: eq(seanceTemplates.id, seance.seanceTemplateId),
      })
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
    perime:
      enregistre.empreinteSource !== null && enregistre.empreinteSource !== empreinte(lignes),
  };
}

const CONSIGNE = `Tu es le coach de cette personne. Tu écris le débrief d'une séance qui vient d'avoir lieu.

Dis, dans cet ordre et sans titres :
- ce qui a progressé, chiffres à l'appui ;
- ce qui mérite attention ;
- ce qu'il faut préparer pour la prochaine séance.

Contraintes : ${MOTS_MAXIMUM} mots maximum, pas de liste à puces, pas de félicitations creuses, aucune invention. Tu ne disposes que des données ci-dessous : si elles ne suffisent pas à dire quelque chose, dis-le franchement plutôt que de meubler.`;

export async function genererDebrief(
  userId: string,
  sessionLogId: string,
): Promise<DebriefDeSeance> {
  const { seance, lignes, gabarit } = await lireLaSeance(userId, sessionLogId);

  const parExercice = new Map<string, typeof lignes>();
  for (const l of lignes) {
    parExercice.set(l.id, [...(parExercice.get(l.id) ?? []), l]);
  }

  const donnees = [
    `Séance : ${gabarit ? `${gabarit.lettre} — ${gabarit.nom}` : "séance libre"}`,
    `Date : ${seance.date}`,
    seance.dureeMinutes ? `Durée : ${seance.dureeMinutes} min` : null,
    seance.energieFin ? `Énergie en fin de séance : ${seance.energieFin}/10` : null,
    seance.notesSeance ? `Note laissée : ${seance.notesSeance}` : null,
    "",
    ...[...parExercice.values()].map((series) => {
      const tete = series[0]!;
      const detail = series
        .map((s) => `${s.charge} kg × ${s.reps}${s.rpe !== null ? ` (RPE ${s.rpe})` : ""}`)
        .join(", ");
      return `${tete.exercice} (${tete.machine}) : ${detail}`;
    }),
  ]
    .filter((l) => l !== null)
    .join("\n");

  const reponse = await appelerLLM({
    messages: [{ role: "user", content: donnees }],
    system: CONSIGNE,
  });

  const contenu = bornerMots(reponse.texte, MOTS_MAXIMUM);
  if (!contenu) throw new Error("Le modèle n'a rien renvoyé");

  const valeurs = {
    userId,
    sessionLogId,
    contenu,
    genereLe: new Date(),
    modele: reponse.modeleUtilise ?? null,
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
