"use client";
import { useState, useMemo } from "react";
import { ExerciseFilters } from "./ExerciseFilters";
import { ExerciseList } from "./ExerciseList";
import type { Exercise } from "@/db/schema";

interface ExerciseWithInstances extends Exercise {
  instances?: { id: string; machineNom: string; gymId: string }[];
}

interface ExerciseLibraryProps {
  exercises: ExerciseWithInstances[];
}

export function ExerciseLibrary({ exercises }: ExerciseLibraryProps) {
  const [filters, setFilters] = useState({
    piliers: [] as string[],
    profils: [] as string[],
    roles: [] as string[],
  });

  const filtered = useMemo(() => {
    return exercises.filter((ex) => {
      if (filters.piliers.length > 0 && !filters.piliers.includes(ex.pilier)) return false;
      if (filters.profils.length > 0 && !filters.profils.includes(ex.profilTension)) return false;
      if (filters.roles.length > 0 && !filters.roles.includes(ex.categorieRole)) return false;
      return true;
    });
  }, [exercises, filters]);

  return (
    <div className="space-y-4">
      <ExerciseFilters onChange={setFilters} />
      <ExerciseList exercises={filtered} />
    </div>
  );
}
