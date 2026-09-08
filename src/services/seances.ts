import { db } from "@/db/client";
import {
  exerciseInstances, programmeBlocs, seanceTemplates,
  sessionIncidents, sessionLogs, sessionPlanItems, setLogs, setLogRevisions,
} from "@/db/schema";
import { and, desc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import type { SessionLog } from "@/db/schema";
import { estUneSeanceRealisee } from "@/db/archivage";
import {
  effortRequisPour, LIBELLES_MOTIF_INVALIDE, motifSerieInvalide,
  type MotifSerieInvalide,
} from "@/lib/engine/serie-realisee";
import { feuDeTendance } from "./progression";

/**
 * Couche service des seances.
 *
 * Auparavant, l'orchestration vivait dans un composant client : chaque seance
 * creait DEUX lignes session_logs — une au demarrage portant le contexte
 * (feu du jour, ajustement de volume, etat du jour) mais aucune serie, et une
 * a la fin portant les series mais aucun contexte. L'historique etait donc faux
 * des la premiere seance.
 *
 * Le cycle est desormais : creerSeance() au demarrage, puis terminerSeance()
 * qui complete LA MEME ligne et insere les series dans une transaction.
 */

export interface SerieASauver {
  exerciseInstanceId: string;
  numeroSerie: number;
  repsEffectuees: number;
  charge: number;
  rpeEffectif?: number | null;
  tempoRespecte?: boolean | null;
  reposReelSecondes?: number | null;
  notes?: string | null;
}

export interface CreationSeance {
  userId: string;
  date: string;
  seanceTemplateId?: string | null;
  gymId?: string | null;
  dailyStateId?: string | null;
  feuBiologiqueJour?: string | null;
  volumeAjustePct?: number | null;
  volumeAjusteRaison?: string | null;
}

/**
 * Démarre une séance, ou reprend celle qui est déjà ouverte.
 *
 * La création était inconditionnelle, et appelée depuis un effet du client.
 * Un rafraîchissement, un retour arrière, un double appui, une reconnexion
 * après un échec réseau : chacun produisait une ligne de plus. Ces séances
 * vides ne se voient nulle part — mais elles comptaient comme des séances
 * faites dans la vue du programme, et faisaient avancer la rotation.
 *
 * Reprendre plutôt que recréer se décide ici, côté serveur, parce que c'est le
 * seul endroit qui voit toutes les tentatives. « Déjà ouverte » veut dire : le
 * même jour, la même séance du programme, pas encore clôturée.
 */
export async function creerSeance(donnees: CreationSeance): Promise<SessionLog> {
  const ouverte = await db.query.sessionLogs.findFirst({
    where: and(
      eq(sessionLogs.userId, donnees.userId),
      eq(sessionLogs.date, donnees.date),
      isNull(sessionLogs.archiveLe),
      isNull(sessionLogs.dureeMinutes),
      donnees.seanceTemplateId
        ? eq(sessionLogs.seanceTemplateId, donnees.seanceTemplateId)
        : isNull(sessionLogs.seanceTemplateId),
    ),
    orderBy: [desc(sessionLogs.createdAt)],
  });
  if (ouverte) return ouverte;

  const [seance] = await db
    .insert(sessionLogs)
    .values({
      userId: donnees.userId,
      date: donnees.date,
      seanceTemplateId: donnees.seanceTemplateId ?? null,
      gymId: donnees.gymId ?? null,
      dailyStateId: donnees.dailyStateId ?? null,
      feuBiologiqueJour: donnees.feuBiologiqueJour ?? null,
      volumeAjustePct: donnees.volumeAjustePct ?? null,
      volumeAjusteRaison: donnees.volumeAjusteRaison ?? null,
    })
    .returning();

  if (!seance) throw new Error("Creation de la seance impossible");
  return seance;
}

/**
 * Une séance est terminée quand elle porte une durée.
 *
 * Définition unique, parce qu'elle était inférée différemment selon l'écran.
 * `seanceCourante` et l'adaptation de lieu lisent `duree_minutes` ; la rotation
 * des séances et la vue du programme, elles, considéraient qu'une LIGNE
 * `session_logs` suffisait à dire qu'une séance avait eu lieu. Une séance
 * ouverte puis abandonnée était donc « en cours » pour les uns et « faite »
 * pour les autres.
 *
 * Le modèle n'a pas de colonne d'état : `duree_minutes` en tient lieu, et c'est
 * une inférence assumée — la clôture est le seul moment qui l'écrit. Une
 * colonne explicite serait plus honnête ; elle est notée en dette.
 */
/**
 * Qui s'est réellement entraîné depuis cette date.
 *
 * Le précalcul de la séance du jour lisait `session_logs` sans filtre pour
 * décider qui traiter : une séance archivée suffisait à rendre quelqu'un
 * « actif » pendant quatorze jours, et donc à lui faire calculer chaque nuit
 * une séance qu'il n'a pas demandée. Le tort est mince — du travail inutile,
 * pas un chiffre faux —, mais la règle est la même partout : une séance retirée
 * du calcul ne décide plus de rien.
 *
 * Extraite de la route pour être vérifiable seule : le reste du cron appelle un
 * modèle, ce qui n'a pas sa place dans un test de cette propriété.
 */
export async function utilisateursActifsDepuis(depuisISO: string): Promise<string[]> {
  const seances = await db.query.sessionLogs.findMany({
    where: and(gte(sessionLogs.date, depuisISO), estUneSeanceRealisee()),
    columns: { userId: true },
  });
  return [...new Set(seances.map((s) => s.userId))];
}

export function estTerminee(seance: { dureeMinutes: number | null }): boolean {
  return seance.dureeMinutes !== null;
}

/**
 * La séance en cours, résolue côté serveur.
 *
 * Trois outils du coach recevaient `sessionLogId` du modèle. Un identifiant
 * fourni par un modèle est au mieux recopié d'un résultat précédent, au pire
 * inventé — et une écriture sur la mauvaise séance ne lève aucune erreur : elle
 * range une donnée juste au mauvais endroit, où personne ne la cherchera.
 *
 * « En cours » veut dire : d'aujourd'hui, non archivée, pas encore clôturée.
 * `dureeMinutes` est ce que la clôture renseigne — c'est donc lui qui distingue
 * une séance ouverte d'une séance finie.
 */
export async function seanceCourante(
  userId: string,
  aujourdhui = new Date().toISOString().slice(0, 10),
): Promise<SessionLog | null> {
  const seance = await db.query.sessionLogs.findFirst({
    where: and(
      eq(sessionLogs.userId, userId),
      eq(sessionLogs.date, aujourdhui),
      isNull(sessionLogs.archiveLe),
      isNull(sessionLogs.dureeMinutes),
    ),
    orderBy: [desc(sessionLogs.createdAt)],
  });
  return seance ?? null;
}

export interface CloturSeance {
  userId: string;
  sessionLogId: string;
  dureeMinutes?: number | null;
  /** Echelle 1-10, identique a daily_states.energieDepart. */
  energieFin?: number | null;
  notesSeance?: string | null;
  feuBiologiqueTendance?: string | null;
  series: SerieASauver[];
}

/** Erreur metier : la seance n'existe pas ou n'appartient pas a l'utilisateur. */
export class SeanceIntrouvable extends Error {
  constructor() {
    super("Seance introuvable ou non autorisee");
    this.name = "SeanceIntrouvable";
  }
}

/**
 * Erreur métier : clôturer une séance dont aucune série n'a été validée.
 *
 * La clôture écrivait alors `duree_minutes` sur une ligne sans la moindre
 * série, et cette durée passait pour une preuve d'entraînement dans la moitié
 * de l'application. Refuser est plus honnête que d'enregistrer une séance dont
 * personne ne saurait dire ce qu'elle contient : la ligne reste ouverte, donc
 * reprenable, et l'athlète peut soit valider une série, soit l'abandonner.
 */
export class SeanceSansSerie extends Error {
  constructor() {
    super("Une séance ne peut être terminée sans série validée");
    this.name = "SeanceSansSerie";
  }
}

/**
 * Erreur métier : une série reçue n'est pas une série réalisée.
 *
 * Elle porte le numéro et le motif, parce qu'un refus doit dire QUOI corriger.
 * Le client applique déjà la même règle : l'arrivée d'une série invalide ici
 * signale un désaccord entre les deux, pas une saisie ordinaire.
 */
export class SerieInvalide extends Error {
  constructor(readonly numeroSerie: number, readonly motif: MotifSerieInvalide) {
    super(`Série ${numeroSerie} : ${LIBELLES_MOTIF_INVALIDE[motif]}`);
    this.name = "SerieInvalide";
  }
}

/**
 * La phase du cycle dont relève cette séance.
 *
 * Le serveur ne la demande pas au client : c'est elle qui décide si la réserve
 * est obligatoire, et une exigence qu'on peut désactiver depuis le navigateur
 * n'en est pas une.
 */
async function phaseDuCycle(seanceTemplateId: string | null): Promise<string | null> {
  if (!seanceTemplateId) return null;
  const ligne = await db
    .select({ typeCycle: programmeBlocs.typeCycle })
    .from(seanceTemplates)
    .innerJoin(programmeBlocs, eq(programmeBlocs.id, seanceTemplates.blocId))
    .where(eq(seanceTemplates.id, seanceTemplateId))
    .limit(1);
  return ligne[0]?.typeCycle ?? null;
}

export async function terminerSeance(donnees: CloturSeance): Promise<SessionLog> {
  const existante = await db.query.sessionLogs.findFirst({
    where: and(
      eq(sessionLogs.id, donnees.sessionLogId),
      eq(sessionLogs.userId, donnees.userId),
      // Une séance retirée du calcul ne se re-clôture pas : la rouvrir en
      // écriture reviendrait à la faire réapparaître par une autre porte.
      isNull(sessionLogs.archiveLe),
    ),
  });
  if (!existante) throw new SeanceIntrouvable();

  /**
   * Ce qui a réellement eu lieu — et un refus explicite pour le reste.
   *
   * Le filtre ne demandait que « ni l'un ni l'autre n'est `null` ». Zéro n'est
   * pas `null` : une série à 0 répétition et 0 kilo entrait en base, comptait
   * dans le volume et nourrissait la progression.
   *
   * La première correction se contentait d'ÉCARTER ces séries. C'était encore
   * une correction silencieuse : l'écran avait montré une ligne validée, la
   * base n'en gardait rien, et personne n'était prévenu. Une série invalide
   * qui atteint le serveur est maintenant une erreur — le client la refuse
   * déjà, donc son arrivée ici signale un vrai désaccord entre les deux.
   */
  const instancesCitees = [...new Set(donnees.series.map((s) => s.exerciseInstanceId).filter(Boolean))];
  const conventions = instancesCitees.length
    ? await db
        .select({
          id: exerciseInstances.id,
          conventionCharge: exerciseInstances.conventionCharge,
          natureCharge: exerciseInstances.natureCharge,
        })
        .from(exerciseInstances)
        .where(inArray(exerciseInstances.id, instancesCitees))
    : [];
  const conventionParInstance = new Map(conventions.map((c) => [c.id, c]));

  // En calibration, la réserve est LA mesure : c'est elle qui fixera les
  // charges des blocs suivants. Une série de calibration sans effort renseigné
  // ne mesure rien, et le serveur le sait sans avoir à croire le client.
  const exigences = { effortRequis: effortRequisPour(await phaseDuCycle(existante.seanceTemplateId)) };

  const series: SerieASauver[] = [];
  for (const s of donnees.series) {
    if (!s.exerciseInstanceId) continue;
    const motif = motifSerieInvalide(
      s, conventionParInstance.get(s.exerciseInstanceId) ?? {}, exigences,
    );
    if (motif) throw new SerieInvalide(s.numeroSerie, motif);
    series.push(s);
  }

  // Le seul signal durable d'un entraînement est la série. Sans elle, il n'y a
  // rien à clore — et surtout rien qui doive compter comme une séance faite.
  if (series.length === 0) throw new SeanceSansSerie();

  // Transaction : sans elle, un echec sur l'insertion des series laissait une
  // seance close mais vide en base.
  const cloturee = await db.transaction(async (tx) => {
    const [maj] = await tx
      .update(sessionLogs)
      .set({
        dureeMinutes: donnees.dureeMinutes ?? existante.dureeMinutes,
        energieFin: donnees.energieFin ?? existante.energieFin,
        notesSeance: donnees.notesSeance ?? existante.notesSeance,
        feuBiologiqueTendance: donnees.feuBiologiqueTendance ?? existante.feuBiologiqueTendance,
        updatedAt: new Date(),
      })
      .where(eq(sessionLogs.id, donnees.sessionLogId))
      .returning();

    if (!maj) throw new SeanceIntrouvable();

    // Reprise possible d'une seance : on repart d'un jeu de series propre.
    await tx.delete(setLogs).where(eq(setLogs.sessionLogId, donnees.sessionLogId));

    if (series.length > 0) {
      await tx.insert(setLogs).values(
        series.map((s) => ({
          sessionLogId: donnees.sessionLogId,
          exerciseInstanceId: s.exerciseInstanceId,
          numeroSerie: s.numeroSerie,
          repsEffectuees: s.repsEffectuees,
          charge: s.charge,
          rpeEffectif: s.rpeEffectif ?? null,
          tempoRespecte: s.tempoRespecte ?? null,
          // Ces deux colonnes existaient mais n'etaient jamais alimentees :
          // le client les transmettait et l'insertion les ignorait.
          reposReelSecondes: s.reposReelSecondes ?? null,
          notes: s.notes ?? null,
        })),
      );
    }

    return maj;
  });

  // Le feu de tendance est calcule APRES la cloture, quand les series de cette
  // seance sont en base : il portait auparavant sur des donnees appauvries
  // (nom d'exercice litteral "Exercice", feu du jour force a null, ce qui
  // degradait systematiquement le contexte).
  const tendance = await feuDeTendance(donnees.userId);
  if (!tendance) return cloturee;

  const [avecTendance] = await db
    .update(sessionLogs)
    .set({ feuBiologiqueTendance: tendance, updatedAt: new Date() })
    .where(eq(sessionLogs.id, donnees.sessionLogId))
    .returning();

  return avecTendance ?? cloturee;
}

/**
 * Erreur métier : abandonner une séance qui contient déjà des séries.
 *
 * Abandonner efface. Une séance où quelque chose a réellement été fait ne
 * s'efface pas d'un bouton : elle se termine, ou elle reste ouverte.
 */
export class SeanceNonVide extends Error {
  constructor() {
    super("Cette séance contient des séries : termine-la plutôt que de l'abandonner");
    this.name = "SeanceNonVide";
  }
}

/**
 * La séance ouverte de ce compte, s'il y en a une.
 *
 * « Ouverte » veut dire : créée, pas encore clôturée, pas archivée. Il ne
 * devrait jamais y en avoir deux — c'est l'invariant que fait respecter
 * `construireSeanceDuJour`. En cas d'héritage, la plus récente gagne : c'est
 * celle que l'écran de séance porte.
 */
export async function seanceOuverte(userId: string): Promise<SessionLog | null> {
  const seance = await db.query.sessionLogs.findFirst({
    where: and(
      eq(sessionLogs.userId, userId),
      isNull(sessionLogs.archiveLe),
      isNull(sessionLogs.dureeMinutes),
    ),
    orderBy: [desc(sessionLogs.createdAt)],
  });
  return seance ?? null;
}

/**
 * Abandonner une séance commencée.
 *
 * Le bouton du tableau de bord n'appelait que `clear()` — une remise à zéro du
 * store React. La ligne `session_logs` restait ouverte en base : au
 * rechargement suivant, « Séance en cours — 0 séries enregistrées »
 * réapparaissait, et une nouvelle tentative en créait une de plus. C'est ce
 * qui a produit les séances fantômes et le « 4 séances cette semaine ».
 *
 * Ce qui part : la ligne et son plan, qui n'ont jamais rien mesuré. Ce qui ne
 * bouge pas : le gabarit, le bloc, l'inventaire, et toute séance qui porte des
 * séries — la suppression est refusée dans ce cas plutôt que silencieuse.
 */
export async function abandonnerSeance(userId: string, sessionLogId: string): Promise<void> {
  const seance = await db.query.sessionLogs.findFirst({
    where: and(
      eq(sessionLogs.id, sessionLogId),
      eq(sessionLogs.userId, userId),
      isNull(sessionLogs.archiveLe),
    ),
  });
  if (!seance) throw new SeanceIntrouvable();

  const series = await db.query.setLogs.findMany({
    where: eq(setLogs.sessionLogId, sessionLogId),
    columns: { id: true },
  });
  if (series.length > 0) throw new SeanceNonVide();

  await db.transaction(async (tx) => {
    // Le plan cite la séance : il part avec elle, et lui seul. Les lignes de
    // gabarit qu'il référence ne sont pas touchées.
    await tx.delete(sessionPlanItems).where(eq(sessionPlanItems.sessionLogId, sessionLogId));
    await tx.delete(sessionIncidents).where(eq(sessionIncidents.sessionLogId, sessionLogId));
    await tx.delete(sessionLogs).where(eq(sessionLogs.id, sessionLogId));
  });
}

// ---------------------------------------------------------------------------
// Persistance série par série
// ---------------------------------------------------------------------------

/**
 * Une série validée arrive en base TOUT DE SUITE — et non à la clôture.
 *
 * CE QUI SE PASSAIT
 *
 * Le brouillon vivait dans `localStorage`, et rien n'atteignait Postgres avant
 * l'écran de fin. Une séance d'une heure tenait donc entièrement dans le
 * navigateur : un crash de Safari, un onglet fermé par le système sous pression
 * mémoire, un `localStorage` purgé, et l'entraînement n'avait jamais eu lieu.
 * C'est le genre de perte qu'on ne découvre qu'une fois, et qui suffit à ne
 * plus faire confiance à l'application.
 *
 * L'ÉCRITURE EST IDEMPOTENTE, SANS MIGRATION
 *
 * Une série est identifiée par (séance, entrée, numéro) — le même triplet que
 * le brouillon emploie déjà comme clé. On supprime puis on insère, dans une
 * transaction : rejouer l'appel après un échec réseau ne crée pas de doublon,
 * et revalider une série corrigée met à jour la bonne ligne.
 *
 * Pas de contrainte d'unicité ajoutée en base : elle donnerait un `ON CONFLICT`
 * plus élégant, mais imposerait une migration sur une table en service dont
 * l'historique n'a jamais été vérifié contre ce triplet. Le coût ne vaut pas le
 * gain, et la transaction offre la même garantie.
 *
 * LA CLÔTURE RESTE L'AUTORITÉ. `terminerSeance` efface les séries de la séance
 * et réécrit la liste complète : ce qui a été persisté en route est donc
 * remplacé par l'état final du brouillon, sans conflit possible entre les deux
 * chemins.
 */
/**
 * Le verdict d'une écriture ordonnée : appliquée, ou dépassée.
 *
 * `perimee` n'est pas une erreur : c'est une reprise réseau qui arrive après
 * une intention plus récente, et la refuser est exactement ce qu'on veut. Le
 * client n'a rien à réessayer.
 */
export type IssueEcriture = "appliquee" | "perimee";

/**
 * La séance est close : plus rien ne s'y écrit série par série.
 *
 * DISTINCTE DE `SeanceIntrouvable`, et pas par élégance. Une séance close
 * existe, appartient bien à ce compte, et se lit encore ; c'est l'ÉCRITURE qui
 * n'a plus de sens. Le client doit pouvoir distinguer « cette séance n'est pas
 * à toi » de « cette séance est finie » — et surtout ne pas réessayer.
 */
export class SeanceClose extends Error {
  constructor() {
    super("Cette séance est terminée");
    this.name = "SeanceClose";
  }
}

/**
 * La séance visée par une écriture série par série — ouverte, et à ce compte.
 *
 * LE DÉFAUT QUE CE GARDE FERME
 *
 * Le contrôle se contentait du propriétaire et de l'archivage. Or une séance
 * TERMINÉE n'est pas archivée : elle porte une durée, c'est tout. Une reprise
 * réseau partie avant la clôture pouvait donc aboutir APRÈS, et modifier
 * `set_logs` sur une séance que `terminerSeance` venait de figer.
 *
 * Cela contredisait frontalement l'invariant annoncé — « la clôture reste
 * l'autorité ». `dureeMinutes IS NULL` est la définition d'« ouverte » que le
 * reste du service emploie déjà (`seanceCourante`, `estTerminee`) ; on la
 * réutilise plutôt que d'en inventer une seconde.
 */
async function seanceOuvertePour(userId: string, sessionLogId: string) {
  const existante = await db.query.sessionLogs.findFirst({
    where: and(
      eq(sessionLogs.id, sessionLogId),
      eq(sessionLogs.userId, userId),
      isNull(sessionLogs.archiveLe),
    ),
  });
  if (!existante) throw new SeanceIntrouvable();
  if (existante.dureeMinutes !== null) throw new SeanceClose();
  return existante;
}

/**
 * Réserver la clé logique de la série pour cette révision — ou constater qu'on
 * est en retard.
 *
 * TOUT LE MÉCANISME D'ORDONNANCEMENT TIENT ICI.
 *
 * `ON CONFLICT … DO UPDATE … WHERE revision < EXCLUDED.revision` fait deux
 * choses en une instruction :
 *
 *   — il SÉRIALISE. Deux requêtes concurrentes sur la même clé se rencontrent
 *     sur la ligne d'unicité : la première la verrouille, la seconde attend
 *     puis compare. Sans ce point de rendez-vous, deux transactions
 *     DELETE+INSERT parallèles s'ignoraient purement et simplement.
 *   — il ORDONNE. Une révision qui n'est pas strictement supérieure ne met
 *     rien à jour, `RETURNING` ne rend aucune ligne, et l'écriture s'arrête.
 *
 * La révision vient du CLIENT, décidée au moment de l'intention et transportée
 * telle quelle par les reprises. C'est ce qui distingue l'ordre des intentions
 * de l'ordre des arrivées — les confondre était le défaut.
 */
async function reserverRevision(
  executeur: Parameters<Parameters<typeof db.transaction>[0]>[0],
  cle: { sessionLogId: string; exerciseInstanceId: string; numeroSerie: number },
  revision: number,
  supprime: boolean,
): Promise<IssueEcriture> {
  const lignes = await executeur
    .insert(setLogRevisions)
    .values({ ...cle, revision, supprime })
    .onConflictDoUpdate({
      target: [
        setLogRevisions.sessionLogId,
        setLogRevisions.exerciseInstanceId,
        setLogRevisions.numeroSerie,
      ],
      set: { revision, supprime, updatedAt: new Date() },
      where: lt(setLogRevisions.revision, revision),
    })
    .returning({ id: setLogRevisions.id });

  return lignes.length > 0 ? "appliquee" : "perimee";
}

/**
 * Une série validée arrive en base TOUT DE SUITE — et dans le bon ordre.
 *
 * CE QUI SE PASSAIT
 *
 * Le brouillon vivait dans `localStorage`, et rien n'atteignait Postgres avant
 * l'écran de fin. Une séance d'une heure tenait donc entièrement dans le
 * navigateur : un crash de Safari, un onglet fermé par le système sous pression
 * mémoire, un `localStorage` purgé, et l'entraînement n'avait jamais eu lieu.
 *
 * CE QUE LA PREMIÈRE CORRECTION NE GARANTISSAIT PAS
 *
 * Écrire en DELETE + INSERT dans une transaction donne l'ATOMICITÉ, pas
 * l'ordre. Une reprise réseau partie à 40 kg, arrivant après la correction à
 * 45, ramenait la base à 40 ; un vieux POST ressuscitait une série décochée.
 * Sur le réseau d'une salle de sport, ce n'est pas un cas rare.
 *
 * L'écriture est donc précédée d'une réservation de révision. Une révision
 * dépassée rend `perimee` et ne touche à rien.
 */
export async function enregistrerSerie(donnees: {
  userId: string;
  sessionLogId: string;
  serie: SerieASauver;
  /** Horloge du client au moment de l'INTENTION, transportée par les reprises. */
  revision: number;
}): Promise<IssueEcriture> {
  const existante = await seanceOuvertePour(donnees.userId, donnees.sessionLogId);

  const s = donnees.serie;

  // Les mêmes exigences qu'à la clôture, au même endroit du moteur : une série
  // acceptée en route ne doit pas être refusée à la fin.
  const [convention] = await db
    .select({
      id: exerciseInstances.id,
      conventionCharge: exerciseInstances.conventionCharge,
      natureCharge: exerciseInstances.natureCharge,
    })
    .from(exerciseInstances)
    .where(eq(exerciseInstances.id, s.exerciseInstanceId));

  const motif = motifSerieInvalide(s, convention ?? {}, {
    effortRequis: effortRequisPour(await phaseDuCycle(existante.seanceTemplateId)),
  });
  if (motif) throw new SerieInvalide(s.numeroSerie, motif);

  const cle = {
    sessionLogId: donnees.sessionLogId,
    exerciseInstanceId: s.exerciseInstanceId,
    numeroSerie: s.numeroSerie,
  };

  return db.transaction(async (tx) => {
    const issue = await reserverRevision(tx, cle, donnees.revision, false);
    if (issue === "perimee") return issue;

    // La réservation nous a donné la clé : l'écriture qui suit ne peut plus
    // croiser une concurrente sur la même série.
    await tx.delete(setLogs).where(and(
      eq(setLogs.sessionLogId, donnees.sessionLogId),
      eq(setLogs.exerciseInstanceId, s.exerciseInstanceId),
      eq(setLogs.numeroSerie, s.numeroSerie),
    ));
    await tx.insert(setLogs).values({
      sessionLogId: donnees.sessionLogId,
      exerciseInstanceId: s.exerciseInstanceId,
      numeroSerie: s.numeroSerie,
      repsEffectuees: s.repsEffectuees,
      charge: s.charge,
      rpeEffectif: s.rpeEffectif ?? null,
      tempoRespecte: s.tempoRespecte ?? null,
      reposReelSecondes: s.reposReelSecondes ?? null,
      notes: s.notes ?? null,
    });
    return issue;
  });
}

/**
 * Retirer une série décochée par erreur — et s'en souvenir.
 *
 * La pierre tombale est le point important. Effacer la ligne de `set_logs`
 * effacerait aussi la mémoire de la suppression : le prochain POST retardé
 * n'aurait plus rien à quoi se comparer, et la série reviendrait.
 */
export async function retirerSerie(donnees: {
  userId: string;
  sessionLogId: string;
  exerciseInstanceId: string;
  numeroSerie: number;
  revision: number;
}): Promise<IssueEcriture> {
  await seanceOuvertePour(donnees.userId, donnees.sessionLogId);

  const cle = {
    sessionLogId: donnees.sessionLogId,
    exerciseInstanceId: donnees.exerciseInstanceId,
    numeroSerie: donnees.numeroSerie,
  };

  return db.transaction(async (tx) => {
    const issue = await reserverRevision(tx, cle, donnees.revision, true);
    if (issue === "perimee") return issue;

    await tx.delete(setLogs).where(and(
      eq(setLogs.sessionLogId, donnees.sessionLogId),
      eq(setLogs.exerciseInstanceId, donnees.exerciseInstanceId),
      eq(setLogs.numeroSerie, donnees.numeroSerie),
    ));
    return issue;
  });
}

/**
 * Les séries déjà en base pour une séance — ce qui permet la reprise.
 *
 * C'est la BASE qui fait autorité : au chargement, l'écran repart de ce qu'elle
 * porte. Un `localStorage` disparu ne doit plus faire perdre une séance, et il
 * ne doit surtout pas faire recréer une `session_logs`.
 */
export async function seriesDeLaSeance(
  userId: string,
  sessionLogId: string,
): Promise<SerieASauver[]> {
  const existante = await db.query.sessionLogs.findFirst({
    where: and(
      eq(sessionLogs.id, sessionLogId),
      eq(sessionLogs.userId, userId),
      isNull(sessionLogs.archiveLe),
    ),
  });
  if (!existante) throw new SeanceIntrouvable();

  const lignes = await db.select().from(setLogs)
    .where(eq(setLogs.sessionLogId, sessionLogId))
    .orderBy(setLogs.numeroSerie);

  return lignes.map((l) => ({
    exerciseInstanceId: l.exerciseInstanceId,
    numeroSerie: l.numeroSerie,
    repsEffectuees: l.repsEffectuees,
    charge: l.charge,
    rpeEffectif: l.rpeEffectif,
    tempoRespecte: l.tempoRespecte,
    reposReelSecondes: l.reposReelSecondes,
    notes: l.notes,
  }));
}
