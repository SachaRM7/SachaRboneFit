import { db } from "@/db/client";
import {
  coachPropositions, exerciseInTemplate, exerciseInstances, exercises,
  programmeBlocs, seanceTemplates,
} from "@/db/schema";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import {
  BORNES, NOUVELLE_LIGNE, construireApercu, empreinteDe, estPerimee, projeter,
  type Apercu, type LigneProgramme, type Operation,
} from "@/lib/coach/propositions";
import { validerSeanceComplete, type SeanceAValider } from "./validation";

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
/** Le client de base, ou la transaction en cours : les lectures acceptent les deux. */
type Lecteur = typeof db | Transaction;

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
    .where(eq(exerciseInTemplate.seanceTemplateId, gabarit.id))
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
        ? and(isNull(exerciseInstances.archiveLe), eq(exerciseInstances.gymId, gymId))
        : isNull(exerciseInstances.archiveLe),
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
 * Applique une proposition confirmée.
 *
 * L'ordre des contrôles compte. On vérifie d'abord que la proposition existe,
 * qu'elle est à cet utilisateur, qu'elle attend encore une décision et qu'elle
 * n'a pas expiré. Puis, dans la transaction et sur l'état verrouillé, que la
 * séance n'a pas changé depuis le calcul : c'est la seule vérification qui
 * ferme la fenêtre entre l'affichage et le clic.
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

  const operation = proposition.parametres as unknown as Operation;

  try {
    const resultat = await db.transaction(async (tx) => {
      // Verrou sur les lignes de la séance : deux confirmations simultanées ne
      // doivent pas s'appliquer chacune sur l'état que l'autre est en train de
      // modifier.
      await tx
        .select({ id: exerciseInTemplate.id })
        .from(exerciseInTemplate)
        .where(eq(exerciseInTemplate.seanceTemplateId, proposition.seanceTemplateId))
        .for("update");

      const cible = await lireCible(userId, proposition.seanceTemplateId, tx);
      if (!cible) throw new PropositionRefusee("Cette séance a été supprimée.", 404);

      if (empreinteDe(cible.lignes) !== proposition.empreinte) {
        throw new PropositionRefusee(
          "La séance a changé depuis cette proposition. Redemande-la au coach pour qu'elle porte sur l'état actuel.",
        );
      }

      const machines = await machinesDeLaSalle(cible.gymId, tx);
      const projection = projeter(cible.lignes, operation, (id) => machines.get(id) ?? null);
      if (projection.refus) throw new PropositionRefusee(projection.refus, 422);

      await ecrire(tx, proposition.seanceTemplateId, cible.lignes, projection.lignes);

      return { cible, projection };
    });

    // Contrôle après écriture, sur ce qui est réellement en base — pas sur la
    // projection. Une écriture qui produirait autre chose que ce qui a été
    // montré doit se voir ici, pas à la séance suivante.
    const apres = await lireCible(userId, proposition.seanceTemplateId);
    const controle = apres
      ? await controler(userId, apres.gymId, apres.lignes)
      : { bloquants: ["Séance illisible après application"], avertissements: [] };

    const apercu = construireApercu(
      resultat.cible.lignes,
      apres?.lignes ?? resultat.projection.lignes,
      controle.avertissements,
    );

    if (controle.bloquants.length > 0) {
      // On ne laisse pas une séance invalide derrière soi : l'état d'avant est
      // connu ligne à ligne, il est remis tel quel.
      await restaurer(proposition.seanceTemplateId, resultat.cible.lignes, apres?.lignes ?? []);
      await marquer(propositionId, "echouee", {
        raison: "Contrôles refusés après application, séance restaurée",
        bloquants: controle.bloquants,
      });
      throw new PropositionRefusee(
        `Appliquée puis annulée : ${controle.bloquants.join(" ; ")}`,
        422,
      );
    }

    await marquer(propositionId, "appliquee", {
      avertissements: controle.avertissements,
      apercu: apercu as unknown as Record<string, unknown>,
    });

    return { id: propositionId, apercu, avertissements: controle.avertissements };
  } catch (erreur) {
    if (erreur instanceof PropositionRefusee) {
      if (proposition.statut === "en_attente") {
        const encore = await db.query.coachPropositions.findFirst({
          where: eq(coachPropositions.id, propositionId),
        });
        if (encore?.statut === "en_attente") {
          await marquer(propositionId, "echouee", { raison: erreur.raison });
        }
      }
      throw erreur;
    }
    await marquer(propositionId, "echouee", {
      raison: erreur instanceof Error ? erreur.message : String(erreur),
    });
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

/**
 * Remet la séance dans l'état d'avant.
 *
 * Utilisée quand les contrôles refusent le résultat d'une application. Elle ne
 * réécrit pas la séance en bloc : elle défait, ligne par ligne, ce que
 * l'écriture a fait. Une ligne ajoutée est supprimée — elle vient de naître,
 * rien ne la référence encore ; une ligne modifiée retrouve ses valeurs
 * d'origine, avec son identifiant, donc sans casser ce qui pointe dessus.
 */
async function restaurer(
  seanceTemplateId: string,
  avant: LigneProgramme[],
  actuelles: LigneProgramme[],
): Promise<void> {
  const parIdAvant = new Map(avant.map((l) => [l.id, l]));

  await db.transaction(async (tx) => {
    for (const l of actuelles) {
      if (!parIdAvant.has(l.id)) {
        await tx.delete(exerciseInTemplate).where(eq(exerciseInTemplate.id, l.id));
      }
    }
    for (const l of avant) {
      await tx
        .update(exerciseInTemplate)
        .set({
          ordre: l.ordre,
          exerciseInstanceId: l.exerciseInstanceId,
          seriesCibles: l.seriesCibles,
          fourchetteRepsMin: l.repsMin,
          fourchetteRepsMax: l.repsMax,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(exerciseInTemplate.id, l.id),
            eq(exerciseInTemplate.seanceTemplateId, seanceTemplateId),
          ),
        );
    }
  });
}
