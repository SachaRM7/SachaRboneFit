import { db } from "@/db/client";
import { sessionIncidents, sessionLogs } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { musclesDeLaZone, type Muscle } from "@/lib/referentiels/muscles";
import { libelleMuscle } from "@/lib/referentiels/libelles";
import { ZONES_DOULEUR } from "@/lib/referentiels/muscles";
import { regionsSignalees, zonesDesRegions } from "@/lib/referentiels/anatomie";
import {
  construireContexteDouleur, type MomentDouleur,
} from "@/lib/engine/incident-douleur";
import { SEVERITE, effetSurLEntrainement } from "@/lib/engine/contraintes";
import { creerContrainte, verdictSignalement } from "./contraintes";

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
 * écrit l'incident et rend des PROPOSITIONS ; `protegerZones` est un second
 * appel, déclenché par un « Oui » explicite. Les deux sont séparés exprès :
 * tant qu'ils le sont, aucun chemin ne peut créer une contrainte sans qu'une
 * personne l'ait demandée.
 */

export class SeanceIntrouvable extends Error {
  constructor() {
    super("Séance introuvable");
    this.name = "SeanceIntrouvable";
  }
}

export class ZoneInconnue extends Error {
  constructor(readonly zone: string) {
    super("Cette zone n'existe pas dans le référentiel.");
    this.name = "ZoneInconnue";
  }
}

const ZONES_CONNUES = new Set<string>(ZONES_DOULEUR.map((z) => z.zone));

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
 *   une contrainte par muscle
 *
 * Le prix de ce choix est qu'un « Oui » peut écrire deux lignes. Il est payé en
 * le DISANT : la proposition nomme les muscles en toutes lettres et affiche
 * `effetSurLEntrainement`, c'est-à-dire ce que l'application fera exactement.
 * Rien n'est écrit avant que cet écran ait été lu et confirmé.
 */
export interface PropositionProtection {
  zone: string;
  /** Muscles canoniques qui recevront chacun une contrainte. */
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
  const contexte = construireContexteDouleur({
    zones,
    regions: regionsSignalees(entrees.regions),
    niveau: entrees.niveau,
    typeDouleur: entrees.typeDouleur,
    moment: entrees.moment ?? null,
    arretConseille: entrees.arretConseille,
    aRetirer: entrees.aRetirer,
    aAlleger: entrees.aAlleger,
  });

  const propositions = await propositionsPourZones(
    userId, zones, contexte.intensite, seance.date,
  );

  const [incident] = await db.insert(sessionIncidents).values({
    sessionLogId,
    type: "douleur",
    contexte,
    decision: entrees.decision,
  }).returning({ id: sessionIncidents.id });

  return { incidentId: incident!.id, propositions };
}

/**
 * Ce que la règle dit de chaque zone signalée.
 *
 * Un appel de `verdictSignalement` par muscle canonique : c'est elle qui sait
 * lire l'historique, comparer sur la fenêtre de répétition et écarter une zone
 * déjà couverte. Aucun seuil n'est recopié ici — ni l'intensité qui déclenche,
 * ni la fenêtre, ni le nombre de signalements. Une zone ne devient une
 * proposition que si AU MOINS un de ses muscles la mérite ; les muscles déjà
 * couverts par une contrainte active en sont retirés.
 */
async function propositionsPourZones(
  userId: string,
  zones: string[],
  intensite: number,
  dateISO: string,
): Promise<PropositionProtection[]> {
  const propositions: PropositionProtection[] = [];

  for (const zone of zones) {
    const muscles = musclesDeLaZone(zone);
    const aProteger: Muscle[] = [];
    let severite = 0;
    let motif = "";

    for (const muscle of muscles) {
      const verdict = await verdictSignalement(userId, { muscle, intensite, dateISO }, dateISO);
      if (verdict.suite !== "proposer_contrainte") continue;
      aProteger.push(muscle);
      if (verdict.severite > severite) {
        severite = verdict.severite;
        motif = verdict.motif;
      }
    }

    if (aProteger.length === 0) continue;
    propositions.push({
      zone,
      muscles: aProteger,
      libelleMuscles: enumerer(aProteger.map(libelleMuscle)),
      severite,
      motif,
      effets: effetSurLEntrainement(severite, "entree"),
    });
  }

  return propositions;
}

/** « A, B et C » — la phrase se lit, la liste séparée par des virgules non. */
function enumerer(valeurs: string[]): string {
  if (valeurs.length <= 1) return valeurs[0] ?? "";
  return `${valeurs.slice(0, -1).join(", ")} et ${valeurs[valeurs.length - 1]}`;
}

export interface Protection {
  zone: string;
  muscles: Muscle[];
  severite: number;
}

/**
 * Crée les contraintes demandées — et seulement après un « Oui ».
 *
 * `userId` vient de la session serveur, jamais du corps de la requête : c'est
 * la route qui le fournit, et rien dans les paramètres ne permet d'en désigner
 * un autre.
 *
 * Une zone dont un muscle porte déjà une contrainte active n'aurait pas été
 * proposée ; si elle l'est quand même — un second onglet, une confirmation
 * tardive — `verdictSignalement` l'aura écartée en amont et le muscle n'est
 * pas dans la liste. Le pire cas reste une seconde ligne datée, jamais une
 * exclusion silencieuse.
 */
export async function protegerZones(entrees: {
  userId: string;
  zones: Array<{ zone: string; severite: number }>;
  /** L'incident d'où vient la demande : il donne la note de la contrainte. */
  note?: string | null;
}): Promise<Protection[]> {
  const faites: Protection[] = [];

  for (const { zone, severite } of entrees.zones) {
    if (!ZONES_CONNUES.has(zone)) throw new ZoneInconnue(zone);
    const muscles = musclesDeLaZone(zone);
    for (const muscle of muscles) {
      await creerContrainte({
        userId: entrees.userId,
        muscle,
        // Bornée par la règle existante, pas par un seuil inventé ici.
        severite: Math.min(SEVERITE.maximum, Math.max(SEVERITE.minimum, severite)),
        // Une gêne signalée en séance est une douleur, pas une zone sensible
        // déclarée à froid ni une blessure diagnostiquée.
        type: "douleur",
        origine: "athlete",
        notes: entrees.note ?? `Gêne signalée en séance — ${zone}.`,
        // Jamais durable : une gêne de séance doit être reposée en question.
        // Seule une limitation déclarée comme telle en est dispensée.
      });
    }
    faites.push({ zone, muscles, severite });
  }

  return faites;
}
