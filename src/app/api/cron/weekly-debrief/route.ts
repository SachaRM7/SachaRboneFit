import { NextRequest, NextResponse } from "next/server";
import { seancesRealisees } from "@/db/archivage";
import { db } from "@/db/client";
import { sessionLogs, setLogs, sessionIncidents, weeklyDebriefs } from "@/db/schema";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { utilisateursActifsDepuis } from "@/services/seances";
import { contraintesActives } from "@/services/contraintes";
import { recuperationMusculaire, resumeRecuperation } from "@/services/recuperation";
import { genererDebriefHebdo, contenuIAValide, raisonCourte } from "@/services/briefs-llm";
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
 * Le total en kilos disparaît : il additionnait des résistances et des
 * assistances. Voir `statistiquesDeLaSemaine`.
 *
 * Un échec du modèle ne produit plus de faux texte : le débrief précédent est
 * conservé s'il vient réellement d'un modèle, sinon rien n'est écrit — et
 * l'échec apparaît dans `erreurs` au lieu de passer pour une semaine calme.
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

/**
 * L'état des DONNÉES et l'état des APPELS, séparés — voir `precalc-session`.
 *
 * Une panne du modèle ne doit pas se lire comme une semaine calme.
 */
interface Bilan {
  generes: number;
  /** Le modèle a échoué, un débrief VALIDE existait : il est laissé en place. */
  conserves: number;
  ignores: number;
  /** `userId: raison courte`. Jamais les statistiques envoyées au modèle. */
  erreurs: string[];
}

interface Issue {
  donnees: "generes" | "conserves" | "ignores";
  /** Une panne du modèle, et rien d'autre : une semaine sans séance n'en est
   *  pas une. */
  erreur?: string;
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
        bilan[issue.donnees] += 1;
        if (issue.erreur) bilan.erreurs.push(`${userId}: ${issue.erreur}`);
      } catch (e) {
        bilan.erreurs.push(`${userId}: ${raisonCourte(e)}`);
      }
    }

    return NextResponse.json(bilan);
  } catch (e) {
    // Le TYPE de la panne, pas son message : voir `precalc-session`. Une erreur
    // du pilote Postgres reprend la requête et ses paramètres.
    console.error("[cron weekly-debrief] échec global :", e instanceof Error ? e.name : typeof e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

async function debrieferPour(
  userId: string,
  semaine: { debut: string; fin: string },
): Promise<Issue> {
  const stats = await statistiquesDeLaSemaine(userId, semaine);

  const existant = await db.query.weeklyDebriefs.findFirst({
    where: and(eq(weeklyDebriefs.userId, userId), eq(weeklyDebriefs.weekStart, semaine.debut)),
  });
  const dejaValide = Boolean(existant) && contenuIAValide(existant!.contenu, existant!.stats);

  /*
   * Une semaine sans la moindre séance n'a rien à commenter. Faire écrire un
   * texte dessus produirait de la morale, pas un débrief.
   *
   * Et ce n'est pas une panne : aucune erreur n'est déclarée. Le modèle n'a
   * même pas été appelé.
   */
  if (stats.nbSeances === 0) return { donnees: dejaValide ? "conserves" : "ignores" };

  let debrief;
  try {
    debrief = await genererDebriefHebdo(stats);
  } catch (e) {
    // Un débrief hérité d'avant ce lot n'est pas un résultat à conserver.
    return { donnees: dejaValide ? "conserves" : "ignores", erreur: raisonCourte(e) };
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

  // Un succès remplace aussi une ligne héritée : rien à supprimer.
  return { donnees: "generes" };
}

/**
 * Ce que la semaine a réellement contenu.
 *
 * Tout est compté, rien n'est estimé. Les séries viennent d'UNE requête sur
 * les séances de la semaine : la version précédente en faisait une par séance,
 * mises bout à bout.
 *
 * PAS DE VOLUME EN KILOS. `sum(charge × reps)` sur toute la semaine additionne
 * des nombres qui ne mesurent pas la même chose. `charge` n'a pas de sémantique
 * homogène dans cette application : `natureCharge` distingue déjà une
 * résistance d'une ASSISTANCE, où le nombre saisi est une aide — 64 kg
 * d'assistance pèseraient donc plus « lourd » que 50, alors que la seconde
 * séance est la meilleure des deux. S'y ajoutent les conventions de charge :
 * poids d'un haltère, poids total, pile affichée, disques ajoutés.
 *
 * Le total obtenu était précis et faux, et le modèle le recevait comme un fait.
 * Il est retiré. La charge de travail de la semaine s'exprime avec ce qui est
 * réellement comparable : des séances, des séries, des minutes, des feux, des
 * zones signalées et un état de récupération.
 *
 * Le volume garde tout son sens À L'ÉCHELLE D'UN EXERCICE, où le service de
 * progression connaît la convention et écarte les assistances de ce qu'elles
 * fausseraient. Rien n'y est touché : normaliser un tonnage inter-exercices
 * serait un autre sujet, pas une ligne de cette route.
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
    // On ne lit plus ni `charge` ni `repsEffectuees` : seul le NOMBRE de
    // séries se compare d'un exercice à l'autre.
    ids.length
      ? db.query.setLogs.findMany({
        where: inArray(setLogs.sessionLogId, ids),
        columns: { id: true },
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
    // NI `volumeTotal` : voir l'en-tête. Un total en kilos sur une semaine
    // entière additionne des résistances et des assistances.
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
