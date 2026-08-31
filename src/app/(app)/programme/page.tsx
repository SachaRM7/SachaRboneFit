import { redirect } from "next/navigation";
import { db } from "@/db/client";
import {
  programmeBlocs, seanceTemplates, exerciseInTemplate, exerciseInstances, gyms, users,
} from "@/db/schema";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { GestionProgramme, type SeanceProgramme, type MachineDisponible } from "@/components/programme/GestionProgramme";
import { CreationBlocForm } from "@/components/programme/CreationBlocForm";
import { VueCycle, OptionsAvancees } from "@/components/programme/VueCycle";
import { vueDuProgramme } from "@/services/cycle";

/**
 * Programme : comprendre et inspecter la programmation.
 *
 * Le rôle de cet écran est tranché. Il répond à « qu'est-ce qui est prévu, et
 * pourquoi ». Il ne double pas l'Accueil, qui reste le parcours opérationnel :
 * une séance se lance depuis là, ou depuis son propre détail. Il ne double pas
 * non plus Progression, qui répond à « qu'est-ce qui s'est passé ».
 *
 * L'écran était un CRUD — bloc, séances, exercices, séries, répétitions, RPE,
 * tempo, repos, le tout déplié d'emblée. Cette capacité n'est pas supprimée :
 * elle passe derrière « Édition avancée », là où elle sert.
 */
export default async function ProgrammePage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  // Sans onboarding terminé, il n'y a rien à programmer : on y renvoie plutôt
  // que d'afficher un écran vide expliquant qu'il n'y a rien.
  const profil = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { onboardingTermineLe: true },
  });
  if (!profil?.onboardingTermineLe) redirect("/bienvenue");

  const vue = await vueDuProgramme(userId);

  const bloc = await db.query.programmeBlocs.findFirst({
    where: and(and(eq(programmeBlocs.userId, userId), isNull(programmeBlocs.archiveLe)), eq(programmeBlocs.actif, true)),
  });

  const [instances, salles] = await Promise.all([
    db.query.exerciseInstances.findMany({
      where: isNull(exerciseInstances.archiveLe),
      with: { exercise: true },
    }),
    db.query.gyms.findMany({ where: isNull(gyms.archiveLe) }),
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
    <div className="min-h-dvh bg-papier text-encre p-4 pb-24 space-y-5">
      <h1 className="text-2xl font-bold">Programme</h1>

      <VueCycle vue={vue} />

      <OptionsAvancees>
        <div className="space-y-4">
          {!bloc && <CreationBlocForm />}
          <GestionProgramme
            bloc={
              bloc
                ? { id: bloc.id, nom: bloc.nom, typeCycle: bloc.typeCycle, semaineActuelle: bloc.semaineActuelle }
                : null
            }
            seances={seances}
            machines={machines}
          />
        </div>
      </OptionsAvancees>
    </div>
  );
}
