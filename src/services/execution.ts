import { db } from "@/db/client";
import {
  exerciseInstances, exercises, instanceReglages, notesExercice, reglagesPersonnels,
} from "@/db/schema";
import { and, eq, isNull, sql, type Column, type SQL } from "drizzle-orm";
import {
  ficheRenseignee, messageDeRefus, reglagesAAfficher, resumeDesReglages, tempoEffectif,
  validerReglage,
  type DefinitionReglage, type FicheTechnique, type ReglageAffiche, type TempoResolu,
} from "@/lib/engine/execution";

/**
 * Ce qu'il faut charger pour exécuter un mouvement, et rien d'autre.
 *
 * Trois portées distinctes se rejoignent ici, sans jamais se mélanger : la
 * fiche du MOUVEMENT, les réglages de l'APPAREIL, les valeurs de la PERSONNE.
 * Le service les assemble pour l'écran ; il ne les recopie pas de l'une vers
 * l'autre.
 */

export interface ContexteExecution {
  exerciseInstanceId: string | null;
  exerciseId: string;
  fiche: FicheTechnique | null;
  tempo: TempoResolu | null;
  reglages: ReglageAffiche[];
  resumeReglages: string | null;
  note: string | null;
}

/** Erreur métier : la valeur ne correspond pas à ce que la machine accepte. */
export class ReglageRefuse extends Error {
  constructor(readonly cle: string, message: string) {
    super(message);
    this.name = "ReglageRefuse";
  }
}

/** Erreur métier : l'appareil visé n'existe pas, ou plus. */
export class InstanceIntrouvable extends Error {
  constructor() {
    super("Appareil introuvable");
    this.name = "InstanceIntrouvable";
  }
}

/**
 * Erreur métier : cet appareil ne sert pas à cet exercice.
 *
 * Les deux identifiants arrivent séparément du client, et rien ne garantit
 * qu'ils vont ensemble. Assemblés sans contrôle, ils produiraient la fiche
 * technique d'un mouvement à côté des réglages d'une machine qui en fait un
 * autre — le pire résultat possible pour un écran dont tout l'objet est de dire
 * comment exécuter : des consignes justes, appliquées au mauvais appareil.
 *
 * Le couple n'est donc jamais cru sur parole. Il est vérifié contre la base.
 */
export class IncoherenceExerciceAppareil extends Error {
  constructor() {
    super("Cet appareil ne correspond pas à cet exercice");
    this.name = "IncoherenceExerciceAppareil";
  }
}

/**
 * L'appareil existe, il est actif, et il sert bien à cet exercice.
 *
 * Aucune restriction de compte au-delà : le parc est partagé entre les comptes
 * d'un même lieu — c'est l'invariant posé dans `db/archivage.ts` et vérifié par
 * `deux-comptes-meme-salle`. Chacun a le droit de mémoriser SES réglages sur
 * une machine décrite par quelqu'un d'autre ; ce qu'il écrit reste scopé à son
 * `user_id`, et la définition de la machine, elle, n'est pas modifiée ici.
 */
async function appareilDeLExercice(exerciseInstanceId: string, exerciseId: string) {
  const instance = await db.query.exerciseInstances.findFirst({
    where: and(
      eq(exerciseInstances.id, exerciseInstanceId),
      isNull(exerciseInstances.archiveLe),
    ),
    columns: { id: true, exerciseId: true },
  });
  if (!instance) throw new InstanceIntrouvable();
  if (instance.exerciseId !== exerciseId) throw new IncoherenceExerciceAppareil();
  return instance;
}

/**
 * Le vide stocké redevient le vide affiché.
 *
 * Effacer une note ou un réglage écrit désormais la chaîne vide au lieu de
 * supprimer la ligne — c'est ce qui garde le repère d'intention et empêche une
 * requête ancienne de ressusciter ce qu'on vient d'effacer. La contrepartie est
 * ici : toute lecture retraduit cette chaîne vide en « pas de valeur », pour que
 * la distinction reste invisible partout ailleurs.
 */
function valeurOuRien(brute: string | null | undefined): string | null {
  return brute == null || brute === "" ? null : brute;
}

/**
 * L'écriture ne l'emporte que si elle est plus récente que ce qui est en base.
 *
 * Comparaison faite par PostgreSQL, dans la même instruction que l'écriture :
 * c'est le seul endroit où l'ordre est garanti. Un jeton gardé en mémoire de
 * l'onglet ne protège pas la base, et un verrou qui ignore l'intention se
 * contenterait de sérialiser proprement les écritures dans le mauvais ordre.
 *
 * Quand la condition est fausse, l'instruction ne touche aucune ligne. C'est le
 * comportement voulu : une requête périmée devient une écriture sans effet,
 * silencieusement — l'utilisateur n'a rien à savoir d'une intention qu'il a
 * lui-même remplacée.
 */
function plusRecenteQue(colonne: Column, intention: number): SQL {
  return sql`${colonne} < ${intention}`;
}

/** Les réglages effectivement renseignés : les vides ne sont pas des valeurs. */
function valeursRenseignees(lignes: typeof reglagesPersonnels.$inferSelect[]) {
  return lignes.flatMap((p) => {
    const valeur = valeurOuRien(p.valeur);
    return valeur === null ? [] : [{ cle: p.cle, valeur }];
  });
}

function definitionsDe(lignes: typeof instanceReglages.$inferSelect[]): DefinitionReglage[] {
  return lignes.map((r) => ({
    cle: r.cle,
    libelle: r.libelle,
    type: r.typeValeur,
    min: r.min,
    max: r.max,
    options: r.options,
    unite: r.unite,
    ordre: r.ordre,
  }));
}

/**
 * Le contexte d'exécution d'un exercice, pour un compte donné.
 *
 * `exerciseInstanceId` peut être nul : les pompes n'ont pas d'appareil, et il
 * n'y a alors ni réglages ni note d'instance — seulement la fiche, le tempo, et
 * une note rattachée au mouvement.
 *
 * Le tempo de la séance et celui du programme sont passés par l'appelant, qui
 * les a déjà en main via le plan : les recharger ici imposerait une requête de
 * plus par exercice, pour une valeur déjà lue.
 */
export async function contexteExecution(entrees: {
  userId: string;
  exerciseId: string;
  exerciseInstanceId?: string | null;
  tempoSeance?: string | null;
  tempoProgramme?: string | null;
}): Promise<ContexteExecution> {
  const { userId, exerciseId, exerciseInstanceId = null } = entrees;

  // Le couple d'abord : sans lui, on assemblerait la fiche d'un mouvement aux
  // réglages d'une machine qui en fait un autre.
  if (exerciseInstanceId) await appareilDeLExercice(exerciseInstanceId, exerciseId);

  const exercice = await db.query.exercises.findFirst({
    where: eq(exercises.id, exerciseId),
    columns: { ficheTechnique: true, tempoParDefaut: true },
  });

  const tempo = tempoEffectif({
    seance: entrees.tempoSeance,
    programme: entrees.tempoProgramme,
    exercice: exercice?.tempoParDefaut,
  });

  const fiche = ficheRenseignee(exercice?.ficheTechnique) ? exercice!.ficheTechnique! : null;

  if (!exerciseInstanceId) {
    // Sans appareil, la note se range sur le mouvement : c'est le seul objet
    // durable auquel la rattacher.
    const note = await db.query.notesExercice.findFirst({
      where: and(eq(notesExercice.userId, userId), eq(notesExercice.exerciseId, exerciseId)),
    });
    return {
      exerciseInstanceId: null, exerciseId, fiche, tempo,
      reglages: [], resumeReglages: null, note: valeurOuRien(note?.texte),
    };
  }

  const [definitions, personnels, note] = await Promise.all([
    db.query.instanceReglages.findMany({
      where: eq(instanceReglages.exerciseInstanceId, exerciseInstanceId),
    }),
    // L'isolation est ici, et elle est double : le compte ET l'appareil. Sans le
    // second, les crans d'une Leg Extension viendraient garnir l'autre.
    db.query.reglagesPersonnels.findMany({
      where: and(
        eq(reglagesPersonnels.userId, userId),
        eq(reglagesPersonnels.exerciseInstanceId, exerciseInstanceId),
      ),
    }),
    db.query.notesExercice.findFirst({
      where: and(
        eq(notesExercice.userId, userId),
        eq(notesExercice.exerciseInstanceId, exerciseInstanceId),
      ),
    }),
  ]);

  const affiches = reglagesAAfficher(definitionsDe(definitions), valeursRenseignees(personnels));

  return {
    exerciseInstanceId, exerciseId, fiche, tempo,
    reglages: affiches,
    resumeReglages: resumeDesReglages(affiches),
    note: valeurOuRien(note?.texte),
  };
}

/**
 * Enregistre les réglages personnels d'un appareil.
 *
 * Persisté À LA MODIFICATION, pas à la clôture de la séance. Changer le siège
 * puis fermer l'onglet ne doit rien perdre : le réglage n'est pas une donnée de
 * séance, c'est un souvenir d'appareil, et il vaut indépendamment de ce qui
 * sera soulevé ensuite.
 *
 * Tout ou rien : les valeurs sont validées d'abord, écrites ensuite dans une
 * transaction. Une saisie fautive sur le troisième réglage n'enregistre pas les
 * deux premiers — sans quoi on ne saurait plus, en rouvrant l'écran, ce qui a
 * été retenu et ce qui a été rejeté.
 *
 * Une valeur vide EFFACE le réglage : c'est ainsi qu'on revient à « non
 * renseigné » sans avoir à inventer une valeur de sortie. Elle s'écrit comme
 * une valeur — la chaîne vide — au lieu de supprimer la ligne : voir
 * `valeurOuRien`.
 *
 * `intention` porte l'ordre voulu par l'utilisateur ; une valeur plus ancienne
 * n'écrase jamais une plus récente, quel que soit l'ordre d'arrivée.
 */
export async function enregistrerReglages(entrees: {
  userId: string;
  exerciseInstanceId: string;
  /**
   * Obligatoire : c'est lui qui permet de vérifier que l'appareil visé sert
   * bien au mouvement affiché. Sans lui, on écrirait des crans de siège sur
   * une machine choisie par le client.
   */
  exerciseId: string;
  valeurs: Record<string, string>;
  /**
   * Quand l'utilisateur a formé cette intention, en millisecondes.
   *
   * Absent, on retombe sur l'instant de réception : c'est exactement l'ancien
   * comportement, correct pour un appelant qui n'a pas deux écritures en vol —
   * un outil du coach, un script. Les écrans, eux, le fournissent.
   */
  intention?: number;
}): Promise<ReglageAffiche[]> {
  const { userId, exerciseInstanceId, exerciseId, valeurs } = entrees;
  const intention = entrees.intention ?? Date.now();

  await appareilDeLExercice(exerciseInstanceId, exerciseId);

  const definitions = await db.query.instanceReglages.findMany({
    where: eq(instanceReglages.exerciseInstanceId, exerciseInstanceId),
  });
  const parCle = new Map(definitionsDe(definitions).map((d) => [d.cle, d]));

  const aEcrire: Array<{ cle: string; valeur: string }> = [];

  for (const [cle, brute] of Object.entries(valeurs)) {
    const definition = parCle.get(cle);
    if (!definition) throw new ReglageRefuse(cle, messageDeRefus({ motif: "cle_inconnue" }));

    if (brute.trim() === "") {
      // Effacer est une écriture ordonnée comme les autres, pas une
      // suppression : la ligne garde son repère d'intention.
      aEcrire.push({ cle, valeur: "" });
      continue;
    }
    const verdict = validerReglage(definition, brute);
    if (!verdict.valide) {
      throw new ReglageRefuse(cle, messageDeRefus(verdict.refus!, definition));
    }
    aEcrire.push({ cle, valeur: verdict.valeur! });
  }

  await db.transaction(async (tx) => {
    for (const { cle, valeur } of aEcrire) {
      await tx.insert(reglagesPersonnels)
        .values({ userId, exerciseInstanceId, cle, valeur, intention })
        .onConflictDoUpdate({
          target: [
            reglagesPersonnels.userId,
            reglagesPersonnels.exerciseInstanceId,
            reglagesPersonnels.cle,
          ],
          set: { valeur, intention, updatedAt: new Date() },
          setWhere: plusRecenteQue(reglagesPersonnels.intention, intention),
        });
    }
  });

  const [defs, apres] = await Promise.all([
    db.query.instanceReglages.findMany({
      where: eq(instanceReglages.exerciseInstanceId, exerciseInstanceId),
    }),
    db.query.reglagesPersonnels.findMany({
      where: and(
        eq(reglagesPersonnels.userId, userId),
        eq(reglagesPersonnels.exerciseInstanceId, exerciseInstanceId),
      ),
    }),
  ]);
  // Ce qui est renvoyé est ce que la base CONTIENT, pas ce qu'on lui a proposé.
  // Quand une intention plus récente a déjà gagné, l'écran doit voir la valeur
  // gagnante — sinon il afficherait comme enregistrée une valeur que la base a
  // écartée.
  return reglagesAAfficher(definitionsDe(defs), valeursRenseignees(apres));
}

/**
 * Écrit la note d'un exercice, ou l'efface si le texte est vide.
 *
 * Une note par personne et par objet, remplacée quand on la réécrit : ce n'est
 * pas un journal, c'est un post-it. En empiler l'historique obligerait à
 * choisir laquelle montrer, et la réponse serait toujours « la dernière ».
 *
 * Encore faut-il savoir laquelle est la dernière. L'écran enregistre sans
 * bouton : deux modifications rapprochées mettent deux requêtes en vol, et
 * l'ordre d'ARRIVÉE n'est pas l'ordre d'INTENTION. D'où `intention`, et d'où
 * l'écriture en une seule instruction — lire puis écrire laissait passer les
 * deux requêtes entre les deux, ce qui produisait soit un doublon soit, l'index
 * unique aidant, une erreur 500 en pleine séance.
 *
 * Renvoie ce que la base CONTIENT après coup, qui n'est pas toujours ce qu'on
 * vient de proposer : quand une intention plus récente a déjà gagné, c'est elle
 * qui revient.
 */
export async function ecrireNote(entrees: {
  userId: string;
  exerciseInstanceId?: string | null;
  /** Toujours transmis : il sert de portée sans appareil, ET de contrôle avec. */
  exerciseId?: string | null;
  texte: string;
  /** Voir `enregistrerReglages`. Absent, on retombe sur l'instant de réception. */
  intention?: number;
}): Promise<string | null> {
  const { userId, texte } = entrees;
  const intention = entrees.intention ?? Date.now();
  const instanceId = entrees.exerciseInstanceId ?? null;
  const exerciceId = instanceId ? null : (entrees.exerciseId ?? null);
  if (!instanceId && !exerciceId) throw new InstanceIntrouvable();

  // Une note rangée sur un appareil qui ne fait pas cet exercice serait
  // retrouvée au mauvais moment, devant la mauvaise machine.
  if (instanceId) {
    if (!entrees.exerciseId) throw new IncoherenceExerciceAppareil();
    await appareilDeLExercice(instanceId, entrees.exerciseId);
  }

  const portee = instanceId
    ? eq(notesExercice.exerciseInstanceId, instanceId)
    : eq(notesExercice.exerciseId, exerciceId!);
  const ou = and(eq(notesExercice.userId, userId), portee);

  // Effacer écrit la chaîne vide au lieu de supprimer la ligne : le repère
  // d'intention doit survivre à l'effacement, sans quoi une requête ancienne
  // arrivée après coup réinsérerait la note qu'on vient de vider.
  const propre = texte.trim();

  // Deux index partiels, donc deux cibles de conflit : `NULL` n'entre pas dans
  // une contrainte d'unicité composite, et c'est la portée qui dit laquelle des
  // deux s'applique.
  const cible = instanceId
    ? {
      target: [notesExercice.userId, notesExercice.exerciseInstanceId],
      targetWhere: sql`${notesExercice.exerciseInstanceId} is not null`,
    }
    : {
      target: [notesExercice.userId, notesExercice.exerciseId],
      targetWhere: sql`${notesExercice.exerciseId} is not null`,
    };

  await db.insert(notesExercice)
    .values({
      userId, exerciseInstanceId: instanceId, exerciseId: exerciceId,
      texte: propre, intention,
    })
    .onConflictDoUpdate({
      ...cible,
      set: { texte: propre, intention, updatedAt: new Date() },
      setWhere: plusRecenteQue(notesExercice.intention, intention),
    });

  const apres = await db.query.notesExercice.findFirst({ where: ou });
  return valeurOuRien(apres?.texte);
}
