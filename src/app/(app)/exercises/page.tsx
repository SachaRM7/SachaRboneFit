import { redirect } from "next/navigation";
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
    db.query.exercises.findMany({ where: eq(exercises.userId, userId) }),
    db.query.exerciseInstances.findMany({ where: and(eq(exerciseInstances.userId, userId), isNull(exerciseInstances.archiveLe)) }),
    db.query.gyms.findMany({ where: and(eq(gyms.userId, userId), isNull(gyms.archiveLe)) }),
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
      <h1 className="text-xl font-bold text-encre p-4">Exercices</h1>
      <ExerciseLibrary
        exercises={avecInstances}
        salles={salles.map((g) => ({ id: g.id, nom: g.nom }))}
      />
    </div>
  );
}
