"use client";
import { useState, useMemo } from "react";
import { ExerciseFilters } from "./ExerciseFilters";
import { ExerciseList } from "./ExerciseList";
import type { Exercise } from "@/db/schema";

export interface ExerciceAvecInstances extends Exercise {
  instances: { id: string; machineNom: string; gymId: string }[];
}

interface ExerciseLibraryProps {
  exercises: ExerciceAvecInstances[];
  salles: { id: string; nom: string }[];
}

const TOUTES = "__toutes__";

export function ExerciseLibrary({ exercises, salles }: ExerciseLibraryProps) {
  const [filters, setFilters] = useState({
    piliers: [] as string[],
    profils: [] as string[],
    roles: [] as string[],
  });
  // Filtre par salle : la bibliotheque montrait tous les exercices sans jamais
  // tenir compte du materiel reellement present sur place.
  const [salleId, setSalleId] = useState<string>(TOUTES);

  const filtered = useMemo(() => {
    return exercises.filter((ex) => {
      if (filters.piliers.length > 0 && !filters.piliers.includes(ex.pilier)) return false;
      if (filters.profils.length > 0 && !filters.profils.includes(ex.profilTension)) return false;
      if (filters.roles.length > 0 && !filters.roles.includes(ex.categorieRole)) return false;
      if (salleId !== TOUTES && !ex.instances.some((i) => i.gymId === salleId)) return false;
      return true;
    });
  }, [exercises, filters, salleId]);

  const nbDisponibles = useMemo(
    () => (salleId === TOUTES ? exercises.length : exercises.filter((e) => e.instances.some((i) => i.gymId === salleId)).length),
    [exercises, salleId],
  );

  return (
    <div className="space-y-4">
      {salles.length > 0 && (
        <div className="px-4 space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSalleId(TOUTES)}
              aria-pressed={salleId === TOUTES}
              className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                salleId === TOUTES ? "bg-encre text-papier border-encre" : "bg-carte text-encre-2 border-filet"
              }`}
            >
              Tous les exercices
            </button>
            {salles.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSalleId(s.id)}
                aria-pressed={salleId === s.id}
                className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                  salleId === s.id ? "bg-encre text-papier border-encre" : "bg-carte text-encre-2 border-filet"
                }`}
              >
                {s.nom}
              </button>
            ))}
          </div>
          <p className="text-encre-3 text-xs">
            {salleId === TOUTES
              ? `${exercises.length} exercices au catalogue`
              : `${nbDisponibles} exercices réellement faisables dans cette salle`}
          </p>
        </div>
      )}

      <ExerciseFilters onChange={setFilters} />
      <ExerciseList exercises={filtered} salleId={salleId === TOUTES ? null : salleId} />
    </div>
  );
}
