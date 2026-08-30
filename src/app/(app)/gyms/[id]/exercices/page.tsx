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
import { peutGererLaSalle, REFUS_GESTION_SALLE } from "@/lib/autorisations";
import { MaterielDuLieu } from "@/components/gyms/MaterielDuLieu";
import { apportDeChaqueEquipement, exercicesRealisables } from "@/lib/engine/disponibilite";

/**
 * Les exercices qu'une salle permet de faire.
 *
 * L'ecran s'appelait « Materiel » et ne parlait que de machines. Une salle
 * contient aussi des barres, des halteres, une barre de traction : ce qu'on y
 * declare, ce sont des exercices rendus possibles par le lieu, machine ou pas.
 *
 * Il n'existait par ailleurs aucun chemin applicatif pour equiper une salle :
 * le parc ne pouvait venir que du script de seed, et une salle nouvellement
 * creee restait inutilisable.
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
      where: and(eq(exerciseInstances.gymId, id), isNull(exerciseInstances.archiveLe)),
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

  // La liste est commune ; la tenir a jour revient au createur de la salle.
  const gestionAutorisee = peutGererLaSalle(salle, userId);

  // Deux façons d'être faisable ici : un appareil décrit, ou un besoin couvert
  // par le matériel déclaré. La seconde évite d'énumérer jusqu'aux pompes.
  const pourMoteur = tousExercices.map((e) => ({
    id: e.id,
    nom: e.nom,
    pilier: e.pilier,
    categorieRole: e.categorieRole,
    musclesPrincipaux: e.musclesPrincipaux ?? [],
    equipement: e.equipement,
  }));
  const equipementsDuLieu = salle.equipementsDisponibles ?? [];
  const realisables = exercicesRealisables({
    catalogue: pourMoteur,
    equipementsDuLieu,
    instances: instances.map((i) => ({
      id: i.id,
      exerciseId: i.exerciseId,
      machineNom: i.machineNom,
      incrementsPossibles: i.incrementsPossibles ?? [],
    })),
  });
  const apports = Object.fromEntries(
    apportDeChaqueEquipement(pourMoteur, equipementsDuLieu).map((a) => [a.equipement, a.exercicesEnPlus]),
  );

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
          <h1 className="text-xl font-bold text-encre">Exercices · {salle.nom}</h1>
          <p className="text-encre-3 text-sm">
            {realisables.length} exercice{realisables.length > 1 ? "s" : ""} faisable
            {realisables.length > 1 ? "s" : ""} ici · {machines.length} appareil
            {machines.length > 1 ? "s" : ""} décrit{machines.length > 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {!gestionAutorisee && (
        <p className="rounded-xl border border-filet bg-carte p-4 text-sm text-encre-2">
          {REFUS_GESTION_SALLE}
        </p>
      )}

      <MaterielDuLieu
        gymId={id}
        equipements={equipementsDuLieu}
        apports={apports}
        lectureSeule={!gestionAutorisee}
      />

      {calibrationAPreparer && (
        <div className="rounded-xl border border-filet bg-carte p-4 space-y-2">
          {realisables.length === 0 ? (
            <>
              <p className="text-encre font-semibold">Commence par ce que tu vois sur place</p>
              <p className="text-encre-2 text-sm">
                Appareils, mais aussi barres, haltères, barre de traction : tout ce que tu peux
                faire ici. Chaque exercice ajouté est un exercice que je peux te proposer. Inutile
                de tout lister d&apos;un coup, tu compléteras au fil des séances.
              </p>
            </>
          ) : (
            <>
              <p className="text-encre font-semibold">Prêt à construire ta calibration</p>
              <p className="text-encre-2 text-sm">
                Je peux préparer tes premières séances à partir des {realisables.length} exercices
                faisables ici. Tu préciseras les appareils au fil des séances.
              </p>
              <Link href="/session/calibration">
                <Button className="mt-1 h-10 bg-encre text-papier">Préparer ma calibration</Button>
              </Link>
            </>
          )}
        </div>
      )}

      <GestionMachines
        gymId={id}
        machines={machines}
        exercices={exercicesSelectionnables}
        lectureSeule={!gestionAutorisee}
      />
    </div>
  );
}
