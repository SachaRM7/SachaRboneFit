import { createHash } from "node:crypto";
import { db } from "@/db/client";
import { seancesRealisees } from "@/db/archivage";
import {
  exerciseInstances, exercises, seanceTemplates, sessionDebriefs, sessionLogs, setLogs,
} from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { appelerLLM } from "@/lib/coach/llm-client";
import { SeanceIntrouvable } from "./seances";

/**
 * Le débrief d'une séance : généré une fois, conservé, relu ensuite.
 *
 * Ce qui existait n'avait pas cette forme. Le composant demandait au coach, à
 * CHAQUE ouverture de la fiche, d'écrire un débrief — y compris pour une séance
 * vieille de six mois qu'on ouvrait juste pour vérifier une charge. Chaque
 * consultation créait donc une conversation de coach, écrivait deux messages et
 * payait un appel modèle.
 *
 * Et rien ne s'affichait : le composant lisait la réponse comme un flux
 * d'événements (`data: …`) alors que la route du coach répond en JSON. Le texte
 * accumulé restait vide, le chargement se terminait, et l'écran rendait un
 * cadre titré sans contenu. Le coût était payé à chaque fois, le résultat
 * jamais montré.
 *
 * La règle tenue ici : **une lecture d'historique n'appelle jamais le modèle**.
 * La séance se clôt, le débrief est généré une fois et enregistré ; les
 * consultations suivantes lisent. Régénérer existe, mais c'est une action
 * demandée.
 */

export interface DebriefDeSeance {
  contenu: string;
  genereLe: Date;
  modele: string | null;
  /** Vrai quand les séries ont changé depuis la génération. */
  perime: boolean;
}

/** Le modèle n'écrit pas indéfiniment : un débrief se lit en trente secondes. */
const MOTS_MAXIMUM = 180;

// La même classe que la clôture, et non une seconde du même nom : deux
// exceptions homonymes dans deux modules se rattrapent mal, et le jour où un
// appelant importe la mauvaise, le `catch` ne prend rien.
export { SeanceIntrouvable } from "./seances";

/**
 * Ce dont le débrief parle, réduit à une empreinte.
 *
 * Elle ne déclenche rien : elle permet de CONSTATER qu'un texte ne décrit plus
 * la séance — après correction d'une charge, par exemple. Régénérer reste une
 * décision, jamais un effet de bord de la lecture.
 */
function empreinte(lignes: Array<{ id: string; numeroSerie: number; reps: number; charge: number; rpe: number | null }>): string {
  const contenu = lignes
    .map((l) => `${l.id}:${l.numeroSerie}:${l.reps}:${l.charge}:${l.rpe ?? ""}`)
    .sort()
    .join("|");
  return createHash("sha256").update(contenu).digest("hex").slice(0, 32);
}

/** La séance et ses séries, bornées au compte : jamais celles d'un autre. */
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

/** Le débrief enregistré, ou `null`. Ne génère jamais. */
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

  // L'empreinte se recalcule sur les séries actuelles : c'est la seule façon
  // de dire « ce texte ne parle plus de ce qui est écrit ».
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

/**
 * Génère le débrief et l'enregistre, en remplaçant le précédent.
 *
 * Appelée à la clôture d'une séance, et par le bouton « Régénérer ». Jamais
 * par une lecture.
 */
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

  const contenu = reponse.texte.trim();
  if (!contenu) {
    // Un texte vide n'est pas un débrief : on ne l'enregistre pas, sinon la
    // lecture suivante rendrait un cadre vide en croyant lire un résultat.
    throw new Error("Le modèle n'a rien renvoyé");
  }

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
