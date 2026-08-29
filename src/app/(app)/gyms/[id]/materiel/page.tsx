import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/client";
import { gyms, exerciseInstances, exercises } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { Button } from "@/components/ui/button";
import { GestionMachines, type MachineAffichee } from "@/components/gyms/GestionMachines";
import type { ExerciceSelectionnable } from "@/components/gyms/MachineForm";
import { CATALOGUE_PAR_SLUG } from "@/lib/referentiels/catalogue";
import { ArrowLeft } from "lucide-react";

/**
 * Configuration du materiel d'une salle.
 *
 * Il n'existait aucun chemin applicatif pour equiper une salle : les machines ne
 * pouvaient venir que du script de seed. Une salle nouvellement creee restait donc
 * inutilisable.
 */
export default async function MaterielSallePage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const { id } = await params;

  const salle = await db.query.gyms.findFirst({
    where: eq(gyms.id, id),
  });
  if (!salle) notFound();

  const [instances, tousExercices] = await Promise.all([
    db.query.exerciseInstances.findMany({
      where: and(eq(exerciseInstances.gymId, id), eq(exerciseInstances.userId, userId)),
      with: { exercise: true },
    }),
    db.query.exercises.findMany(),
  ]);

  const presentsParExercice = new Set(instances.map((i) => i.exerciseId));

  const machines: MachineAffichee[] = instances.map((i) => ({
    id: i.id,
    exerciseId: i.exerciseId,
    machineNom: i.machineNom,
    typePoulie: i.typePoulie,
    conventionCharge: i.conventionCharge,
    incrementsPossibles: i.incrementsPossibles ?? [],
    poidsNonCompte: i.poidsNonCompte,
    chargeMax: i.chargeMax,
    notesMachine: i.notesMachine,
    exerciceNom: i.exercise?.nom ?? "",
    exercicePilier: i.exercise?.pilier ?? "autre",
    exerciceSlug: i.exercise?.slug ?? null,
    exerciceNbFrames: (i.exercise?.slug && CATALOGUE_PAR_SLUG.get(i.exercise.slug)?.nbFrames) || 3,
  }));

  const exercicesSelectionnables: ExerciceSelectionnable[] = tousExercices
    .map((e) => ({
      id: e.id,
      nom: e.nom,
      pilier: e.pilier,
      slug: e.slug,
      dejaPresent: presentsParExercice.has(e.id),
    }))
    .sort((a, b) => a.pilier.localeCompare(b.pilier) || a.nom.localeCompare(b.nom));

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-3">
        <Link href={`/gyms/${id}`} aria-label="Retour à la salle">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5 text-encre" /></Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-encre">Matériel · {salle.nom}</h1>
          <p className="text-encre-3 text-sm">
            {machines.length} machine{machines.length > 1 ? "s" : ""} sur {tousExercices.length} exercices au catalogue
          </p>
        </div>
      </div>

      <GestionMachines gymId={id} machines={machines} exercices={exercicesSelectionnables} />
    </div>
  );
}
