import { db } from "@/db/client";
import {
  coachPropositions, exerciseInTemplate, exerciseInstances, exercises,
  programmeBlocs, seanceTemplates,
} from "@/db/schema";
import { machinesUtilisablesAujourdhui } from "@/db/archivage";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import {
  BORNES, NOUVELLE_LIGNE, construireApercu, empreinteDe, estPerimee, projeter,
  type Apercu, type LigneProgramme, type Operation,
} from "@/lib/coach/propositions";
import { validerSeanceComplete, type SeanceAValider } from "./validation";
import { contraintes } from "@/db/schema";
import { contraintesActives } from "./contraintes";
import { versMuscle } from "@/lib/referentiels/muscles";
import { libelleMuscle } from "@/lib/referentiels/libelles";
import { REEVALUATION_JOURS, SEVERITE, decalerDe, reevaluer } from "@/lib/engine/contraintes";
import {
  apercuCreation, apercuResolution, empreinteContrainte, severiteRecevable,
  type OperationContrainte,
} from "@/lib/coach/propositions-contraintes";
import type { Lecteur } from "@/db/lecteur";

/**
 * Le chemin d'écriture du coach, de bout en bout.
 *
 * Trois moments, trois fonctions, et une seule règle qui les relie : le
 * serveur ne fait jamais confiance à ce qu'il a lui-même calculé un instant
 * plus tôt. `preparer` fige un état et une opération ; `appliquer` relit cet
 * état, vérifie qu'il n'a pas bougé, refait le calcul, écrit, puis contrôle ce
 * qu'il vient d'écrire. Entre les deux il y a une décision humaine, et c'est la
 * seule chose que ce module ne sait pas produire lui-même.
 */

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class PropositionRefusee extends Error {
  constructor(
    readonly raison: string,
    readonly statut: number = 409,
  ) {
    super(raison);
    this.name = "PropositionRefusee";
  }
}

// ---------------------------------------------------------------------------
// Lecture de la cible
// ---------------------------------------------------------------------------

/** Repos par défaut d'une ligne créée, quand aucune valeur n'est héritée. */
const REPOS_PAR_DEFAUT_SECONDES = 120;

interface Cible {
  seanceTemplateId: string;
  nomSeance: string;
  gymId: string | null;
  lignes: LigneProgramme[];
}

function nomLisible(nom: string | null, machine: string | null): string {
  if (nom && machine) return `${nom} — ${machine}`;
  return nom ?? machine ?? "Exercice";
}

/**
 * La séance visée, si elle appartient bien à l'utilisateur.
 *
 * Le gabarit n'a pas de `user_id` : il appartient à un bloc, dont on vérifie le
 * propriétaire. Sans cette jointure, un identifiant deviné suffirait à lire —
 * puis à modifier — le programme de quelqu'un d'autre.
 */
async function lireCible(
  userId: string,
  seanceTemplateId: string,
  // Dans une transaction, lire avec `db` reviendrait à lire hors du verrou
  // qu'on vient de poser : la relecture doit passer par le même client.
  executeur: Lecteur = db,
): Promise<Cible | null> {
  const [gabarit] = await executeur
    .select({ id: seanceTemplates.id, nom: seanceTemplates.nom })
    .from(seanceTemplates)
    .innerJoin(programmeBlocs, eq(programmeBlocs.id, seanceTemplates.blocId))
    .where(
      and(
        eq(seanceTemplates.id, seanceTemplateId),
        eq(programmeBlocs.userId, userId),
        isNull(programmeBlocs.archiveLe),
      ),
    )
    .limit(1);
  if (!gabarit) return null;

  const lignes = await executeur
    .select({
      id: exerciseInTemplate.id,
      ordre: exerciseInTemplate.ordre,
      exerciseInstanceId: exerciseInTemplate.exerciseInstanceId,
      nom: exercises.nom,
      machineNom: exerciseInstances.machineNom,
      gymId: exerciseInstances.gymId,
      seriesCibles: exerciseInTemplate.seriesCibles,
      repsMin: exerciseInTemplate.fourchetteRepsMin,
      repsMax: exerciseInTemplate.fourchetteRepsMax,
    })
    .from(exerciseInTemplate)
    .innerJoin(exerciseInstances, eq(exerciseInstances.id, exerciseInTemplate.exerciseInstanceId))
    .innerJoin(exercises, eq(exercises.id, exerciseInstances.exerciseId))
    .where(and(
      eq(exerciseInTemplate.seanceTemplateId, gabarit.id),
      isNull(exerciseInTemplate.archiveLe),
    ))
    .orderBy(asc(exerciseInTemplate.ordre));

  return {
    seanceTemplateId: gabarit.id,
    nomSeance: gabarit.nom,
    // La salle de la séance est celle de ses machines : elles y sont toutes.
    gymId: lignes[0]?.gymId ?? null,
    lignes: lignes.map((l) => ({
      id: l.id,
      ordre: l.ordre,
      exerciseInstanceId: l.exerciseInstanceId,
      nom: nomLisible(l.nom, l.machineNom),
      seriesCibles: l.seriesCibles,
      repsMin: l.repsMin,
      repsMax: l.repsMax,
    })),
  };
}

/**
 * La séance programmée, telle qu'une proposition la voit.
 *
 * Exportée pour l'outil de lecture qui l'accompagne : sans les identifiants de
 * lignes, le modèle ne peut désigner ce qu'il veut changer, et proposerait par
 * description — « le deuxième exercice » — c'est-à-dire par ambiguïté.
 */
export async function lireSeanceProgrammee(userId: string, seanceTemplateId: string) {
  return lireCible(userId, seanceTemplateId);
}

/** Machines réellement présentes, pour nommer et pour refuser ce qui n'existe pas. */
async function machinesDeLaSalle(
  gymId: string | null,
  executeur: Lecteur = db,
): Promise<Map<string, string>> {
  const lignes = await executeur
    .select({ id: exerciseInstances.id, nom: exercises.nom, machineNom: exerciseInstances.machineNom })
    .from(exerciseInstances)
    .innerJoin(exercises, eq(exercises.id, exerciseInstances.exerciseId))
    .where(
      gymId
        ? and(machinesUtilisablesAujourdhui(), eq(exerciseInstances.gymId, gymId))
        : machinesUtilisablesAujourdhui(),
    );
  return new Map(lignes.map((l) => [l.id, nomLisible(l.nom, l.machineNom)]));
}

// ---------------------------------------------------------------------------
// Validation d'un état projeté
// ---------------------------------------------------------------------------

interface Controle {
  bloquants: string[];
  avertissements: string[];
}

/**
 * Ce que la séance projetée vaut, selon les mêmes contrôles que partout.
 *
 * `validerSeanceComplete` est déjà ce que traversent l'adaptation de lieu et la
 * validation d'une séance proposée par le modèle. Une proposition du coach n'a
 * aucune raison d'y échapper : sinon un chemin d'écriture accepterait ce qu'un
 * autre refuse, pour la même séance.
 */
async function controler(
  userId: string,
  gymId: string | null,
  lignes: LigneProgramme[],
  executeur: Lecteur = db,
): Promise<Controle> {
  if (!gymId) return { bloquants: [], avertissements: [] };

  const exercicesAValider: SeanceAValider[] = lignes.map((l) => ({
    exerciseInstanceId: l.exerciseInstanceId,
    series: l.seriesCibles,
    repsMin: l.repsMin,
    repsMax: l.repsMax,
    reposSecondes: REPOS_PAR_DEFAUT_SECONDES,
  }));

  const resultat = await validerSeanceComplete({
    userId,
    gymId,
    exercices: exercicesAValider,
    // Le même moteur de validation que partout, mais qui lit l'état de la
    // transaction : appelé avec `db` après une mutation non commitée, il
    // jugerait la séance d'avant.
    executeur,
  });

  const toutes = [...resultat.seance.anomalies, ...resultat.semaine.anomalies];
  return {
    bloquants: toutes.filter((a) => a.gravite === "bloquant").map((a) => a.message),
    avertissements: toutes.filter((a) => a.gravite !== "bloquant").map((a) => a.message),
  };
}

// ---------------------------------------------------------------------------
// 1 — Préparer : calculer et montrer, sans rien écrire
// ---------------------------------------------------------------------------

export interface PropositionPreparee {
  id: string;
  seanceTemplateId: string;
  nomSeance: string;
  operation: Operation["type"];
  apercu: Apercu;
  expireLe: string;
}

/**
 * Le premier appel d'un outil d'écriture ne produit jamais une mutation.
 *
 * Il produit une proposition : l'avant relu en base, l'après calculé, l'aperçu
 * construit par différence entre les deux. Le modèle n'a fourni qu'une
 * opération et des identifiants, dont aucun n'échappe à la vérification de
 * propriété.
 */
export async function preparerProposition(entrees: {
  userId: string;
  seanceTemplateId: string;
  operation: Operation;
  conversationId?: string | null;
}): Promise<PropositionPreparee> {
  const { userId, operation } = entrees;

  const cible = await lireCible(userId, entrees.seanceTemplateId);
  if (!cible) throw new PropositionRefusee("Cette séance est introuvable.", 404);

  const machines = await machinesDeLaSalle(cible.gymId);
  const projection = projeter(cible.lignes, operation, (id) => machines.get(id) ?? null);
  if (projection.refus) throw new PropositionRefusee(projection.refus, 422);

  const controle = await controler(userId, cible.gymId, projection.lignes);
  if (controle.bloquants.length > 0) {
    // Une proposition qui ne passerait pas les contrôles n'est pas soumise à
    // l'athlète : elle repart au modèle, qui a de quoi la corriger.
    throw new PropositionRefusee(
      `Cette modification ne passe pas les contrôles : ${controle.bloquants.join(" ; ")}`,
      422,
    );
  }

  const apercu = construireApercu(cible.lignes, projection.lignes, controle.avertissements);

  const [ligne] = await db
    .insert(coachPropositions)
    .values({
      userId,
      conversationId: entrees.conversationId ?? null,
      sujet: "seance",
      seanceTemplateId: cible.seanceTemplateId,
      operation: operation.type,
      parametres: operation as unknown as Record<string, unknown>,
      avant: cible.lignes,
      apres: projection.lignes,
      apercu: apercu as unknown as Record<string, unknown>,
      empreinte: empreinteDe(cible.lignes),
    })
    .returning();

  if (!ligne) throw new PropositionRefusee("Proposition non enregistrée.", 500);

  return {
    id: ligne.id,
    seanceTemplateId: cible.seanceTemplateId,
    nomSeance: cible.nomSeance,
    operation: operation.type,
    apercu,
    expireLe: new Date(
      ligne.createdAt.getTime() + BORNES.validiteMinutes * 60_000,
    ).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 2 — Lire : ce qui attend une décision
// ---------------------------------------------------------------------------

export async function propositionsEnAttente(userId: string, conversationId?: string | null) {
  const lignes = await db
    .select()
    .from(coachPropositions)
    .where(and(eq(coachPropositions.userId, userId), eq(coachPropositions.statut, "en_attente")))
    .orderBy(desc(coachPropositions.createdAt))
    .limit(10);

  return lignes
    .filter((l) => !estPerimee(l.createdAt))
    .filter((l) => !conversationId || l.conversationId === conversationId)
    .map((l) => ({
      id: l.id,
      operation: l.operation,
      apercu: l.apercu as unknown as Apercu,
      creeeLe: l.createdAt.toISOString(),
      expireLe: new Date(l.createdAt.getTime() + BORNES.validiteMinutes * 60_000).toISOString(),
    }));
}

// ---------------------------------------------------------------------------
// 3 — Appliquer : après le oui, et pas avant
// ---------------------------------------------------------------------------

export interface Application {
  id: string;
  apercu: Apercu;
  avertissements: string[];
}

/**
 * Point d'injection d'une panne, pour les tests d'atomicité.
 *
 * Prouver qu'un rollback a lieu demande de faire échouer l'application à un
 * moment précis — après la mutation, pendant la validation — et aucun jeu de
 * données ne provoque ça de l'extérieur. Le crochet est vide en production et
 * ne coûte qu'un appel de fonction ; il rend vérifiable ce qui ne l'était que
 * par relecture du code.
 */
export const PANNES: {
  apresMutation: (() => void | Promise<void>) | null;
  pendantValidation: (() => void | Promise<void>) | null;
  /** Dernier instant avant le COMMIT : tout est écrit, rien n'est visible. */
  avantCommit: (() => void | Promise<void>) | null;
} = { apresMutation: null, pendantValidation: null, avantCommit: null };

/**
 * Applique une proposition confirmée.
 *
 * Tout ce qui suit le BEGIN est dans la même transaction : le verrou, la
 * vérification d'empreinte, le recalcul, l'écriture, la validation complète du
 * résultat, et le passage de la proposition à « appliquée ». Rien d'invalide
 * n'est donc commité, même brièvement.
 *
 * La version précédente validait après le commit et restaurait ligne à ligne en
 * cas de refus. Elle laissait exactement la fenêtre que l'atomicité doit
 * supprimer : un lecteur concurrent pouvait y voir un état que nos propres
 * validateurs rejettent, une panne entre le commit et la restauration le
 * figeait, et la restauration elle-même pouvait échouer. Un ROLLBACK fait le
 * travail sans second mécanisme de sûreté.
 *
 * L'écriture est refaite depuis l'opération, pas recopiée depuis l'après
 * enregistré. Un après recopié appliquerait des identifiants figés à un état
 * qui a pu bouger ; recalculer sur l'état verrouillé, lui-même prouvé
 * identique, donne exactement ce qui a été montré.
 */
export async function appliquerProposition(
  userId: string,
  propositionId: string,
): Promise<Application> {
  const proposition = await db.query.coachPropositions.findFirst({
    where: and(eq(coachPropositions.id, propositionId), eq(coachPropositions.userId, userId)),
  });
  if (!proposition) throw new PropositionRefusee("Cette proposition est introuvable.", 404);

  if (proposition.statut !== "en_attente") {
    throw new PropositionRefusee(
      proposition.statut === "appliquee"
        ? "Cette proposition a déjà été appliquée."
        : "Cette proposition n'attend plus de décision.",
    );
  }

  if (estPerimee(proposition.createdAt)) {
    await marquer(propositionId, "perimee", { raison: "Délai dépassé" });
    throw new PropositionRefusee(
      "Cette proposition a été calculée il y a trop longtemps. Redemande-la au coach.",
    );
  }

  // Une proposition de contrainte suit le même chemin — verrou, empreinte,
  // écriture et statut dans une transaction — mais ne relit pas une séance.
  if (proposition.sujet === "contrainte") {
    return appliquerSurContrainte(userId, proposition);
  }

  if (!proposition.seanceTemplateId) {
    throw new PropositionRefusee("Cette proposition ne désigne aucune séance.", 500);
  }
  const seanceTemplateId = proposition.seanceTemplateId;
  const operation = proposition.parametres as unknown as Operation;

  try {
    const resultat = await db.transaction(async (tx) => {
      // Verrou sur les lignes de la séance : deux confirmations simultanées ne
      // doivent pas s'appliquer chacune sur l'état que l'autre est en train de
      // modifier.
      await tx
        .select({ id: exerciseInTemplate.id })
        .from(exerciseInTemplate)
        .where(and(
          eq(exerciseInTemplate.seanceTemplateId, seanceTemplateId),
          isNull(exerciseInTemplate.archiveLe),
        ))
        .for("update");

      const cible = await lireCible(userId, seanceTemplateId, tx);
      if (!cible) throw new PropositionRefusee("Cette séance a été supprimée.", 404);

      if (empreinteDe(cible.lignes) !== proposition.empreinte) {
        throw new PropositionRefusee(
          "La séance a changé depuis cette proposition. Redemande-la au coach pour qu'elle porte sur l'état actuel.",
        );
      }

      const machines = await machinesDeLaSalle(cible.gymId, tx);
      const projection = projeter(cible.lignes, operation, (id) => machines.get(id) ?? null);
      if (projection.refus) throw new PropositionRefusee(projection.refus, 422);

      await ecrire(tx, seanceTemplateId, cible.lignes, projection.lignes);
      await PANNES.apresMutation?.();

      // Relecture de ce qui vient d'être écrit, DANS la transaction : c'est
      // l'état réel, visible d'ici seulement, et pas la projection. Une
      // écriture qui produirait autre chose que ce qui a été montré se voit
      // maintenant, tant qu'il est encore possible de tout annuler.
      const apres = await lireCible(userId, seanceTemplateId, tx);
      if (!apres) throw new PropositionRefusee("Séance illisible après application.", 500);

      await PANNES.pendantValidation?.();
      const controle = await controler(userId, apres.gymId, apres.lignes, tx);
      if (controle.bloquants.length > 0) {
        // Le throw remonte hors du callback : Drizzle émet ROLLBACK, et rien de
        // ce qui précède — mutation comprise — n'aura existé pour personne.
        throw new PropositionRefusee(
          `Cette modification rendrait la séance invalide : ${controle.bloquants.join(" ; ")}`,
          422,
        );
      }

      const apercu = construireApercu(cible.lignes, apres.lignes, controle.avertissements);

      // Le statut change dans la même transaction que la séance. « Programme
      // non modifié + proposition appliquée » devient impossible : les deux
      // écritures partagent le même sort.
      await tx
        .update(coachPropositions)
        .set({
          statut: "appliquee",
          decideLe: new Date(),
          resultat: {
            avertissements: controle.avertissements,
            apercu: apercu as unknown as Record<string, unknown>,
          },
        })
        .where(eq(coachPropositions.id, propositionId));

      await PANNES.avantCommit?.();
      return { apercu, avertissements: controle.avertissements };
    });

    return { id: propositionId, apercu: resultat.apercu, avertissements: resultat.avertissements };
  } catch (erreur) {
    // Le rollback a déjà tout défait, proposition comprise : elle est revenue à
    // « en attente ». On l'écarte ensuite, dans une écriture séparée, pour que
    // la raison soit conservée — mais ce marquage n'a plus rien à réparer, il
    // ne fait que dire pourquoi.
    const raison = erreur instanceof PropositionRefusee
      ? erreur.raison
      : erreur instanceof Error ? erreur.message : String(erreur);

    const encore = await db.query.coachPropositions.findFirst({
      where: eq(coachPropositions.id, propositionId),
    });
    if (encore?.statut === "en_attente") {
      await marquer(propositionId, "echouee", { raison });
    }
    throw erreur;
  }
}

export async function refuserProposition(userId: string, propositionId: string): Promise<void> {
  const proposition = await db.query.coachPropositions.findFirst({
    where: and(eq(coachPropositions.id, propositionId), eq(coachPropositions.userId, userId)),
  });
  if (!proposition) throw new PropositionRefusee("Cette proposition est introuvable.", 404);
  if (proposition.statut !== "en_attente") {
    throw new PropositionRefusee("Cette proposition n'attend plus de décision.");
  }
  await marquer(propositionId, "refusee", null);
}

async function marquer(
  id: string,
  statut: "appliquee" | "refusee" | "perimee" | "echouee",
  resultat: Record<string, unknown> | null,
): Promise<void> {
  await db
    .update(coachPropositions)
    .set({ statut, resultat, decideLe: new Date() })
    .where(eq(coachPropositions.id, id));
}

// ---------------------------------------------------------------------------
// L'écriture proprement dite
// ---------------------------------------------------------------------------

/**
 * Traduit une projection en écritures, dans la transaction ouverte par l'appelant.
 *
 * Elle ne lit pas l'opération : elle applique la différence entre deux états.
 * C'est ce qui fait qu'ajouter une opération au catalogue ne demande pas de
 * revenir ici, et qu'aucune écriture ne peut sortir de ce que l'aperçu montrait.
 */
async function ecrire(
  tx: Transaction,
  seanceTemplateId: string,
  avant: LigneProgramme[],
  apres: LigneProgramme[],
): Promise<void> {
  const parIdAvant = new Map(avant.map((l) => [l.id, l]));
  const maintenant = new Date();

  // Retirer, c'est dater — jamais supprimer. Même sémantique que l'écran
  // Programme : `session_plan_items` cite ces lignes pour dire d'où venait un
  // exercice réalisé, et l'historique doit garder cette origine.
  for (const l of avant) {
    if (apres.some((a) => a.id === l.id)) continue;
    await tx
      .update(exerciseInTemplate)
      .set({ archiveLe: maintenant, updatedAt: maintenant })
      .where(eq(exerciseInTemplate.id, l.id));
  }

  for (const l of apres) {
    if (l.id === NOUVELLE_LIGNE) {
      await tx.insert(exerciseInTemplate).values({
        seanceTemplateId,
        exerciseInstanceId: l.exerciseInstanceId,
        ordre: l.ordre,
        seriesCibles: l.seriesCibles,
        fourchetteRepsMin: l.repsMin,
        fourchetteRepsMax: l.repsMax,
        reposSecondes: REPOS_PAR_DEFAUT_SECONDES,
      });
      continue;
    }

    const initiale = parIdAvant.get(l.id);
    if (!initiale) continue;
    const identique =
      initiale.ordre === l.ordre &&
      initiale.exerciseInstanceId === l.exerciseInstanceId &&
      initiale.seriesCibles === l.seriesCibles &&
      initiale.repsMin === l.repsMin &&
      initiale.repsMax === l.repsMax;
    if (identique) continue;

    await tx
      .update(exerciseInTemplate)
      .set({
        ordre: l.ordre,
        exerciseInstanceId: l.exerciseInstanceId,
        seriesCibles: l.seriesCibles,
        fourchetteRepsMin: l.repsMin,
        fourchetteRepsMax: l.repsMax,
        updatedAt: maintenant,
      })
      .where(eq(exerciseInTemplate.id, l.id));
  }
}

// ---------------------------------------------------------------------------
// Le second sujet : les contraintes physiques
// ---------------------------------------------------------------------------

/**
 * Prépare une proposition qui porte sur une contrainte.
 *
 * Même contrat que pour une séance : rien n'est écrit, l'aperçu est construit
 * par le serveur, et une empreinte fige la situation. Ce qu'elle fige ici,
 * c'est l'état des contraintes de cette zone — si l'athlète en déclare une
 * entre-temps, la proposition devient fausse et sera refusée.
 */
export async function preparerPropositionContrainte(entrees: {
  userId: string;
  operation: OperationContrainte;
  conversationId?: string | null;
}): Promise<PropositionPreparee> {
  const { userId, operation } = entrees;
  const date = new Date().toISOString().slice(0, 10);
  const actives = await contraintesActives(userId, db, date);

  let muscle: string;
  let apercu: Apercu;
  let contrainteId: string | null = null;

  if (operation.type === "creer_contrainte") {
    const canonique = versMuscle(operation.muscle);
    if (!canonique) {
      throw new PropositionRefusee(`Zone « ${operation.muscle} » inconnue du référentiel.`, 422);
    }
    if (actives.some((c) => c.muscle === canonique)) {
      throw new PropositionRefusee(
        "Une contrainte est déjà active sur cette zone. Propose plutôt de l'ajuster ou de la lever.",
        422,
      );
    }
    const severite = severiteRecevable(operation.severite);
    if (severite === null) {
      throw new PropositionRefusee(
        `La sévérité doit tenir entre ${SEVERITE.minimum} et ${SEVERITE.maximum}.`,
        422,
      );
    }
    muscle = canonique;
    apercu = apercuCreation({
      libelleMuscle: libelleMuscle(canonique),
      severite,
      // Une contrainte proposée par le coach porte toujours une échéance : il
      // ne peut pas fabriquer une limitation définitive au détour d'un échange.
      aReevaluerLe: decalerDe(date, REEVALUATION_JOURS),
    });
  } else {
    const cible = actives.find((c) => c.id === operation.contrainteId);
    if (!cible) {
      throw new PropositionRefusee("Cette contrainte n'est pas active, ou n'existe pas.", 404);
    }
    muscle = cible.muscle;
    contrainteId = cible.id;
    apercu = apercuResolution({
      libelleMuscle: libelleMuscle(cible.muscle),
      severite: cible.severite,
      depuis: cible.dateDebut,
    });
  }

  const [ligne] = await db
    .insert(coachPropositions)
    .values({
      userId,
      conversationId: entrees.conversationId ?? null,
      sujet: "contrainte",
      seanceTemplateId: null,
      contrainteId,
      operation: operation.type,
      parametres: operation as unknown as Record<string, unknown>,
      avant: actives.filter((c) => c.muscle === muscle),
      apres: [],
      apercu: apercu as unknown as Record<string, unknown>,
      empreinte: empreinteContrainte(muscle, actives),
    })
    .returning();

  if (!ligne) throw new PropositionRefusee("Proposition non enregistrée.", 500);

  return {
    id: ligne.id,
    seanceTemplateId: "",
    nomSeance: libelleMuscle(muscle),
    operation: operation.type as unknown as Operation["type"],
    apercu,
    expireLe: new Date(ligne.createdAt.getTime() + BORNES.validiteMinutes * 60_000).toISOString(),
  };
}

/**
 * Applique une proposition de contrainte, confirmée.
 *
 * Les mêmes garanties que pour une séance, et pour la même raison : créer ou
 * lever une contrainte change ce que l'application proposera pendant des
 * semaines. Verrou sur les contraintes de l'athlète, empreinte revérifiée sur
 * l'état verrouillé, écriture et statut dans la même transaction.
 */
async function appliquerSurContrainte(
  userId: string,
  proposition: typeof coachPropositions.$inferSelect,
): Promise<Application> {
  const operation = proposition.parametres as unknown as OperationContrainte;
  const date = new Date().toISOString().slice(0, 10);

  try {
    return await db.transaction(async (tx) => {
      await tx
        .select({ id: contraintes.id })
        .from(contraintes)
        .where(eq(contraintes.userId, userId))
        .for("update");

      const actives = await contraintesActives(userId, tx, date);
      const muscle =
        operation.type === "creer_contrainte"
          ? versMuscle(operation.muscle)
          : actives.find((c) => c.id === operation.contrainteId)?.muscle ?? null;

      if (!muscle) {
        throw new PropositionRefusee(
          "Cette contrainte n'est plus active : elle a peut-être déjà été levée.",
        );
      }

      if (empreinteContrainte(muscle, actives) !== proposition.empreinte) {
        throw new PropositionRefusee(
          "Tes contraintes ont changé depuis cette proposition. Redemande-la au coach.",
        );
      }

      let apercu = proposition.apercu as unknown as Apercu;

      if (operation.type === "creer_contrainte") {
        const severite = severiteRecevable(operation.severite);
        if (severite === null) throw new PropositionRefusee("Sévérité hors bornes.", 422);

        await tx.insert(contraintes).values({
          userId,
          muscle,
          type: "zone_sensible",
          severite,
          notes: operation.notes ?? null,
          dateDebut: date,
          dateFin: null,
          aReevaluerLe: decalerDe(date, REEVALUATION_JOURS),
          origine: "coach",
        });
      } else {
        const cible = actives.find((c) => c.id === operation.contrainteId)!;
        const transition = reevaluer(cible, "resolu", date);
        await tx
          .update(contraintes)
          .set({
            dateFin: transition.dateFin,
            aReevaluerLe: transition.aReevaluerLe,
            updatedAt: new Date(),
          })
          .where(and(eq(contraintes.id, cible.id), eq(contraintes.userId, userId)));
        apercu = { ...apercu, resume: `${apercu.resume} ${transition.resume}` };
      }

      await tx
        .update(coachPropositions)
        .set({
          statut: "appliquee",
          decideLe: new Date(),
          resultat: { apercu: apercu as unknown as Record<string, unknown> },
        })
        .where(eq(coachPropositions.id, proposition.id));

      await PANNES.avantCommit?.();
      return { id: proposition.id, apercu, avertissements: [] };
    });
  } catch (erreur) {
    const raison =
      erreur instanceof PropositionRefusee
        ? erreur.raison
        : erreur instanceof Error
          ? erreur.message
          : String(erreur);
    const encore = await db.query.coachPropositions.findFirst({
      where: eq(coachPropositions.id, proposition.id),
    });
    if (encore?.statut === "en_attente") {
      await marquer(proposition.id, "echouee", { raison });
    }
    throw erreur;
  }
}
