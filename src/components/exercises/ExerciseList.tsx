"use client";
import { versMuscles } from "@/lib/referentiels/muscles";
import { libelleMuscles } from "@/lib/referentiels/libelles";
import { libelleProfilTension } from "@/lib/referentiels/libelles";
import { libelleTypeMouvement } from "@/lib/referentiels/libelles";
import Link from "next/link";
import { PilierBadge } from "./PilierBadge";
import { Badge } from "@/components/ui/badge";
import { IllustrationExercice } from "./IllustrationExercice";
import { CATALOGUE_PAR_SLUG } from "@/lib/referentiels/catalogue";

interface ExerciseWithInstances {
  id: string;
  nom: string;
  pilier: string;
  profilTension: string;
  type: string;
  categorieRole: string;
  musclesPrincipaux: string[] | null;
  slug?: string | null;
  instances?: { id: string; machineNom: string; gymId: string }[];
}

interface ExerciseListProps {
  exercises: ExerciseWithInstances[];
  /** Quand une salle est selectionnee, on affiche la machine correspondante. */
  salleId?: string | null;
}

export function ExerciseList({ exercises, salleId = null }: ExerciseListProps) {
  return (
    <div className="exercise-library-grid">
      {exercises.map((ex) => (
        <Link key={ex.id} href={`/exercises/${ex.id}`} prefetch={false}>
          <div className="exercise-library-card">
            <div className="flex items-start gap-3">
              {ex.slug && CATALOGUE_PAR_SLUG.has(ex.slug) ? (
                <IllustrationExercice
                  slug={ex.slug}
                  nom={ex.nom}
                  nbFrames={CATALOGUE_PAR_SLUG.get(ex.slug)!.nbFrames}
                  className="library-illustration shrink-0 text-encre-2"
                />
              ) : (
                <PilierBadge pilier={ex.pilier} />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-encre font-medium text-sm">{ex.nom}</p>
                {!!ex.musclesPrincipaux?.length && (
                  <p className="text-encre-2 text-xs mt-1">
                    {libelleMuscles(versMuscles(ex.musclesPrincipaux))}
                  </p>
                )}
                {salleId && (
                  <p className="text-encre-3 text-xs mt-0.5">
                    {ex.instances?.find((i) => i.gymId === salleId)?.machineNom}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <Badge
                    variant="outline"
                    className="border-filet text-encre-3 text-[10px]"
                  >
                    {libelleProfilTension(ex.profilTension)}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-filet text-encre-3 text-[10px]"
                  >
                    {libelleTypeMouvement(ex.type)}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </Link>
      ))}

      {exercises.length === 0 && (
        <p className="text-encre-3 text-center py-8">
          Aucun exercice ne correspond aux filtres.
        </p>
      )}
    </div>
  );
}
