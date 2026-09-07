import { NextRequest, NextResponse } from "next/server";
import { seancesRealisees } from "@/db/archivage";
import { db } from "@/db/client";
import { sessionLogs, setLogs, sessionIncidents, weeklyDebriefs } from "@/db/schema";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { utilisateursActifsDepuis } from "@/services/seances";
import { contraintesActives } from "@/services/contraintes";
import { recuperationMusculaire, resumeRecuperation } from "@/services/recuperation";
import { genererDebriefHebdo, BriefIndisponible } from "@/services/briefs-llm";
import { signalementsDepuis } from "@/lib/engine/incident-douleur";
import { libelleMuscle } from "@/lib/referentiels/libelles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || "";

/**
 * Le débrief de la semaine écoulée.
 *
 * CE QU'IL FAISAIT
 *
 * Les statistiques étaient calculées, correctement, puis jetées : le contenu
 * écrit en base était une chaîne fixe se terminant par « Configurez
 * l'intégration LLM pour un debrief personnalisé ». Et `progressions` comme
 * `stagnations` étaient déclarés, initialisés à `[]`, et jamais remplis — deux
 * rubriques qui avaient l'air de dire quelque chose.
 *
 * CE QUI CHANGE
 *
 * Les statistiques restent déterministes et le deviennent un peu plus : les
 * séries sont comptées en une requête au lieu d'une par séance. Le modèle les
 * reçoit et rédige le commentaire — rien d'autre.
 *
 * Les deux rubriques vides SONT SUPPRIMÉES plutôt que branchées. Les brancher
 * demanderait de décider ce qu'est une progression sur une semaine, ce que le
 * bilan de progression fait déjà sur d'autres fenêtres ; les laisser aurait
 * invité le modèle à les remplir. Elles reviendront quand un service saura
 * réellement les calculer.
 *
 * Un échec du modèle ne produit plus de faux texte : le débrief précédent est
 * conservé s'il existe, sinon rien n'est écrit.
 */

/** Lundi et dimanche de la semaine qui contient `date`. */
function bornesSemaine(date: Date): { debut: string; fin: string } {
  const debut = new Date(date);
  // `getDay()` rend 0 le dimanche : on le ramène à la fin de la semaine.
  const decalage = (date.getDay() + 6) % 7;
  debut.setDate(date.getDate() - decalage);
  const fin = new Date(debut);
  fin.setDate(debut.getDate() + 6);
  return { debut: debut.toISOString().slice(0, 10), fin: fin.toISOString().slice(0, 10) };
}

interface Bilan {
  generes: number;
  conserves: number;
  ignores: number;
  erreurs: string[];
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bilan: Bilan = { generes: 0, conserves: 0, ignores: 0, erreurs: [] };

  try {
    const ilYa14Jours = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
    // Le même prédicat que le précalcul : une séance archivée ne rend personne
    // actif. La version précédente lisait toutes les `session_logs` sans filtre.
    const userIds = await utilisateursActifsDepuis(ilYa14Jours);
    const semaine = bornesSemaine(new Date());

    for (const userId of userIds) {
      try {
        const issue = await debrieferPour(userId, semaine);
        bilan[issue] += 1;
      } catch (e) {
        bilan.erreurs.push(`${userId}: ${e instanceof Error ? e.message : "erreur inconnue"}`);
      }
    }

    return NextResponse.json(bilan);
  } catch (e) {
    console.error("[cron weekly-debrief]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

async function debrieferPour(
  userId: string,
  semaine: { debut: string; fin: string },
): Promise<"generes" | "conserves" | "ignores"> {
  const stats = await statistiquesDeLaSemaine(userId, semaine);

  const existant = await db.query.weeklyDebriefs.findFirst({
    where: and(eq(weeklyDebriefs.userId, userId), eq(weeklyDebriefs.weekStart, semaine.debut)),
  });

  // Une semaine sans la moindre séance n'a rien à commenter. Faire écrire un
  // texte dessus produirait de la morale, pas un débrief.
  if (stats.nbSeances === 0) return existant ? "conserves" : "ignores";

  let debrief;
  try {
    debrief = await genererDebriefHebdo(stats);
  } catch (e) {
    if (!(e instanceof BriefIndisponible) && !(e instanceof Error)) throw e;
    return existant ? "conserves" : "ignores";
  }

  /*
   * La traçabilité voyage dans `stats`, qui est déjà un `jsonb`.
   *
   * Aucune migration : ajouter deux colonnes pour deux chaînes reviendrait à
   * modifier le schéma d'une base en service pour un confort d'affichage.
   */
  const aEcrire = {
    ...stats,
    genereLe: debrief.genereLe,
    modeleUtilise: debrief.modeleUtilise,
  };

  if (existant) {
    await db.update(weeklyDebriefs)
      .set({ contenu: debrief.texte, stats: aEcrire })
      .where(eq(weeklyDebriefs.id, existant.id));
  } else {
    await db.insert(weeklyDebriefs).values({
      userId,
      weekStart: semaine.debut,
      weekEnd: semaine.fin,
      contenu: debrief.texte,
      stats: aEcrire,
    });
  }

  return "generes";
}

/**
 * Ce que la semaine a réellement contenu.
 *
 * Tout est compté, rien n'est estimé. Les séries et le volume viennent d'UNE
 * requête agrégée sur les séances de la semaine : la version précédente en
 * faisait une par séance, mises bout à bout.
 */
async function statistiquesDeLaSemaine(
  userId: string,
  semaine: { debut: string; fin: string },
) {
  const seances = await db.query.sessionLogs.findMany({
    where: and(
      seancesRealisees(userId),
      gte(sessionLogs.date, semaine.debut),
      lte(sessionLogs.date, semaine.fin),
    ),
    columns: { id: true, date: true, dureeMinutes: true, feuBiologiqueJour: true },
  });

  const ids = seances.map((s) => s.id);

  const [series, incidents, contraintes, recuperation] = await Promise.all([
    ids.length
      ? db.query.setLogs.findMany({
        where: inArray(setLogs.sessionLogId, ids),
        columns: { charge: true, repsEffectuees: true },
      })
      : Promise.resolve([]),
    ids.length
      ? db.query.sessionIncidents.findMany({ where: inArray(sessionIncidents.sessionLogId, ids) })
      : Promise.resolve([]),
    contraintesActives(userId),
    recuperationMusculaire(userId),
  ]);

  const feux = { vert: 0, orange: 0, rouge: 0 };
  for (const s of seances) {
    if (s.feuBiologiqueJour === "vert") feux.vert += 1;
    else if (s.feuBiologiqueJour === "orange") feux.orange += 1;
    else if (s.feuBiologiqueJour === "rouge") feux.rouge += 1;
  }

  const volumeTotal = Math.round(
    series.reduce((total, s) => total + s.charge * s.repsEffectuees, 0),
  );

  /*
   * Les zones réellement signalées, relues par le lecteur commun du lot 13.
   *
   * Un nombre d'incidents ne dit rien : « 2 incidents » se commente mal.
   * « L'épaule a été signalée deux fois » se commente. La relecture accepte les
   * trois formats présents en base, donc un incident ancien compte aussi.
   */
  const zonesSignalees = new Map<string, number>();
  for (const i of incidents) {
    if (i.type !== "douleur") continue;
    for (const s of signalementsDepuis(i.contexte, semaine.debut)) {
      zonesSignalees.set(s.muscle, (zonesSignalees.get(s.muscle) ?? 0) + 1);
    }
  }

  return {
    semaine,
    nbSeances: seances.length,
    dureeTotaleMinutes: seances.reduce((t, s) => t + (s.dureeMinutes ?? 0), 0),
    nbSeries: series.length,
    volumeTotal,
    feux,
    incidentsNb: incidents.length,
    zonesSignalees: [...zonesSignalees].map(([muscle, fois]) => ({
      muscle: libelleMuscle(muscle),
      fois,
    })),
    contraintes: contraintes.map((c) => ({
      muscle: libelleMuscle(c.muscle),
      severite: c.severite,
    })),
    // L'exposition récente, telle que le moteur la juge. C'est ce qui permet de
    // dire « le dos a été sollicité deux fois avec peu de récupération entre
    // les deux » — et de ne le dire que si c'est vrai.
    recuperation: recuperation.muscles
      .filter((m) => m.etat !== "pret")
      .map((m) => ({ muscle: m.libelle, etat: m.etat, detail: resumeRecuperation(m) })),
    // NI `progressions` NI `stagnations` : voir l'en-tête. Deux tableaux
    // toujours vides invitaient le modèle à les remplir.
  };
}
