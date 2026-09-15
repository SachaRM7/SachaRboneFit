import { redirect } from "next/navigation";
import { EnTeteSecondaire } from "@/components/layout/EnTeteSecondaire";
import { db } from "@/db/client";
import {
  seanceTemplates, exerciseInTemplate, exerciseInstances, gyms,
} from "@/db/schema";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { GestionProgramme, type SeanceProgramme, type MachineDisponible } from "@/components/programme/GestionProgramme";
import { ProgrammesManager } from "@/components/programme/ProgrammesManager";
import { VueCycle, OptionsAvancees } from "@/components/programme/VueCycle";
import { vueDuProgramme } from "@/services/cycle";
import { lireBlocs } from "@/services/blocs";
import { onboardingTermine } from "@/services/profil-cache";
import { MascotteCoach } from "@/components/coach/MascotteCoach";
import { resoudreMascotteProgramme } from "@/lib/coach/resoudre-mascotte";

export default async function ProgrammePage({
  searchParams,
}: {
  searchParams: Promise<{ bloc?: string }>;
}) {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");
  if (!(await onboardingTermine(userId))) redirect("/bienvenue");

  const { bloc: requestedBlocId } = await searchParams;
  const blocs = await lireBlocs(userId);
  const activeBloc = blocs.actif;
  const selectedBloc = blocs.tous.find((item) => item.id === requestedBlocId) ?? activeBloc ?? blocs.tous[0] ?? null;
  const vue = await vueDuProgramme(userId, undefined, { blocs });
  const programmeSelectionneEstActif = Boolean(selectedBloc?.actif);

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

  if (selectedBloc) {
    const templates = await db.query.seanceTemplates.findMany({
      where: eq(seanceTemplates.blocId, selectedBloc.id),
      orderBy: [asc(seanceTemplates.ordreDansSemaine)],
    });

    const lignes = templates.length
      ? await db.query.exerciseInTemplate.findMany({
          where: and(
            inArray(exerciseInTemplate.seanceTemplateId, templates.map((t) => t.id)),
            isNull(exerciseInTemplate.archiveLe),
          ),
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
            chargeCible: l.chargeCible,
          };
        }),
    }));
  }

  return (
    <div className="min-h-dvh bg-papier text-encre p-4 space-y-5">
      <EnTeteSecondaire
        titre="Programme"
        vers="/settings"
        libelleRetour="Retour à Plus"
        action={
          <MascotteCoach
            etat={resoudreMascotteProgramme()}
            taille="normal"
            presence="normale"
          />
        }
      />

      <ProgrammesManager
        programmes={blocs.tous.map((item) => ({
          id: item.id,
          nom: item.nom,
          actif: Boolean(item.actif),
          typeCycle: item.typeCycle,
        }))}
        selectedId={selectedBloc?.id ?? null}
        seances={seances.map((session) => ({ id: session.id, nom: session.nom, lettre: session.lettre }))}
      />

      <OptionsAvancees
        key={selectedBloc?.id ?? "aucun-programme"}
        initialementOuvert={Boolean(selectedBloc)}
      >
        <GestionProgramme
          bloc={
            selectedBloc
              ? { id: selectedBloc.id, nom: selectedBloc.nom, typeCycle: selectedBloc.typeCycle }
              : null
          }
          seances={seances}
          machines={machines}
        />
      </OptionsAvancees>

      {/* La vue de cycle décrit nécessairement le programme ACTIF. La montrer
          sous un autre programme sélectionné mélangeait deux contextes : la
          carte disait « Séances libres », puis le contenu décrivait PPLUL.
          Les commandes du programme sélectionné passent avant ce bilan : cet
          écran sert d'abord à composer ce que l'utilisateur vient d'ouvrir. */}
      {programmeSelectionneEstActif && <VueCycle vue={vue} />}
    </div>
  );
}
