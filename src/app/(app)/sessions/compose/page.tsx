import { redirect } from "next/navigation";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { db } from "@/db/client";
import { exerciseInTemplate, exerciseInstances, gyms, programmeBlocs, seanceTemplates, users } from "@/db/schema";
import { prochaineSeance } from "@/services/programmes";
import { rpeVersReserve } from "@/lib/engine/reserve";
import { SessionComposer } from "@/components/session-composer/SessionComposer";

export default async function ComposeSessionPage({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const { source: sourceId } = await searchParams;
  const [profile, locations, instances, next, activeBlock] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, userId) }),
    db.query.gyms.findMany({ where: isNull(gyms.archiveLe), orderBy: [asc(gyms.nom)] }),
    db.query.exerciseInstances.findMany({ where: isNull(exerciseInstances.archiveLe), with: { exercise: true } }),
    prochaineSeance(userId),
    db.query.programmeBlocs.findFirst({
      where: and(eq(programmeBlocs.userId, userId), eq(programmeBlocs.actif, true), isNull(programmeBlocs.archiveLe)),
    }),
  ]);

  const templates = activeBlock
    ? await db.query.seanceTemplates.findMany({ where: eq(seanceTemplates.blocId, activeBlock.id), orderBy: [asc(seanceTemplates.ordreDansSemaine)] })
    : [];
  const lines = templates.length
    ? await db.query.exerciseInTemplate.findMany({
        where: and(inArray(exerciseInTemplate.seanceTemplateId, templates.map((template) => template.id)), isNull(exerciseInTemplate.archiveLe)),
        orderBy: [asc(exerciseInTemplate.ordre)],
      })
    : [];
  const source = sourceId ? templates.find((template) => template.id === sourceId) : undefined;

  return (
    <SessionComposer
      defaultGymId={source
        ? instances.find((instance) => lines.some((line) => line.seanceTemplateId === source.id && line.exerciseInstanceId === instance.id))?.gymId ?? ""
        : profile?.prefSalleParDefautId ?? locations[0]?.id ?? ""}
      gyms={locations.map((gym) => ({ id: gym.id, name: gym.nom }))}
      machines={instances.map((instance) => ({
        id: instance.id,
        gymId: instance.gymId,
        name: instance.exercise?.nom ?? instance.machineNom,
        machineName: instance.machineNom,
        pillar: instance.exercise?.pilier ?? "",
        slug: instance.exercise?.slug ?? null,
      }))}
      source={source ? {
        id: source.id,
        name: source.nom,
        letter: source.lettre,
        exercises: lines.filter((line) => line.seanceTemplateId === source.id).map((line) => ({
          exerciseInstanceId: line.exerciseInstanceId,
          sets: line.seriesCibles,
          repMin: line.fourchetteRepsMin,
          repMax: line.fourchetteRepsMax,
          targetRir: rpeVersReserve(line.rpeCible),
          tempo: line.tempo,
          restSeconds: line.reposSecondes ?? 120,
        })),
      } : null}
      nextTemplate={next ? { id: next.template.id, name: next.template.nom } : null}
      hasActiveProgram={Boolean(activeBlock)}
    />
  );
}
