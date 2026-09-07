import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { precalcSessions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { utilisateursActifsDepuis } from "@/services/seances";
import { prochaineSeance } from "@/services/programmes";
import { contraintesActives } from "@/services/contraintes";
import { recuperationMusculaire, resumeRecuperation } from "@/services/recuperation";
import { mesurerCycle } from "@/services/cycle";
import { genererBriefPreSeance, contenuIAValide, raisonCourte } from "@/services/briefs-llm";
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
 *    s'il est réellement issu d'un modèle, sinon rien n'est écrit. Un
 *    placeholder présenté comme un résultat est pire qu'une absence :
 *    l'absence se remarque.
 *
 * 4. ET L'ÉCHEC SE VOIT. Conserver sans le dire produisait un rapport
 *    rassurant — `conserves: 1, erreurs: []` — pour un cron qui n'avait rien
 *    produit depuis des jours. L'état des données et l'état de l'appel sont
 *    désormais deux choses distinctes.
 *
 * ISOLATION. Chaque service reçoit explicitement `userId`, et `prochaineSeance`
 * ne lit que le bloc actif de ce compte. Le rapport d'erreur ne porte que
 * l'identifiant et le message — jamais le contexte envoyé au modèle.
 */

function demain(): string {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
}

/**
 * Ce que le cron rend : l'état des DONNÉES et l'état des APPELS, séparés.
 *
 * Les trois compteurs disent ce qu'il y a en base. `erreurs` dit si l'IA a
 * répondu. Les confondre rendait une panne muette : clé absente, quota atteint
 * ou 503 donnaient `conserves: 1, erreurs: []` — un rapport rassurant pour un
 * cron qui n'avait rien produit depuis des jours. Ne pas écraser un contenu
 * valide est le bon comportement ; le taire ne l'est pas.
 *
 * Les deux dimensions sont indépendantes : une panne peut aboutir à
 * `conserves` comme à `ignores`, et les deux s'accompagnent alors d'une erreur.
 */
interface Bilan {
  /** Un texte a été produit par le modèle et écrit. */
  generes: number;
  /** Le modèle a échoué, un précalcul VALIDE existait : il est laissé en place. */
  conserves: number;
  /** Rien à écrire — pas de séance suivante, ou échec sans précalcul valide. */
  ignores: number;
  /** Les appels qui ont échoué, `userId: raison courte`. Jamais le contexte. */
  erreurs: string[];
}

/** Ce qu'un compte a produit : un état de données, et peut-être une panne. */
interface Issue {
  donnees: "generes" | "conserves" | "ignores";
  /** Renseigné UNIQUEMENT sur une panne du modèle. Un compte sans programme
   *  est `ignores` sans erreur : il n'y a rien d'anormal à signaler. */
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
    // Une séance archivée ne rend personne actif : elle a été retirée du
    // calcul, elle ne peut pas décider qu'il faut en précalculer un autre.
    const userIds = await utilisateursActifsDepuis(ilYa14Jours);
    const cible = demain();

    for (const userId of userIds) {
      try {
        const issue = await precalculerPour(userId, cible);
        bilan[issue.donnees] += 1;
        if (issue.erreur) bilan.erreurs.push(`${userId}: ${issue.erreur}`);
      } catch (e) {
        // L'identifiant et une raison courte, rien d'autre : le contexte envoyé
        // au modèle contient l'entraînement d'une personne et n'a rien à faire
        // dans un journal.
        bilan.erreurs.push(`${userId}: ${raisonCourte(e)}`);
      }
    }

    return NextResponse.json(bilan);
  } catch (e) {
    /*
     * Le TYPE de la panne, pas son message.
     *
     * Cette branche n'attrape que ce qui casse hors de la boucle — la lecture
     * des comptes actifs, essentiellement. Or le message d'une erreur du pilote
     * Postgres reprend la requête ET SES PARAMÈTRES : identifiants, adresses
     * e-mail. Le journal d'une plateforme tierce n'est pas l'endroit pour ça.
     */
    console.error("[cron precalc-session] échec global :", e instanceof Error ? e.name : typeof e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

async function precalculerPour(userId: string, cible: string): Promise<Issue> {
  // LA rotation, celle du tableau de bord. Pas une seconde règle.
  const suite = await prochaineSeance(userId);
  // Pas de bloc actif : il n'y a rien à précalculer, et rien d'anormal non
  // plus. Une erreur ici noierait les vraies pannes sous les comptes au repos.
  if (!suite) return { donnees: "ignores" };

  const existant = await db.query.precalcSessions.findFirst({
    where: and(eq(precalcSessions.userId, userId), eq(precalcSessions.targetDate, cible)),
  });

  const contexte = await contexteDuBrief(userId, suite);

  let brief;
  try {
    brief = await genererBriefPreSeance(contexte);
  } catch (e) {
    /*
     * Ni placeholder, ni écrasement — mais le silence non plus.
     *
     * « Conserver » n'a de sens que si ce qui existe vient réellement d'un
     * modèle. Un texte hérité d'avant ce lot est un placeholder : le tenir pour
     * un résultat utile ferait durer précisément ce que la PR corrige.
     */
    const valide = existant && contenuIAValide(existant.contenu, existant.contexteUtilise);
    return { donnees: valide ? "conserves" : "ignores", erreur: raisonCourte(e) };
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

  // L'`update` ci-dessus vaut aussi pour une ligne héritée : un succès la
  // remplace par le vrai texte, sans qu'aucune suppression soit nécessaire.
  return { donnees: "generes" };
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
