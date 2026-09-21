import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { exerciseInTemplate, exerciseInstances, seanceTemplates } from "@/db/schema";
import { dureeEstimeeMinutes } from "@/lib/engine/validation-seance";

/**
 * Lecture user-scoped d'une séance programmée.
 *
 * La page Séances, la vue de consultation et l'éditeur doivent parler de la
 * même ligne de programme. Cette lecture est donc centralisée ici : elle
 * joint le gabarit, ses exercices et les métadonnées de mouvement sans
 * exposer une séance appartenant à un autre compte.
 */
export interface SeanceProgrammeDetail {
  id: string;
  blocId: string;
  programmeNom: string;
  programmeType: string;
  lettre: string;
  nom: string;
  ordreDansSemaine: number;
  exercices: SeanceProgrammeDetailExercice[];
  muscles: string[];
  seriesTotales: number;
  dureeEstimeeMinutes: number;
}

export interface SeanceProgrammeDetailExercice {
  ligneId: string;
  ordre: number;
  exerciseInstanceId: string;
  exerciseId: string;
  nom: string;
  slug: string | null;
  machineNom: string;
  salleNom: string;
  pilier: string;
  musclesPrincipaux: string[];
  musclesSecondaires: string[];
  seriesCibles: number;
  fourchetteRepsMin: number;
  fourchetteRepsMax: number;
  rpeCible: number | null;
  tempo: string | null;
  reposSecondes: number | null;
  chargeCible: number | null;
}

export async function lireSeanceProgramme(
  userId: string,
  templateId: string,
): Promise<SeanceProgrammeDetail | null> {
  const template = await db.query.seanceTemplates.findFirst({
    where: eq(seanceTemplates.id, templateId),
    with: { bloc: true },
  });

  if (!template?.bloc || template.bloc.userId !== userId || template.bloc.archiveLe) {
    return null;
  }

  const lignes = await db.query.exerciseInTemplate.findMany({
    where: and(
      eq(exerciseInTemplate.seanceTemplateId, templateId),
      isNull(exerciseInTemplate.archiveLe),
    ),
    orderBy: [asc(exerciseInTemplate.ordre)],
    with: {
      exerciseInstance: { with: { exercise: true, gym: true } },
    },
  });

  const exercices = lignes
    .filter((ligne) => ligne.exerciseInstance?.exercise)
    .map((ligne) => {
      const instance = ligne.exerciseInstance!;
      const exercise = instance.exercise!;
      return {
        ligneId: ligne.id,
        ordre: ligne.ordre,
        exerciseInstanceId: instance.id,
        exerciseId: exercise.id,
        nom: exercise.nom,
        slug: exercise.slug ?? null,
        machineNom: instance.machineNom,
        salleNom: instance.gym?.nom ?? "",
        pilier: exercise.pilier,
        musclesPrincipaux: exercise.musclesPrincipaux ?? [],
        musclesSecondaires: exercise.musclesSecondaires ?? [],
        seriesCibles: ligne.seriesCibles,
        fourchetteRepsMin: ligne.fourchetteRepsMin,
        fourchetteRepsMax: ligne.fourchetteRepsMax,
        rpeCible: ligne.rpeCible,
        tempo: ligne.tempo,
        reposSecondes: ligne.reposSecondes,
        chargeCible: ligne.chargeCible,
      } satisfies SeanceProgrammeDetailExercice;
    });

  const muscles = [...new Set(exercices.flatMap((exercice) => [
    ...exercice.musclesPrincipaux,
    ...exercice.musclesSecondaires,
  ]))];
  const seriesTotales = exercices.reduce((total, exercice) => total + exercice.seriesCibles, 0);
  const duree = dureeEstimeeMinutes(exercices.map((exercice) => ({
    series: exercice.seriesCibles,
    reposSecondes: exercice.reposSecondes ?? 120,
  })));

  return {
    id: template.id,
    blocId: template.bloc.id,
    programmeNom: template.bloc.nom,
    programmeType: template.bloc.typeCycle,
    lettre: template.lettre,
    nom: template.nom,
    ordreDansSemaine: template.ordreDansSemaine,
    exercices,
    muscles,
    seriesTotales,
    dureeEstimeeMinutes: duree,
  };
}

/** Machines visibles par l'utilisateur pour le sélecteur de l'éditeur. */
export async function machinesPourProgramme() {
  const instances = await db.query.exerciseInstances.findMany({
    where: isNull(exerciseInstances.archiveLe),
    with: { exercise: true, gym: true },
  });

  return instances
    .filter((instance) => instance.exercise)
    .map((instance) => ({
      id: instance.id,
      exerciseId: instance.exercise!.id,
      nom: instance.exercise!.nom,
      slug: instance.exercise!.slug ?? null,
      machineNom: instance.machineNom,
      salleNom: instance.gym?.nom ?? "",
    }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr") || a.machineNom.localeCompare(b.machineNom, "fr"));
}
