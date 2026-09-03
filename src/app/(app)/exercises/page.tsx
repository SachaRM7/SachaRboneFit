import { redirect } from "next/navigation";
import { EnTeteSecondaire } from "@/components/layout/EnTeteSecondaire";
import { db } from "@/db/client";
import { exercises, exerciseInstances, gyms } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { ExerciseLibrary, type ExerciceAvecInstances } from "@/components/exercises/ExerciseLibrary";

export default async function ExercisesPage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  // Les instances sont chargees pour permettre le filtrage par salle : sans elles,
  // la bibliotheque affichait le catalogue entier quelle que soit la salle.
  const [tousExercices, instances, salles] = await Promise.all([
    db.query.exercises.findMany(),
    db.query.exerciseInstances.findMany({ where: isNull(exerciseInstances.archiveLe) }),
    db.query.gyms.findMany({ where: isNull(gyms.archiveLe) }),
  ]);

  const instancesParExercice = new Map<string, ExerciceAvecInstances["instances"]>();
  for (const i of instances) {
    const liste = instancesParExercice.get(i.exerciseId) ?? [];
    liste.push({ id: i.id, machineNom: i.machineNom, gymId: i.gymId });
    instancesParExercice.set(i.exerciseId, liste);
  }

  const avecInstances: ExerciceAvecInstances[] = tousExercices.map((e) => ({
    ...e,
    instances: instancesParExercice.get(e.id) ?? [],
  }));

  return (
    <div className="pb-4">
      <div className="p-4 pb-0">
        <EnTeteSecondaire titre="Bibliothèque" vers="/settings" libelleRetour="Retour à Plus" />
      </div>
      <ExerciseLibrary
        exercises={avecInstances}
        salles={salles.map((g) => ({ id: g.id, nom: g.nom }))}
      />
    </div>
  );
}
