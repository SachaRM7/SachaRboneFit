import { db } from "@/db/client";
import {
  exerciseInTemplate,
  exerciseInstances,
  programmeBlocs,
  seanceTemplates,
} from "@/db/schema";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { prochaineSeance } from "@/services/programmes";
import {
  normalizeDraftExercises,
  targetRpe,
  type SessionDraft,
  type SessionScope,
} from "@/lib/session-composer/draft";

const NOM_BLOC_LIBRE = "Séances libres";
const TYPE_BLOC_LIBRE = "libre";

export class CompositionRefusee extends Error {
  constructor(
    readonly reason: string,
    readonly status = 409,
  ) {
    super(reason);
    this.name = "CompositionRefusee";
  }
}

export interface SavedComposition {
  templateId: string;
  scope: SessionScope["type"];
  startUrl: string;
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function existingDraft(userId: string, draftId: string) {
  const [existing] = await db
    .select({ id: seanceTemplates.id, blocId: seanceTemplates.blocId, active: programmeBlocs.actif })
    .from(seanceTemplates)
    .innerJoin(programmeBlocs, eq(programmeBlocs.id, seanceTemplates.blocId))
    .where(and(eq(seanceTemplates.id, draftId), eq(programmeBlocs.userId, userId)))
    .limit(1);
  return existing ?? null;
}

function resultFor(templateId: string, scope: SessionScope, gymId: string): SavedComposition {
  if (scope.type === "program") {
    return { templateId, scope: scope.type, startUrl: "/programme" };
  }
  const query = new URLSearchParams({ gymId });
  if (scope.type === "replace_next") {
    query.set("rotationTemplateId", scope.rotationTemplateId);
  }
  return {
    templateId,
    scope: scope.type,
    startUrl: `/sessions/new/${templateId}?${query}`,
  };
}

async function activeBlock(userId: string) {
  return db.query.programmeBlocs.findFirst({
    where: and(
      eq(programmeBlocs.userId, userId),
      eq(programmeBlocs.actif, true),
      isNull(programmeBlocs.archiveLe),
    ),
  });
}

async function freeBlock(tx: Transaction, userId: string) {
  const current = await tx.query.programmeBlocs.findFirst({
    where: and(
      eq(programmeBlocs.userId, userId),
      eq(programmeBlocs.actif, false),
      eq(programmeBlocs.typeCycle, TYPE_BLOC_LIBRE),
      isNull(programmeBlocs.archiveLe),
    ),
    orderBy: [desc(programmeBlocs.createdAt)],
  });
  if (current) return current;

  const today = new Date().toISOString().slice(0, 10);
  const [created] = await tx.insert(programmeBlocs).values({
    userId,
    nom: NOM_BLOC_LIBRE,
    dateDebut: today,
    typeCycle: TYPE_BLOC_LIBRE,
    semaineActuelle: 1,
    actif: false,
  }).returning();
  if (!created) throw new CompositionRefusee("La séance n'a pas pu être préparée.", 500);
  return created;
}

async function verifyEquipment(draft: SessionDraft) {
  const requested = new Set(draft.exercises.map((exercise) => exercise.exerciseInstanceId));
  const found = await db.query.exerciseInstances.findMany({
    where: and(
      eq(exerciseInstances.gymId, draft.gymId),
      isNull(exerciseInstances.archiveLe),
    ),
  });
  const usable = new Set(found.map((instance) => instance.id));
  const missing = [...requested].filter((id) => !usable.has(id));
  if (missing.length > 0) {
    throw new CompositionRefusee(
      "Le matériel de cette séance n'est plus disponible dans le lieu choisi.",
      409,
    );
  }
}

export async function saveSessionComposition(input: {
  userId: string;
  draft: SessionDraft;
  scope: SessionScope;
}): Promise<SavedComposition> {
  const { userId, draft, scope } = input;

  const already = await existingDraft(userId, draft.id);
  if (already) return resultFor(already.id, scope, draft.gymId);

  await verifyEquipment(draft);

  let destination = await activeBlock(userId);
  if (scope.type === "program" && !destination) {
    throw new CompositionRefusee(
      "Crée d'abord un programme pour y ajouter cette séance.",
      409,
    );
  }

  if (scope.type === "replace_next") {
    const next = await prochaineSeance(userId);
    if (!next || next.template.id !== scope.rotationTemplateId) {
      throw new CompositionRefusee(
        "La séance prévue a changé. Relis la nouvelle proposition avant de remplacer.",
        409,
      );
    }
  }

  const exercises = normalizeDraftExercises(draft.exercises);

  return db.transaction(async (tx) => {
    const duplicate = await tx.query.seanceTemplates.findFirst({
      where: eq(seanceTemplates.id, draft.id),
    });
    if (duplicate) {
      const block = await tx.query.programmeBlocs.findFirst({
        where: and(eq(programmeBlocs.id, duplicate.blocId), eq(programmeBlocs.userId, userId)),
      });
      if (!block) throw new CompositionRefusee("Ce brouillon appartient à un autre compte.", 403);
      return resultFor(duplicate.id, scope, draft.gymId);
    }

    if (scope.type !== "program") destination = await freeBlock(tx, userId);
    if (!destination) throw new CompositionRefusee("Aucun programme actif.", 409);

    const existingTemplates = await tx.query.seanceTemplates.findMany({
      where: eq(seanceTemplates.blocId, destination.id),
      orderBy: [asc(seanceTemplates.ordreDansSemaine)],
    });
    const nextOrder = (existingTemplates.at(-1)?.ordreDansSemaine ?? 0) + 1;

    await tx.insert(seanceTemplates).values({
      id: draft.id,
      blocId: destination.id,
      lettre: draft.letter.trim().toUpperCase(),
      nom: draft.name.trim(),
      ordreDansSemaine: nextOrder,
    });

    await tx.insert(exerciseInTemplate).values(exercises.map((exercise) => ({
      seanceTemplateId: draft.id,
      exerciseInstanceId: exercise.exerciseInstanceId,
      ordre: exercise.order + 1,
      seriesCibles: exercise.sets,
      fourchetteRepsMin: exercise.repMin,
      fourchetteRepsMax: exercise.repMax,
      rpeCible: targetRpe(exercise.targetRir),
      tempo: exercise.tempo?.trim() || null,
      reposSecondes: exercise.restSeconds,
      /*
       * La charge programmee, quand elle a ete declaree.
       *
       * `null` sinon — jamais un 0 : la double progression prend le relais des
       * la premiere serie saisie, et c'est `set_logs` qui fait reference.
       *
       * Rien n'est marque « a confirmer » ici : le compositeur affiche toutes
       * ces valeurs dans son formulaire avant d'enregistrer, y compris celles
       * que Zod a completees par defaut. L'utilisateur les a vues.
       */
      chargeCible: exercise.chargeCible ?? null,
    })));

    return resultFor(draft.id, scope, draft.gymId);
  });
}
