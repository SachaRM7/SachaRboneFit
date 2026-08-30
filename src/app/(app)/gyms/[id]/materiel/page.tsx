import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/client";
import { gyms, exerciseInstances, programmeBlocs, seanceTemplates } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
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
      // Sans ce filtre, une machine archivée s'affichait comme présente et
      // `presentsParExercice` interdisait de la recréer : l'exercice devenait
      // impossible à remettre dans la salle.
      where: and(
        eq(exerciseInstances.gymId, id),
        eq(exerciseInstances.userId, userId),
        isNull(exerciseInstances.archiveLe),
      ),
      with: { exercise: true },
    }),
    db.query.exercises.findMany(),
  ]);

  const presentsParExercice = new Set(instances.map((i) => i.exerciseId));

  // Équiper une salle n'est pas une fin en soi : l'écran ne disait pas ce que
  // ces machines allaient permettre, ni où aller ensuite. On ne propose la
  // suite que lorsqu'elle est réellement disponible — un bloc actif sans
  // aucune séance, et au moins une machine pour en construire une.
  const blocActif = await db.query.programmeBlocs.findFirst({
    where: and(
      eq(programmeBlocs.userId, userId),
      isNull(programmeBlocs.archiveLe),
      eq(programmeBlocs.actif, true),
    ),
  });
  const seancesDuBloc = blocActif
    ? await db.$count(seanceTemplates, eq(seanceTemplates.blocId, blocActif.id))
    : 0;
  const calibrationAPreparer = Boolean(blocActif) && seancesDuBloc === 0;

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

      {calibrationAPreparer && (
        <div className="rounded-xl border border-filet bg-carte p-4 space-y-2">
          {machines.length === 0 ? (
            <>
              <p className="text-encre font-semibold">Commence par ce que tu vois sur place</p>
              <p className="text-encre-2 text-sm">
                Chaque machine ajoutée est un exercice que je peux te proposer. Inutile de tout
                lister d&apos;un coup : tu compléteras au fil des séances.
              </p>
            </>
          ) : (
            <>
              <p className="text-encre font-semibold">Prêt à construire ta calibration</p>
              <p className="text-encre-2 text-sm">
                Je peux préparer tes premières séances à partir de ces {machines.length} machines.
                Tu pourras en ajouter d&apos;autres ensuite.
              </p>
              <Link href="/session/calibration">
                <Button className="mt-1 h-10 bg-encre text-papier">Préparer ma calibration</Button>
              </Link>
            </>
          )}
        </div>
      )}

      <GestionMachines gymId={id} machines={machines} exercices={exercicesSelectionnables} />
    </div>
  );
}
