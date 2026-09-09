import { db } from "@/db/client";
import {
  exerciseInstances, exercises, instanceReglages, notesExercice, reglagesPersonnels,
} from "@/db/schema";
import { and, desc, eq, isNull, sql, type Column, type SQL } from "drizzle-orm";
import {
  ficheRenseignee, messageDeRefus, reglagesAAfficher, resumeDesReglages, tempoEffectif,
  validerReglage,
  type DefinitionReglage, type FicheTechnique, type ReglageAffiche, type TempoResolu,
} from "@/lib/engine/execution";
import {
  messageDeRefusDeclaration, validerDeclaration,
  type DeclarationBrute, type RefusDeclaration,
} from "@/lib/engine/declaration-reglage";
import { peutGererLaSalle, REFUS_GESTION_SALLE } from "@/lib/autorisations";
import { versMuscles, type Muscle } from "@/lib/referentiels/muscles";
import { FICHES_TECHNIQUES } from "@/lib/referentiels/fiches-techniques";

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
  /**
   * Ce que le mouvement travaille, en muscles canoniques.
   *
   * Ils vivaient dans la base, servaient au calcul de volume et à l'adaptation
   * sur douleur — et n'étaient montrés nulle part : la fiche d'exercice
   * n'affichait que les principaux, en une ligne de texte, et la séance rien du
   * tout. Ils voyagent maintenant avec le contexte pour que le mannequin puisse
   * les peindre, sans requête de plus.
   */
  musclesPrincipaux: Muscle[];
  musclesSecondaires: Muscle[];
  /**
   * Cette personne peut-elle DÉCRIRE les réglages de l'appareil ?
   *
   * Déclarer un réglage modifie la description partagée d'une machine — tous
   * les comptes du lieu la liront. C'est donc la même règle que le reste du
   * parc : lecture commune, écriture au responsable de la salle
   * (`lib/autorisations`). Renseigner SA valeur sur un réglage déjà décrit
   * reste ouvert à tout le monde ; ce champ ne parle que de la définition.
   *
   * Il est transmis pour que l'écran propose le geste plutôt que de laisser
   * découvrir le refus après coup. Il ne remplace évidemment pas le contrôle
   * serveur, qui a lieu à l'écriture.
   */
  peutDecrire: boolean;
}

/** Erreur métier : la valeur ne correspond pas à ce que la machine accepte. */
export class ReglageRefuse extends Error {
  constructor(readonly cle: string, message: string) {
    super(message);
    this.name = "ReglageRefuse";
  }
}

/**
 * Erreur métier : la déclaration d'un réglage n'est pas recevable.
 *
 * Distincte de `ReglageRefuse`, qui porte sur une VALEUR. Ici c'est la
 * description de l'appareil qu'on refuse d'écrire — un nom vide, un choix sans
 * options, une clé déjà prise.
 */
export class DeclarationRefusee extends Error {
  constructor(readonly refus: RefusDeclaration) {
    super(messageDeRefusDeclaration(refus));
    this.name = "DeclarationRefusee";
  }
}

/**
 * Erreur métier : ce compte n'entretient pas cette salle.
 *
 * Décrire un réglage modifie un objet COMMUN. La règle est celle du reste du
 * parc — `lib/autorisations` — et elle est appliquée ici, dans le service,
 * plutôt que seulement dans la route : la route n'est pas son seul appelant, et
 * une modification silencieuse du catalogue commun est précisément ce qu'on
 * refuse.
 */
export class GestionSalleRefusee extends Error {
  constructor() {
    super(REFUS_GESTION_SALLE);
    this.name = "GestionSalleRefusee";
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
 * Erreur métier : l'intention transmise n'est pas un instant utilisable.
 *
 * Elle finit dans un `bigint` PostgreSQL, qui accepte des valeurs qu'aucun
 * `number` JavaScript ne sait relire fidèlement. Une intention au-delà de
 * `Number.MAX_SAFE_INTEGER` s'écrirait donc correctement et se relirait faux —
 * et, une fois posée sur la ligne, condamnerait toutes les écritures suivantes,
 * qui lui seraient toutes inférieures. Refusée à l'entrée plutôt que constatée
 * plus tard.
 */
export class IntentionInvalide extends Error {
  constructor() {
    super("Intention invalide");
    this.name = "IntentionInvalide";
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
    columns: { id: true, exerciseId: true, gymId: true },
    // La salle voyage avec l'appareil, en une seule requête : c'est elle qui
    // décide de qui peut DÉCRIRE ses réglages, et la lire séparément ajouterait
    // un aller-retour sur un chemin déjà chaud.
    with: { gym: { columns: { userId: true } } },
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
 * Comment cette écriture se situe par rapport aux autres.
 *
 * Deux natures d'écriture, et elles ne suivent PAS la même règle :
 *
 *   ORDONNÉE   elle vient d'un écran qui enregistre tout seul, donc elle peut
 *              croiser une autre écriture du même champ. Elle porte l'instant
 *              où l'utilisateur a formé son intention, et ne l'emporte que si
 *              cet instant est plus récent que celui déjà en base.
 *
 *   FORCÉE     elle vient du serveur — un script, un outil du coach, une
 *              reprise. Elle n'est en course avec personne, donc elle ne
 *              concourt pas : elle s'applique, point.
 *
 * La distinction n'est pas cosmétique. Une écriture forcée qui se contenterait
 * de l'heure serveur PERDRAIT contre une intention posée par un téléphone en
 * avance : le `where` la refuserait en silence, et l'appelant croirait avoir
 * écrit. C'est le défaut que ce type supprime — il n'existe pas de « pas
 * d'intention » implicite, seulement deux régimes nommés.
 */
export type Ordonnancement = { readonly intention: number } | "forcee";

/**
 * Une intention utilisable : entière, positive, et sûre en JavaScript.
 *
 * La borne haute est `Number.MAX_SAFE_INTEGER`, pas celle du `bigint`
 * PostgreSQL : au-delà, la colonne accepterait une valeur qu'aucun `number` ne
 * relit fidèlement.
 */
export function intentionValide(valeur: number): boolean {
  return Number.isSafeInteger(valeur) && valeur >= 0;
}

/**
 * Traduit un régime d'écriture en trois morceaux de requête.
 *
 * La comparaison est faite par PostgreSQL, dans l'instruction même qui écrit :
 * c'est le seul endroit où l'ordre est garanti. Un jeton gardé en mémoire de
 * l'onglet ne protège pas la base, et un verrou qui ignore l'intention se
 * contenterait de sérialiser proprement les écritures dans le mauvais ordre.
 *
 * Le cas forcé mérite son explication. Il s'applique toujours — pas de
 * condition — et laisse le repère au PLUS HAUT des deux valeurs :
 *
 *   ne pas le faire reculer   sinon une requête utilisateur encore en vol,
 *                             plus ancienne, repasserait devant.
 *   ne pas le faire bondir    une valeur énorme (MAX_SAFE_INTEGER, une date
 *                             lointaine) condamnerait toutes les écritures
 *                             suivantes de l'utilisateur, définitivement.
 *
 * `greatest` donne exactement cela : la ligne est écrite, et le repère reste
 * ce qu'il était s'il était déjà devant.
 */
function morceauxDOrdre(ordre: Ordonnancement, colonne: Column): {
  aLInsertion: number;
  aLaMiseAJour: number | SQL;
  condition: SQL | undefined;
} {
  if (ordre === "forcee") {
    const maintenant = Date.now();
    return {
      aLInsertion: maintenant,
      aLaMiseAJour: sql`greatest(${colonne}, ${maintenant})`,
      condition: undefined,
    };
  }
  return {
    aLInsertion: ordre.intention,
    aLaMiseAJour: ordre.intention,
    condition: sql`${colonne} < ${ordre.intention}`,
  };
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
  const appareil = exerciseInstanceId
    ? await appareilDeLExercice(exerciseInstanceId, exerciseId)
    : null;

  const exercice = await db.query.exercises.findFirst({
    where: eq(exercises.id, exerciseId),
    columns: {
      slug: true, ficheTechnique: true, tempoParDefaut: true, type: true,
      musclesPrincipaux: true, musclesSecondaires: true,
    },
  });

  const tempo = tempoEffectif({
    seance: entrees.tempoSeance,
    programme: entrees.tempoProgramme,
    exercice: exercice?.tempoParDefaut,
    // Faute de prescription, la politique canonique plutôt que rien : le
    // tempo était systématiquement absent, et il a fallu le demander hors de
    // l'application pendant toute la séance du 6 septembre.
    typeExercice: exercice?.type,
  });

  const ficheStockee = ficheRenseignee(exercice?.ficheTechnique)
    ? exercice!.ficheTechnique!
    : null;
  const phasesVersionnees = exercice?.slug
    ? FICHES_TECHNIQUES[exercice.slug]?.libellesPhasesTempo
    : undefined;
  // Les nouveaux mots du geste sont disponibles dans la preview sans écrire
  // la fiche en base. La fiche stockée garde toutes ses autres rubriques et
  // reste la source de vérité ; seul ce champ versionné complète une ancienne
  // ligne qui ne le porte pas encore.
  const fiche = ficheStockee && phasesVersionnees && !ficheStockee.libellesPhasesTempo
    ? { ...ficheStockee, libellesPhasesTempo: phasesVersionnees }
    : ficheStockee;

  // `versMuscles` plutôt que la valeur brute : la colonne porte encore, pour de
  // vieilles lignes, le vocabulaire d'avant le référentiel unique. Une clé
  // inconnue est écartée ici et n'atteint jamais le mannequin.
  const musclesPrincipaux = versMuscles(exercice?.musclesPrincipaux);
  const musclesSecondaires = versMuscles(exercice?.musclesSecondaires);

  if (!exerciseInstanceId) {
    // Sans appareil, la note se range sur le mouvement : c'est le seul objet
    // durable auquel la rattacher.
    const note = await db.query.notesExercice.findFirst({
      where: and(eq(notesExercice.userId, userId), eq(notesExercice.exerciseId, exerciseId)),
    });
    return {
      exerciseInstanceId: null, exerciseId, fiche, tempo,
      reglages: [], resumeReglages: null, note: valeurOuRien(note?.texte),
      musclesPrincipaux, musclesSecondaires,
      // Sans appareil, il n'y a rien à décrire : les pompes n'ont pas de siège.
      peutDecrire: false,
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
    musclesPrincipaux, musclesSecondaires,
    peutDecrire: peutGererLaSalle(appareil!.gym, userId),
  };
}

/**
 * Déclare qu'un réglage EXISTE sur cet appareil.
 *
 * C'est le geste qui manquait. Toute la chaîne — validation d'une valeur,
 * mémoire personnelle, résumé sur la carte, section de la fiche d'exécution —
 * partait d'une définition que rien ne savait créer. Une salle entière pouvait
 * donc être décrite jusqu'aux incréments de pile sans qu'aucun cran de siège
 * puisse jamais être retenu.
 *
 * PORTÉE. Ce qui s'écrit ici décrit l'OBJET, pas la personne : la définition
 * est commune à tous les comptes du lieu, comme l'instance qui la porte. D'où
 * le contrôle d'autorisation, qui est celui du reste du parc — lecture
 * commune, écriture au responsable de la salle. La valeur personnelle, elle,
 * reste libre pour chacun et s'écrit par `enregistrerReglages`.
 *
 * `ordre` est posé à la suite : un réglage déclaré devant la machine arrive
 * après ceux qui y sont déjà, ce qui est aussi l'ordre dans lequel on les a
 * rencontrés. Aucun classement plus savant ne se justifierait.
 *
 * Renvoie l'état complet des réglages APRÈS coup, garni des valeurs de cette
 * personne — l'écran peut donc enchaîner sur la saisie sans recharger.
 */
export async function declarerReglage(entrees: {
  userId: string;
  exerciseInstanceId: string;
  /** Comme partout ici : le couple appareil × mouvement n'est jamais cru sur parole. */
  exerciseId: string;
  declaration: DeclarationBrute;
}): Promise<ReglageAffiche[]> {
  const { userId, exerciseInstanceId, exerciseId } = entrees;

  const appareil = await appareilDeLExercice(exerciseInstanceId, exerciseId);
  if (!peutGererLaSalle(appareil.gym, userId)) throw new GestionSalleRefusee();

  const verdict = validerDeclaration(entrees.declaration);
  if (!verdict.valide) throw new DeclarationRefusee(verdict.refus);
  const d = verdict.declaration;

  // Le rang le plus élevé, pour se placer à la suite. `desc` + limite 1 plutôt
  // qu'un `max()` : la lecture complète suit de toute façon.
  const [dernier] = await db.query.instanceReglages.findMany({
    where: eq(instanceReglages.exerciseInstanceId, exerciseInstanceId),
    columns: { ordre: true },
    orderBy: [desc(instanceReglages.ordre)],
    limit: 1,
  });

  /*
   * `onConflictDoNothing` plutôt qu'une lecture préalable : c'est l'index
   * unique `(instance, cle)` qui tranche, dans l'instruction même qui écrit.
   * Deux personnes déclarant « Siège » au même instant ne peuvent donc pas
   * produire deux définitions — et celle qui perd reçoit un refus explicite
   * plutôt qu'une erreur 500 de contrainte violée.
   */
  const cree = await db.insert(instanceReglages)
    .values({
      exerciseInstanceId,
      cle: d.cle,
      libelle: d.libelle,
      typeValeur: d.type,
      min: d.min,
      max: d.max,
      options: d.options,
      unite: d.unite,
      ordre: (dernier?.ordre ?? -1) + 1,
    })
    .onConflictDoNothing({
      target: [instanceReglages.exerciseInstanceId, instanceReglages.cle],
    })
    .returning({ id: instanceReglages.id });

  if (cree.length === 0) {
    throw new DeclarationRefusee({ motif: "cle_existante", libelle: d.libelle });
  }

  const [definitions, personnels] = await Promise.all([
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
  return reglagesAAfficher(definitionsDe(definitions), valeursRenseignees(personnels));
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
   * Ordonnée (l'écran, qui peut avoir deux écritures en vol) ou forcée (un
   * script, un outil du coach). Voir `Ordonnancement` : il n'y a pas de
   * troisième cas, et surtout pas d'heure serveur mise en concurrence avec des
   * intentions client.
   */
  ordre?: Ordonnancement;
}): Promise<ReglageAffiche[]> {
  const { userId, exerciseInstanceId, exerciseId, valeurs } = entrees;
  const ordre = entrees.ordre ?? "forcee";
  if (ordre !== "forcee" && !intentionValide(ordre.intention)) {
    throw new IntentionInvalide();
  }

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

  const rang = morceauxDOrdre(ordre, reglagesPersonnels.intention);
  await db.transaction(async (tx) => {
    for (const { cle, valeur } of aEcrire) {
      await tx.insert(reglagesPersonnels)
        .values({ userId, exerciseInstanceId, cle, valeur, intention: rang.aLInsertion })
        .onConflictDoUpdate({
          target: [
            reglagesPersonnels.userId,
            reglagesPersonnels.exerciseInstanceId,
            reglagesPersonnels.cle,
          ],
          set: { valeur, intention: rang.aLaMiseAJour, updatedAt: new Date() },
          setWhere: rang.condition,
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
  /** Ordonnée (l'écran) ou forcée (le serveur). Voir `Ordonnancement`. */
  ordre?: Ordonnancement;
}): Promise<string | null> {
  const { userId, texte } = entrees;
  const ordre = entrees.ordre ?? "forcee";
  if (ordre !== "forcee" && !intentionValide(ordre.intention)) {
    throw new IntentionInvalide();
  }
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

  const rang = morceauxDOrdre(ordre, notesExercice.intention);
  await db.insert(notesExercice)
    .values({
      userId, exerciseInstanceId: instanceId, exerciseId: exerciceId,
      texte: propre, intention: rang.aLInsertion,
    })
    .onConflictDoUpdate({
      ...cible,
      set: { texte: propre, intention: rang.aLaMiseAJour, updatedAt: new Date() },
      setWhere: rang.condition,
    });

  const apres = await db.query.notesExercice.findFirst({ where: ou });
  return valeurOuRien(apres?.texte);
}
