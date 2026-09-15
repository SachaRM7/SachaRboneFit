import { db } from "@/db/client";
import { programmeBlocs, seanceTemplates, type SeanceTemplate } from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";

export class ProgrammeManagementError extends Error {
  constructor(
    readonly reason: string,
    readonly status = 409,
  ) {
    super(reason);
    this.name = "ProgrammeManagementError";
  }
}

async function ownedBlock(userId: string, blocId: string) {
  const block = await db.query.programmeBlocs.findFirst({
    where: and(
      eq(programmeBlocs.id, blocId),
      eq(programmeBlocs.userId, userId),
      isNull(programmeBlocs.archiveLe),
    ),
  });
  if (!block) throw new ProgrammeManagementError("Programme introuvable.", 404);
  return block;
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Renumérote les séances d'un programme, dans l'ordre reçu.
 *
 * `ordre_dans_semaine` pilote la rotation : deux séances au même rang rendraient
 * « la prochaine séance » dépendante de l'ordre de retour de Postgres. Aucune
 * écriture de rang ne se fait donc sans renumérotation complète.
 */
async function renumoterSeances(tx: Transaction, blocId: string) {
  const seances = await tx.query.seanceTemplates.findMany({
    where: eq(seanceTemplates.blocId, blocId),
    orderBy: [asc(seanceTemplates.ordreDansSemaine), asc(seanceTemplates.createdAt)],
  });

  for (const [index, seance] of seances.entries()) {
    const rang = index + 1;
    if (seance.ordreDansSemaine !== rang) {
      await tx
        .update(seanceTemplates)
        .set({ ordreDansSemaine: rang, updatedAt: new Date() })
        .where(eq(seanceTemplates.id, seance.id));
    }
  }
}

/**
 * Place `templateId` au rang demandé dans son programme, puis renumérote.
 *
 * Le rang est une POSITION (1 = première séance de la rotation). Une position
 * hors bornes est ramenée dans le programme : ce n'est pas une erreur de
 * l'utilisateur, c'est la même intention exprimée autrement.
 */
async function placerSeance(tx: Transaction, templateId: string, blocId: string, position: number) {
  const seances = await tx.query.seanceTemplates.findMany({
    where: eq(seanceTemplates.blocId, blocId),
    orderBy: [asc(seanceTemplates.ordreDansSemaine), asc(seanceTemplates.createdAt)],
  });

  const ordre = seances.filter((s) => s.id !== templateId).map((s) => s.id);
  const rang = Math.min(Math.max(Math.trunc(position), 1), ordre.length + 1);
  ordre.splice(rang - 1, 0, templateId);

  for (const [index, id] of ordre.entries()) {
    await tx
      .update(seanceTemplates)
      .set({ ordreDansSemaine: index + 1, updatedAt: new Date() })
      .where(eq(seanceTemplates.id, id));
  }
}

/** Un seul programme pilote la rotation à la fois. */
export async function activerProgramme(userId: string, blocId: string) {
  await ownedBlock(userId, blocId);

  return db.transaction(async (tx) => {
    await tx
      .update(programmeBlocs)
      .set({ actif: false, updatedAt: new Date() })
      .where(eq(programmeBlocs.userId, userId));

    const [active] = await tx
      .update(programmeBlocs)
      .set({ actif: true, updatedAt: new Date() })
      .where(
        and(
          eq(programmeBlocs.id, blocId),
          eq(programmeBlocs.userId, userId),
          isNull(programmeBlocs.archiveLe),
        ),
      )
      .returning();

    if (!active) throw new ProgrammeManagementError("Programme introuvable.", 404);
    return active;
  });
}

export interface ModificationSeance {
  /** Déplace la séance vers un autre programme. Inchangé si absent. */
  destinationBlocId?: string;
  nom?: string;
  lettre?: string;
  /** Rang visé dans la rotation, à partir de 1. */
  ordre?: number;
}

/**
 * Renomme, déplace et/ou réordonne une séance de programme.
 *
 * Une seule transaction pour les trois : l'ancien chemin ne savait que
 * déplacer, et renommer une séance déplacée aurait demandé deux appels HTTP dont
 * le second pouvait échouer — laissant la séance dans le mauvais programme avec
 * l'ancien nom, sans que rien ne le signale.
 *
 * Le `templateId` lui-même ne change JAMAIS. C'est lui qui relie les séances
 * déjà réalisées, `session_plan_items` et la rotation : le recréer pour le
 * renommer aurait coupé l'historique de son origine.
 */
export async function modifierSeanceTemplate(
  userId: string,
  templateId: string,
  modifications: ModificationSeance,
): Promise<SeanceTemplate> {
  const sourceTemplate = await db.query.seanceTemplates.findFirst({
    where: eq(seanceTemplates.id, templateId),
  });
  if (!sourceTemplate) throw new ProgrammeManagementError("Séance introuvable.", 404);

  const source = await ownedBlock(userId, sourceTemplate.blocId);
  const destination = modifications.destinationBlocId
    && modifications.destinationBlocId !== source.id
    ? await ownedBlock(userId, modifications.destinationBlocId)
    : source;

  return db.transaction(async (tx) => {
    const set: Partial<typeof seanceTemplates.$inferInsert> = {};
    if (modifications.nom !== undefined) set.nom = modifications.nom;
    if (modifications.lettre !== undefined) set.lettre = modifications.lettre;

    if (destination.id !== source.id) {
      const cibles = await tx.query.seanceTemplates.findMany({
        where: eq(seanceTemplates.blocId, destination.id),
        orderBy: [asc(seanceTemplates.ordreDansSemaine)],
      });
      set.blocId = destination.id;
      set.ordreDansSemaine = (cibles.at(-1)?.ordreDansSemaine ?? 0) + 1;
    }

    if (Object.keys(set).length > 0) {
      const [ecrite] = await tx
        .update(seanceTemplates)
        .set({ ...set, updatedAt: new Date() })
        .where(eq(seanceTemplates.id, templateId))
        .returning();
      if (!ecrite) throw new ProgrammeManagementError("Modification impossible.", 500);
    }

    if (destination.id !== source.id) {
      await renumoterSeances(tx, destination.id);
      await renumoterSeances(tx, source.id);
    }

    if (modifications.ordre !== undefined) {
      await placerSeance(tx, templateId, destination.id, modifications.ordre);
    }

    const finale = await tx.query.seanceTemplates.findFirst({
      where: eq(seanceTemplates.id, templateId),
    });
    if (!finale) throw new ProgrammeManagementError("Modification impossible.", 500);
    return finale;
  });
}

/**
 * Déplace le template lui-même : son id reste identique, donc les séances déjà
 * réalisées et les session_plan_items gardent leur provenance historique.
 * Seuls le bloc parent et les rangs de rotation changent.
 */
export async function deplacerSeanceVersProgramme(
  userId: string,
  templateId: string,
  destinationBlocId: string,
) {
  return modifierSeanceTemplate(userId, templateId, { destinationBlocId });
}
