import { db } from "@/db/client";
import { sessionIncidents, sessionLogs } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { musclesDeLaZone, type Muscle } from "@/lib/referentiels/muscles";
import { libelleMuscle } from "@/lib/referentiels/libelles";
import { regionsSignalees, zonesDesRegions } from "@/lib/referentiels/anatomie";
import {
  construireContexteDouleur, decisionDepuis, propositionsDepuis,
  type ContexteDouleur, type MomentDouleur, type PropositionPersistee,
} from "@/lib/engine/incident-douleur";
import { effetSurLEntrainement } from "@/lib/engine/contraintes";
import { contraintesActives, creerContrainte, verdictSignalement } from "./contraintes";

/**
 * La chaîne complète d'une gêne : la consigner, en tirer une suite, la ménager.
 *
 * Elle existait en deux moitiés qui ne se touchaient pas. L'écran écrivait un
 * incident ; `verdictSignalement` savait dire si une gêne mérite plus qu'un
 * incident ; `creerContrainte` savait écrire l'état. Aucune ligne de code ne
 * reliait les trois — `verdictSignalement` et `creerContrainte` n'avaient, à
 * l'audit, aucun appelant applicatif du tout.
 *
 * Ce service est le maillon. Il ne réécrit aucune règle : il appelle celles qui
 * existent, dans l'ordre du parcours réel.
 *
 * CE QU'IL NE FAIT PAS
 *
 * Il ne crée jamais de contrainte au moment du signalement. `signalerDouleur`
 * écrit l'incident et rend des PROPOSITIONS ; `deciderProtection` est un second
 * appel, déclenché par un « Oui » explicite. Les deux sont séparés exprès :
 * tant qu'ils le sont, aucun chemin ne peut créer une contrainte sans qu'une
 * personne l'ait demandée.
 *
 * OÙ VIT L'AUTORITÉ
 *
 * Dans le CLICHÉ persisté avec l'incident, jamais dans la requête de
 * confirmation. Le client n'envoie qu'un identifiant d'incident et un verbe ;
 * il ne peut désigner ni zone, ni muscle, ni sévérité. Voir
 * `PropositionPersistee` pour ce que ce choix évite.
 */

export class SeanceIntrouvable extends Error {
  constructor() {
    super("Séance introuvable");
    this.name = "SeanceIntrouvable";
  }
}

export class IncidentIntrouvable extends Error {
  constructor() {
    super("Ce signalement est introuvable.");
    this.name = "IncidentIntrouvable";
  }
}

const aujourdhui = () => new Date().toISOString().slice(0, 10);

/**
 * Ce qu'on propose de ménager, zone par zone.
 *
 * L'ARBITRAGE, parce qu'il n'est pas neutre : l'unité du moteur de contraintes
 * est le MUSCLE — `contraintes.muscle` en porte un seul — alors qu'une zone en
 * désigne parfois deux. « Genou » vaut `quadriceps` et `ischios`.
 *
 * Trois options se présentaient :
 *
 *   une contrainte sur un seul muscle    laisserait l'autre exposé alors que
 *                                        l'athlète croit son genou ménagé.
 *   une case à cocher par muscle         transformerait un signalement de
 *                                        trois gestes en formulaire.
 *   une proposition par ZONE, écrivant   retenu.
 *   une contrainte par muscle PROPOSÉ
 *
 * « Par muscle PROPOSÉ », et c'est tout le sujet : `muscles` ne contient que
 * ceux dont la règle a réellement dit `proposer_contrainte`. Un muscle de la
 * zone déjà couvert par une contrainte active en est absent, et le restera à la
 * confirmation.
 *
 * Le prix de ce choix — un « Oui » peut écrire deux lignes — est payé en le
 * DISANT : la proposition nomme les muscles retenus en toutes lettres et
 * affiche `effetSurLEntrainement`, c'est-à-dire ce que l'application fera
 * exactement.
 */
export interface PropositionProtection {
  zone: string;
  /** Le sous-ensemble retenu. Le même que celui persisté avec l'incident. */
  muscles: Muscle[];
  /** « Épaules et Arrière d'épaule », pour la phrase de confirmation. */
  libelleMuscles: string;
  /** Issue de la règle existante : la plus forte des sévérités observées. */
  severite: number;
  motif: string;
  /** Ce que l'application fera, mot pour mot. Aucune promesse sur le corps. */
  effets: string[];
}

export interface ResultatSignalement {
  incidentId: string;
  propositions: PropositionProtection[];
}

/** « A, B et C » — la phrase se lit, la liste séparée par des virgules non. */
function enumerer(valeurs: string[]): string {
  if (valeurs.length <= 1) return valeurs[0] ?? "";
  return `${valeurs.slice(0, -1).join(", ")} et ${valeurs[valeurs.length - 1]}`;
}

/** Du cliché persisté à ce que l'écran montre. Une seule traduction, ici. */
function pourAffichage(p: PropositionPersistee): PropositionProtection {
  return {
    zone: p.zone,
    muscles: p.muscles,
    libelleMuscles: enumerer(p.muscles.map(libelleMuscle)),
    severite: p.severite,
    motif: p.motif,
    effets: effetSurLEntrainement(p.severite, "entree"),
  };
}

async function seanceDuCompte(userId: string, sessionLogId: string) {
  const seance = await db.query.sessionLogs.findFirst({
    where: and(eq(sessionLogs.id, sessionLogId), eq(sessionLogs.userId, userId)),
    columns: { id: true, date: true },
  });
  if (!seance) throw new SeanceIntrouvable();
  return seance;
}

/**
 * Consigne une gêne, puis demande à la règle ce qu'il faut en faire.
 *
 * L'ORDRE EST UN INVARIANT, et il se trompe facilement.
 *
 * La règle est évaluée AVANT que l'incident soit écrit. `suiteASignalement`
 * additionne les signalements ANTÉRIEURS et le signalement COURANT, qu'elle
 * reçoit à part. Écrire d'abord ferait relire le signalement du jour parmi les
 * antérieurs : une première gêne à 5/10, jamais ressentie auparavant, compterait
 * pour deux et déclencherait une proposition de récurrence qui n'a pas eu lieu.
 *
 * L'incident est donc écrit ensuite, et il l'est même quand la règle ne propose
 * rien — c'est la trace qui permettra à la prochaine gêne d'être une deuxième.
 * Ce qu'elle a décidé part avec lui : c'est ce cliché, et lui seul, que la
 * confirmation relira.
 */
export async function signalerDouleur(entrees: {
  userId: string;
  sessionLogId: string;
  /** Identifiants de régions du mannequin. Les inconnus sont ignorés. */
  regions: string[];
  niveau: number;
  typeDouleur: string;
  moment?: MomentDouleur | null;
  arretConseille: boolean;
  aRetirer: string[];
  aAlleger: string[];
  decision: string;
}): Promise<ResultatSignalement> {
  const { userId, sessionLogId } = entrees;
  const seance = await seanceDuCompte(userId, sessionLogId);

  const zones = zonesDesRegions(entrees.regions);
  const niveau = Math.round(entrees.niveau);
  const propositions = await propositionsPourZones(userId, zones, niveau, seance.date);

  const contexte = construireContexteDouleur({
    zones,
    regions: regionsSignalees(entrees.regions),
    niveau,
    typeDouleur: entrees.typeDouleur,
    moment: entrees.moment ?? null,
    arretConseille: entrees.arretConseille,
    aRetirer: entrees.aRetirer,
    aAlleger: entrees.aAlleger,
    propositions,
  });

  const [incident] = await db.insert(sessionIncidents).values({
    sessionLogId,
    type: "douleur",
    contexte,
    decision: entrees.decision,
  }).returning({ id: sessionIncidents.id });

  return { incidentId: incident!.id, propositions: propositions.map(pourAffichage) };
}

/**
 * Ce que la règle dit de chaque zone signalée.
 *
 * Un appel de `verdictSignalement` par muscle canonique : c'est elle qui sait
 * lire l'historique, comparer sur la fenêtre de répétition et écarter un muscle
 * déjà couvert. Aucun seuil n'est recopié ici — ni l'intensité qui déclenche,
 * ni la fenêtre, ni le nombre de signalements.
 *
 * Une zone ne devient une proposition que si AU MOINS un de ses muscles la
 * mérite, et seuls ceux-là entrent dans `muscles`.
 */
async function propositionsPourZones(
  userId: string,
  zones: string[],
  intensite: number,
  dateISO: string,
): Promise<PropositionPersistee[]> {
  const propositions: PropositionPersistee[] = [];

  for (const zone of zones) {
    const aProteger: Muscle[] = [];
    let severite = 0;
    let motif = "";

    for (const muscle of musclesDeLaZone(zone)) {
      const verdict = await verdictSignalement(userId, { muscle, intensite, dateISO }, dateISO);
      if (verdict.suite !== "proposer_contrainte") continue;
      aProteger.push(muscle);
      if (verdict.severite > severite) {
        severite = verdict.severite;
        motif = verdict.motif;
      }
    }

    if (aProteger.length === 0) continue;
    propositions.push({ zone, muscles: aProteger, severite, motif });
  }

  return propositions;
}

// ---------------------------------------------------------------------------
// La confirmation
// ---------------------------------------------------------------------------

export type Decision = "appliquer" | "refuser";

export interface ResultatProtection {
  decision: "appliquee" | "refusee";
  /** Les muscles réellement ménagés à l'issue de cet appel. */
  muscles: Muscle[];
  /** Vrai quand la décision avait déjà été prise : rien n'a été réécrit. */
  dejaTranchee: boolean;
}

/** L'incident, et la preuve qu'il appartient bien au compte authentifié. */
async function incidentDuCompte(userId: string, incidentId: string) {
  const [ligne] = await db
    .select({
      id: sessionIncidents.id,
      contexte: sessionIncidents.contexte,
      date: sessionLogs.date,
    })
    .from(sessionIncidents)
    // La jointure EST le contrôle d'accès : un incident ne porte pas de
    // `user_id`, c'est sa séance qui en porte un. Sans elle, un identifiant
    // deviné donnerait accès au signalement de quelqu'un d'autre.
    .innerJoin(sessionLogs, eq(sessionLogs.id, sessionIncidents.sessionLogId))
    .where(and(
      eq(sessionIncidents.id, incidentId),
      eq(sessionIncidents.type, "douleur"),
      eq(sessionLogs.userId, userId),
    ))
    .limit(1);

  if (!ligne) throw new IncidentIntrouvable();
  return ligne;
}

/**
 * Applique — ou décline — ce que la règle avait proposé sur CET incident.
 *
 * C'est le seul chemin de l'application vers une contrainte issue d'une gêne.
 *
 * TOUT VIENT DU CLICHÉ. L'appelant ne fournit qu'un identifiant d'incident et
 * un verbe : ni zone, ni muscle, ni sévérité. C'est ce qui corrige le défaut
 * central — la confirmation recalculait `musclesDeLaZone(zone)` et créait une
 * contrainte pour TOUS les muscles de la zone, y compris celui que la règle
 * avait délibérément écarté parce qu'il était déjà couvert.
 *
 * IDEMPOTENCE, à deux niveaux. La décision déjà inscrite fait sortir sans rien
 * réécrire : un renvoi réseau ou un double appui ne produit pas de seconde
 * ligne. Et même sans elle, un muscle déjà sous contrainte active est sauté —
 * ce qui protège aussi le cas où la contrainte est venue d'ailleurs entre-temps.
 */
export async function deciderProtection(entrees: {
  userId: string;
  incidentId: string;
  decision: Decision;
}): Promise<ResultatProtection> {
  const { userId, incidentId } = entrees;
  const incident = await incidentDuCompte(userId, incidentId);

  const dejaPrise = decisionDepuis(incident.contexte);
  if (dejaPrise) {
    return { decision: dejaPrise.decision, muscles: [], dejaTranchee: true };
  }

  const propositions = propositionsDepuis(incident.contexte);
  const date = aujourdhui();

  const menages: Muscle[] = [];
  if (entrees.decision === "appliquer") {
    const actives = await contraintesActives(userId, db, date);
    const dejaCouverts = new Set(actives.map((c) => c.muscle));

    for (const p of propositions) {
      for (const muscle of p.muscles) {
        if (dejaCouverts.has(muscle)) continue;
        await creerContrainte({
          userId,
          muscle,
          severite: p.severite,
          // Une gêne signalée en séance est une douleur, pas une zone sensible
          // déclarée à froid ni une blessure diagnostiquée.
          type: "douleur",
          origine: "athlete",
          notes: `Gêne signalée en séance — ${p.zone}.`,
          // Jamais durable : une gêne de séance doit être reposée en question.
        }, date);
        dejaCouverts.add(muscle);
        menages.push(muscle);
      }
    }
  }

  const decision = entrees.decision === "appliquer" ? "appliquee" as const : "refusee" as const;
  await marquerDecision(incidentId, incident.contexte, { decision, le: date });

  return { decision, muscles: menages, dejaTranchee: false };
}

/**
 * Inscrit la décision dans le contexte, sans toucher au reste.
 *
 * Une fusion plutôt qu'une réécriture : le contexte porte le signalement
 * lui-même — zones, intensité, moment — et c'est de lui que la détection de
 * récurrence se nourrit. L'écraser pour y noter un « Oui » effacerait
 * l'historique que tout ce lot sert à rendre lisible.
 */
async function marquerDecision(
  incidentId: string,
  contexte: unknown,
  protection: { decision: "appliquee" | "refusee"; le: string },
) {
  const existant = (contexte ?? {}) as Partial<ContexteDouleur>;
  await db.update(sessionIncidents)
    .set({ contexte: { ...existant, protection } as ContexteDouleur })
    .where(eq(sessionIncidents.id, incidentId));
}

// ---------------------------------------------------------------------------
// Ce qui attend encore une réponse
// ---------------------------------------------------------------------------

export interface PropositionEnAttente {
  incidentId: string;
  date: string;
  propositions: PropositionProtection[];
}

/**
 * Les propositions qu'aucune réponse n'a encore tranchées.
 *
 * Elles existent parce qu'une proposition ne peut PAS toujours être montrée sur
 * le moment : appuyer sur « Arrêter la séance » navigue immédiatement, et rien
 * ne doit retarder cet arrêt. La proposition survit alors dans l'incident, et
 * se représente ici — sur l'écran des contraintes, qui est durable et dont
 * c'est précisément le sujet.
 *
 * Un incident dont tous les muscles proposés sont déjà couverts n'apparaît pas :
 * la question ne se pose plus, et l'afficher inviterait à confirmer quelque
 * chose qui ne créerait rien.
 */
export async function propositionsEnAttente(userId: string): Promise<PropositionEnAttente[]> {
  const lignes = await db
    .select({
      id: sessionIncidents.id,
      contexte: sessionIncidents.contexte,
      date: sessionLogs.date,
    })
    .from(sessionIncidents)
    .innerJoin(sessionLogs, eq(sessionLogs.id, sessionIncidents.sessionLogId))
    .where(and(
      eq(sessionLogs.userId, userId),
      isNull(sessionLogs.archiveLe),
      eq(sessionIncidents.type, "douleur"),
    ))
    .orderBy(desc(sessionLogs.date), desc(sessionIncidents.createdAt))
    .limit(30);

  const actives = await contraintesActives(userId);
  const couverts = new Set(actives.map((c) => c.muscle));

  return lignes.flatMap((l) => {
    if (decisionDepuis(l.contexte)) return [];
    const restantes = propositionsDepuis(l.contexte)
      .map((p) => ({ ...p, muscles: p.muscles.filter((m) => !couverts.has(m)) }))
      .filter((p) => p.muscles.length > 0);
    if (restantes.length === 0) return [];
    return [{
      incidentId: l.id,
      date: l.date,
      propositions: restantes.map(pourAffichage),
    }];
  });
}
