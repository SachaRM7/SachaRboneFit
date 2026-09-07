import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { precalcSessions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { utilisateursActifsDepuis } from "@/services/seances";
import { prochaineSeance } from "@/services/programmes";
import { contraintesActives } from "@/services/contraintes";
import { recuperationMusculaire, resumeRecuperation } from "@/services/recuperation";
import { mesurerCycle } from "@/services/cycle";
import { genererBriefPreSeance, BriefIndisponible } from "@/services/briefs-llm";
import { libelleMuscle } from "@/lib/referentiels/libelles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || "";

/**
 * Le briefing de la séance de demain.
 *
 * CE QU'IL FAISAIT, ET QUI NE MARCHAIT PAS
 *
 * `getNextSeanceLetter()` rendait `"A"` dans tous les cas — commentaire
 * « for now, simple cycle » à l'appui. Le tableau de bord annonçait donc B et
 * le cron précalculait A, sans que rien ne signale la contradiction. Un prompt
 * était construit, soigneusement, et jeté : le contenu écrit en base était une
 * chaîne fixe se terminant par « Configurez l'intégration LLM ».
 *
 * TROIS CORRECTIONS
 *
 * 1. UNE SEULE RÈGLE DE ROTATION. `prochaineSeance` est la fonction qu'emploient
 *    déjà le tableau de bord et l'écran Programme. Il devient impossible que les
 *    deux annoncent des lettres différentes, parce qu'il n'existe plus qu'un
 *    endroit qui décide.
 *
 * 2. LE MODÈLE EST RÉELLEMENT APPELÉ, avec des données déjà calculées par les
 *    services. Il ne choisit pas la séance ; il met en avant ce qui compte
 *    demain.
 *
 * 3. UN ÉCHEC N'ÉCRIT PLUS DE FAUX CONTENU. Le précalcul précédent est conservé
 *    s'il existe, sinon rien n'est écrit. Un placeholder présenté comme un
 *    résultat est pire qu'une absence : l'absence se remarque.
 *
 * ISOLATION. Chaque service reçoit explicitement `userId`, et `prochaineSeance`
 * ne lit que le bloc actif de ce compte. Le rapport d'erreur ne porte que
 * l'identifiant et le message — jamais le contexte envoyé au modèle.
 */

function demain(): string {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
}

/** Ce que le cron rend : quatre issues distinctes, jamais confondues. */
interface Bilan {
  /** Un texte a été produit par le modèle et écrit. */
  generes: number;
  /** Le modèle a échoué, un précalcul existait : il a été laissé en place. */
  conserves: number;
  /** Rien à écrire — pas de séance suivante, ou échec sans précalcul antérieur. */
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
    // Une séance archivée ne rend personne actif : elle a été retirée du
    // calcul, elle ne peut pas décider qu'il faut en précalculer un autre.
    const userIds = await utilisateursActifsDepuis(ilYa14Jours);
    const cible = demain();

    for (const userId of userIds) {
      try {
        const issue = await precalculerPour(userId, cible);
        bilan[issue] += 1;
      } catch (e) {
        // L'identifiant et le message, rien d'autre : le contexte envoyé au
        // modèle contient l'entraînement d'une personne et n'a rien à faire
        // dans un journal.
        bilan.erreurs.push(`${userId}: ${e instanceof Error ? e.message : "erreur inconnue"}`);
      }
    }

    return NextResponse.json(bilan);
  } catch (e) {
    console.error("[cron precalc-session]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

async function precalculerPour(
  userId: string,
  cible: string,
): Promise<"generes" | "conserves" | "ignores"> {
  // LA rotation, celle du tableau de bord. Pas une seconde règle.
  const suite = await prochaineSeance(userId);
  if (!suite) return "ignores";

  const existant = await db.query.precalcSessions.findFirst({
    where: and(eq(precalcSessions.userId, userId), eq(precalcSessions.targetDate, cible)),
  });

  const contexte = await contexteDuBrief(userId, suite);

  let brief;
  try {
    brief = await genererBriefPreSeance(contexte);
  } catch (e) {
    if (!(e instanceof BriefIndisponible) && !(e instanceof Error)) throw e;
    // Ni placeholder, ni écrasement : ce qui existait vaut mieux que rien, et
    // rien vaut mieux qu'un faux texte.
    return existant ? "conserves" : "ignores";
  }

  const trace = {
    ...contexte,
    genereLe: brief.genereLe,
    modeleUtilise: brief.modeleUtilise,
  };

  if (existant) {
    await db.update(precalcSessions)
      .set({
        contenu: brief.texte,
        seanceTemplateId: suite.template.id,
        contexteUtilise: trace,
      })
      .where(eq(precalcSessions.id, existant.id));
  } else {
    await db.insert(precalcSessions).values({
      userId,
      targetDate: cible,
      seanceTemplateId: suite.template.id,
      contenu: brief.texte,
      contexteUtilise: trace,
    });
  }

  return "generes";
}

/**
 * Ce que le modèle reçoit : des données déjà calculées, jamais des ordres.
 *
 * Toutes les lectures passent par les services qui font autorité ailleurs dans
 * l'application — pas par des requêtes improvisées dans la route. Elles sont
 * menées en parallèle : ce cron traite plusieurs comptes, et les mettre bout à
 * bout multiplierait le temps par le nombre d'utilisateurs.
 */
async function contexteDuBrief(
  userId: string,
  suite: NonNullable<Awaited<ReturnType<typeof prochaineSeance>>>,
) {
  const [cycle, contraintes, recuperation] = await Promise.all([
    mesurerCycle(userId),
    contraintesActives(userId),
    recuperationMusculaire(userId),
  ]);

  return {
    seanceDeDemain: {
      lettre: suite.template.lettre,
      nom: suite.template.nom,
      bloc: suite.bloc.nom,
      typeCycle: suite.bloc.typeCycle,
    },
    cycle: {
      phase: cycle.phase,
      tendancePerformance: cycle.tendancePerformance,
    },
    // Ce que l'application va réellement ménager, avec la sévérité qui décide.
    contraintes: contraintes.map((c) => ({
      muscle: libelleMuscle(c.muscle),
      severite: c.severite,
    })),
    // Les muscles que le moteur juge non prêts, et pourquoi — mot pour mot.
    recuperation: recuperation.muscles
      .filter((m) => m.etat !== "pret")
      .map((m) => ({ muscle: m.libelle, etat: m.etat, detail: resumeRecuperation(m) })),
  };
}
