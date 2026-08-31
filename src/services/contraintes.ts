import { db } from "@/db/client";
import { contraintes, sessionIncidents, sessionLogs } from "@/db/schema";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import type { Lecteur } from "@/db/lecteur";
import { versMuscle } from "@/lib/referentiels/muscles";
import { libelleMuscle } from "@/lib/referentiels/libelles";
import {
  REEVALUATION_JOURS, SEVERITE, aReevaluer, decalerDe, effetSurLEntrainement,
  estActive, reevaluer, suiteASignalement,
  type ContrainteLue, type Reponse, type Signalement, type SuiteASignalement,
} from "@/lib/engine/contraintes";

/**
 * Les contraintes physiques, lues et écrites en un seul endroit.
 *
 * Elles étaient créées par l'onboarding, lues par quatre moteurs avec deux
 * définitions différentes de « active », et jamais terminées. Ce service est
 * la porte unique : le moteur ne lit plus la table directement, et rien
 * n'entre ni ne sort sans passer par ici.
 */

export class ContrainteIntrouvable extends Error {
  constructor() {
    super("Cette contrainte est introuvable.");
    this.name = "ContrainteIntrouvable";
  }
}

const aujourdhui = () => new Date().toISOString().slice(0, 10);

function versLue(ligne: typeof contraintes.$inferSelect): ContrainteLue {
  return {
    id: ligne.id,
    muscle: ligne.muscle,
    type: ligne.type,
    severite: ligne.severite,
    dateDebut: ligne.dateDebut,
    dateFin: ligne.dateFin,
    aReevaluerLe: ligne.aReevaluerLe,
    notes: ligne.notes,
  };
}

/**
 * Les contraintes qui s'appliquent aujourd'hui.
 *
 * Une seule requête pour tout le monde. Le filtre en SQL reprend exactement la
 * définition de `estActive` : nulle, ou postérieure ou égale à aujourd'hui.
 * Les quatre lectures précédentes n'étaient pas d'accord entre elles.
 */
export async function contraintesActives(
  userId: string,
  executeur: Lecteur = db,
  date = aujourdhui(),
): Promise<ContrainteLue[]> {
  const lignes = await executeur.query.contraintes.findMany({
    where: and(
      eq(contraintes.userId, userId),
      // Borne exclue, comme `estActive` : une contrainte levée aujourd'hui ne
      // s'applique plus aujourd'hui.
      or(isNull(contraintes.dateFin), gt(contraintes.dateFin, date)),
    ),
    orderBy: [desc(contraintes.severite), desc(contraintes.dateDebut)],
  });
  return lignes.map(versLue);
}

/** Tout l'historique, actives comprises : l'écran des contraintes passées. */
export async function toutesLesContraintes(userId: string): Promise<ContrainteLue[]> {
  const lignes = await db.query.contraintes.findMany({
    where: eq(contraintes.userId, userId),
    orderBy: [desc(contraintes.dateDebut)],
  });
  return lignes.map(versLue);
}

/** Celles dont l'échéance de réévaluation est atteinte. */
export async function contraintesAReevaluer(
  userId: string,
  date = aujourdhui(),
): Promise<ContrainteLue[]> {
  const actives = await contraintesActives(userId, db, date);
  return actives.filter((c) => aReevaluer(c, date));
}

// ---------------------------------------------------------------------------
// Entrée
// ---------------------------------------------------------------------------

/**
 * Ce qu'il faut faire d'une gêne qu'on vient de signaler.
 *
 * Ne crée rien. Elle rassemble ce que le moteur a besoin de savoir — les
 * signalements antérieurs sur la même zone, et si une contrainte couvre déjà
 * cette zone — puis laisse la règle décider. C'est délibéré : la plupart des
 * gênes ne donnent qu'un incident, et transformer chaque douleur en état du
 * programme serait exactement le défaut qu'on corrige.
 */
export async function verdictSignalement(
  userId: string,
  signalement: Signalement,
  date = aujourdhui(),
): Promise<SuiteASignalement> {
  const muscle = versMuscle(signalement.muscle);
  if (!muscle) {
    return { suite: "incident_seul", motif: "Zone inconnue du référentiel." };
  }

  const actives = await contraintesActives(userId, db, date);

  // Les gênes déjà consignées sur cette zone : c'est la répétition qui compte,
  // pas l'intensité d'un jour.
  const passees = await db
    .select({
      date: sessionLogs.date,
      contexte: sessionIncidents.contexte,
    })
    .from(sessionIncidents)
    .innerJoin(sessionLogs, eq(sessionLogs.id, sessionIncidents.sessionLogId))
    .where(
      and(
        eq(sessionLogs.userId, userId),
        isNull(sessionLogs.archiveLe),
        eq(sessionIncidents.type, "douleur"),
      ),
    )
    .orderBy(desc(sessionLogs.date))
    .limit(50);

  const anterieurs: Signalement[] = passees.flatMap((p) => {
    const ctx = (p.contexte ?? {}) as { muscle?: unknown; intensite?: unknown };
    const m = typeof ctx.muscle === "string" ? versMuscle(ctx.muscle) : null;
    const i = Number(ctx.intensite);
    if (!m || !Number.isFinite(i)) return [];
    return [{ muscle: m, intensite: i, dateISO: p.date }];
  });

  return suiteASignalement({
    signalement: { ...signalement, muscle },
    anterieurs,
    contrainteActive: actives.some((c) => c.muscle === muscle),
  });
}

export interface CreationContrainte {
  userId: string;
  muscle: string;
  severite: number;
  type?: "zone_sensible" | "douleur" | "blessure";
  notes?: string | null;
  origine?: "onboarding" | "athlete" | "coach";
  /**
   * Limitation que l'athlète sait durable : on ne le relancera pas.
   *
   * C'est le seul chemin qui produit une contrainte sans échéance, et il
   * demande une déclaration explicite. Une gêne signalée en séance n'y arrive
   * jamais toute seule.
   */
  durable?: boolean;
}

export async function creerContrainte(
  donnees: CreationContrainte,
  date = aujourdhui(),
): Promise<ContrainteLue> {
  const muscle = versMuscle(donnees.muscle);
  if (!muscle) throw new ContrainteIntrouvable();

  const severite = Math.min(
    SEVERITE.maximum,
    Math.max(SEVERITE.minimum, Math.round(donnees.severite)),
  );

  const [ligne] = await db
    .insert(contraintes)
    .values({
      userId: donnees.userId,
      muscle,
      type: donnees.type ?? "zone_sensible",
      severite,
      notes: donnees.notes ?? null,
      dateDebut: date,
      dateFin: null,
      // Une contrainte temporaire porte toujours une échéance : c'est ce qui
      // garantit qu'on redemandera. Seule une limitation déclarée durable en
      // est dispensée.
      aReevaluerLe: donnees.durable ? null : decalerDe(date, REEVALUATION_JOURS),
      origine: donnees.origine ?? "athlete",
    })
    .returning();

  if (!ligne) throw new Error("Création de la contrainte impossible");
  return versLue(ligne);
}

// ---------------------------------------------------------------------------
// Sortie
// ---------------------------------------------------------------------------

/** Relit une contrainte après avoir vérifié qu'elle appartient bien à l'appelant. */
async function sienne(userId: string, id: string) {
  const ligne = await db.query.contraintes.findFirst({
    where: and(eq(contraintes.id, id), eq(contraintes.userId, userId)),
  });
  if (!ligne) throw new ContrainteIntrouvable();
  return ligne;
}

export interface ResultatReevaluation {
  contrainte: ContrainteLue;
  resume: string;
  effets: string[];
  levee: boolean;
}

/**
 * Applique la réponse de l'athlète à « est-ce toujours le cas ? ».
 *
 * Sert aussi bien à la relance programmée qu'à une résolution anticipée : dire
 * « ça va mieux » un mardi n'a pas à attendre l'échéance.
 */
export async function repondreAReevaluation(
  userId: string,
  id: string,
  reponse: Reponse,
  date = aujourdhui(),
): Promise<ResultatReevaluation> {
  const ligne = await sienne(userId, id);
  const lue = versLue(ligne);
  if (!estActive(lue, date)) throw new ContrainteIntrouvable();

  const transition = reevaluer(lue, reponse, date);

  const [maj] = await db
    .update(contraintes)
    .set({
      severite: transition.severite,
      dateFin: transition.dateFin,
      aReevaluerLe: transition.aReevaluerLe,
      updatedAt: new Date(),
    })
    .where(eq(contraintes.id, id))
    .returning();

  const apres = versLue(maj!);
  return {
    contrainte: apres,
    resume: transition.resume,
    // L'historique reste : la ligne est datée, jamais supprimée.
    effets: effetSurLEntrainement(lue.severite, transition.dateFin ? "sortie" : "entree"),
    levee: transition.dateFin !== null,
  };
}

/** Ce que l'écran des réglages affiche, prêt à lire. */
export interface ContrainteAffichee extends ContrainteLue {
  libelle: string;
  active: boolean;
  aReevaluerMaintenant: boolean;
  effets: string[];
}

export async function contraintesPourAffichage(
  userId: string,
  date = aujourdhui(),
): Promise<{ actives: ContrainteAffichee[]; passees: ContrainteAffichee[] }> {
  const toutes = await toutesLesContraintes(userId);
  const enrichie = (c: ContrainteLue): ContrainteAffichee => ({
    ...c,
    libelle: libelleMuscle(c.muscle),
    active: estActive(c, date),
    aReevaluerMaintenant: aReevaluer(c, date),
    effets: effetSurLEntrainement(c.severite, "entree"),
  });

  return {
    actives: toutes.filter((c) => estActive(c, date)).map(enrichie),
    passees: toutes.filter((c) => !estActive(c, date)).map(enrichie),
  };
}
