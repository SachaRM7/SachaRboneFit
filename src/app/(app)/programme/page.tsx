import { redirect } from "next/navigation";
import { db } from "@/db/client";
import {
  programmeBlocs, seanceTemplates, exerciseInTemplate, exerciseInstances, gyms,
} from "@/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { GestionProgramme, type SeanceProgramme, type MachineDisponible } from "@/components/programme/GestionProgramme";
import { CreationBlocForm } from "@/components/programme/CreationBlocForm";

/**
 * Gestion du programme.
 *
 * Aucun chemin applicatif ne permettait de créer un bloc, une séance ou d'y
 * programmer un exercice : seul `npm run seed` en produisait. L'application
 * n'était donc pas utilisable sans passer par un terminal.
 */
export default async function ProgrammePage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const bloc = await db.query.programmeBlocs.findFirst({
    where: and(eq(programmeBlocs.userId, userId), eq(programmeBlocs.actif, true)),
  });

  const [instances, salles] = await Promise.all([
    db.query.exerciseInstances.findMany({
      where: eq(exerciseInstances.userId, userId),
      with: { exercise: true },
    }),
    db.query.gyms.findMany({ where: eq(gyms.userId, userId) }),
  ]);

  const nomSalle = new Map(salles.map((g) => [g.id, g.nom]));

  const machines: MachineDisponible[] = instances
    .map((i) => ({
      id: i.id,
      machineNom: i.machineNom,
      exerciceNom: i.exercise?.nom ?? "",
      exerciceSlug: i.exercise?.slug ?? null,
      salleNom: nomSalle.get(i.gymId) ?? "",
      pilier: i.exercise?.pilier ?? "",
    }))
    .sort((a, b) => a.salleNom.localeCompare(b.salleNom) || a.exerciceNom.localeCompare(b.exerciceNom));

  let seances: SeanceProgramme[] = [];

  if (bloc) {
    const templates = await db.query.seanceTemplates.findMany({
      where: eq(seanceTemplates.blocId, bloc.id),
      orderBy: [asc(seanceTemplates.ordreDansSemaine)],
    });

    const lignes = templates.length
      ? await db.query.exerciseInTemplate.findMany({
          where: inArray(exerciseInTemplate.seanceTemplateId, templates.map((t) => t.id)),
          orderBy: [asc(exerciseInTemplate.ordre)],
        })
      : [];

    const instanceParId = new Map(instances.map((i) => [i.id, i]));

    seances = templates.map((t) => ({
      id: t.id,
      lettre: t.lettre,
      nom: t.nom,
      ordreDansSemaine: t.ordreDansSemaine,
      exercices: lignes
        .filter((l) => l.seanceTemplateId === t.id)
        .map((l) => {
          const instance = instanceParId.get(l.exerciseInstanceId);
          return {
            ligneId: l.id,
            ordre: l.ordre,
            machineNom: instance?.machineNom ?? "",
            exerciceNom: instance?.exercise?.nom ?? "",
            exerciceSlug: instance?.exercise?.slug ?? null,
            seriesCibles: l.seriesCibles,
            fourchetteRepsMin: l.fourchetteRepsMin,
            fourchetteRepsMax: l.fourchetteRepsMax,
            rpeCible: l.rpeCible,
            tempo: l.tempo,
            reposSecondes: l.reposSecondes,
          };
        }),
    }));
  }

  return (
    <div className="p-4 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Programme</h1>
        <p className="text-zinc-500 text-sm mt-1">
          {bloc ? "Bloc actif, séances et exercices programmés." : "Crée un bloc pour commencer."}
        </p>
      </div>

      {!bloc && <CreationBlocForm />}

      <GestionProgramme
        bloc={bloc ? { id: bloc.id, nom: bloc.nom, typeCycle: bloc.typeCycle, semaineActuelle: bloc.semaineActuelle } : null}
        seances={seances}
        machines={machines}
      />
    </div>
  );
}
