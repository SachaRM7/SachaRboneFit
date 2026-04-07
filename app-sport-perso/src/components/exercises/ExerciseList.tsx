"use client";
import Link from "next/link";
import { PilierBadge } from "./PilierBadge";
import { Badge } from "@/components/ui/badge";

interface ExerciseWithInstances {
  id: string;
  nom: string;
  pilier: string;
  profilTension: string;
  type: string;
  categorieRole: string;
  musclesPrincipaux: string[] | null;
}

interface ExerciseListProps {
  exercises: ExerciseWithInstances[];
}

export function ExerciseList({ exercises }: ExerciseListProps) {
  return (
    <div className="space-y-2 px-4">
      {exercises.map((ex) => (
        <Link key={ex.id} href={`/exercises/${ex.id}`}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 hover:border-zinc-700 transition-colors">
            <div className="flex items-start gap-3">
              <PilierBadge pilier={ex.pilier} />
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium text-sm">{ex.nom}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px]">
                    {ex.profilTension}
                  </Badge>
                  <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px]">
                    {ex.type}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </Link>
      ))}

      {exercises.length === 0 && (
        <p className="text-zinc-500 text-center py-8">Aucun exercice ne correspond aux filtres.</p>
      )}
    </div>
  );
}
