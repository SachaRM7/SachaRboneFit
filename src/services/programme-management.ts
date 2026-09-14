import { db } from "@/db/client";
import { programmeBlocs, seanceTemplates } from "@/db/schema";
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
  const destination = await ownedBlock(userId, destinationBlocId);

  const sourceTemplate = await db.query.seanceTemplates.findFirst({
    where: eq(seanceTemplates.id, templateId),
  });
  if (!sourceTemplate) throw new ProgrammeManagementError("Séance introuvable.", 404);

  const source = await ownedBlock(userId, sourceTemplate.blocId);
  if (source.id === destination.id) return sourceTemplate;

  return db.transaction(async (tx) => {
    const destinationTemplates = await tx.query.seanceTemplates.findMany({
      where: eq(seanceTemplates.blocId, destination.id),
      orderBy: [asc(seanceTemplates.ordreDansSemaine)],
    });
    const destinationOrder = (destinationTemplates.at(-1)?.ordreDansSemaine ?? 0) + 1;

    const [moved] = await tx
      .update(seanceTemplates)
      .set({
        blocId: destination.id,
        ordreDansSemaine: destinationOrder,
        updatedAt: new Date(),
      })
      .where(eq(seanceTemplates.id, templateId))
      .returning();
    if (!moved) throw new ProgrammeManagementError("Déplacement impossible.", 500);

    const sourceTemplates = await tx.query.seanceTemplates.findMany({
      where: eq(seanceTemplates.blocId, source.id),
      orderBy: [asc(seanceTemplates.ordreDansSemaine)],
    });
    for (const [index, template] of sourceTemplates.entries()) {
      const order = index + 1;
      if (template.ordreDansSemaine !== order) {
        await tx
          .update(seanceTemplates)
          .set({ ordreDansSemaine: order, updatedAt: new Date() })
          .where(eq(seanceTemplates.id, template.id));
      }
    }

    return moved;
  });
}
