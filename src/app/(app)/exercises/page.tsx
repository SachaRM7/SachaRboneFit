import { redirect } from "next/navigation";
import Link from "next/link";
import { EnTeteSecondaire } from "@/components/layout/EnTeteSecondaire";
import { db } from "@/db/client";
import { exercises, exerciseInstances, gyms } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import {
  ExerciseLibrary,
  type ExerciceAvecInstances,
} from "@/components/exercises/ExerciseLibrary";

export default async function ExercisesPage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  // Les instances sont chargees pour permettre le filtrage par salle : sans elles,
  // la bibliotheque affichait le catalogue entier quelle que soit la salle.
  const [tousExercices, instances, salles] = await Promise.all([
    db.query.exercises.findMany(),
    db.query.exerciseInstances.findMany({
      where: isNull(exerciseInstances.archiveLe),
    }),
    db.query.gyms.findMany({ where: isNull(gyms.archiveLe) }),
  ]);

  const instancesParExercice = new Map<
    string,
    ExerciceAvecInstances["instances"]
  >();
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
        <EnTeteSecondaire
          titre="Banque d’exercices"
          vers="/settings"
          libelleRetour="Retour à Mon espace"
        />
      </div>
      <p className="px-4 pb-5 text-encre-2 text-sm">
        Explore les mouvements, les muscles sollicités et les consignes
        disponibles pour chaque exercice.
      </p>
      <Link
        href="/exercises/3d"
        className="mx-4 mb-5 flex items-center justify-between gap-4 rounded-2xl bg-[#273b2d] p-5 text-white"
      >
        <span>
          <span className="block text-xs uppercase tracking-widest opacity-70">
            Nouveau · prototype
          </span>
          <strong className="mt-1 block text-lg">
            Explore le mouvement en 3D
          </strong>
          <span className="mt-1 block text-xs opacity-80">
            Trois exercices, tous les angles, à ton rythme.
          </span>
        </span>
        <span aria-hidden className="text-2xl">
          ↗
        </span>
      </Link>
      <ExerciseLibrary
        exercises={avecInstances}
        salles={salles.map((g) => ({ id: g.id, nom: g.nom }))}
      />
    </div>
  );
}
