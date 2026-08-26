"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PILIERS, PROFILS, ROLES } from "@/lib/schemas/exercise";

interface FiltersState {
  piliers: string[];
  profils: string[];
  roles: string[];
}

interface ExerciseFiltersProps {
  onChange: (filters: FiltersState) => void;
}

const pilierLabels: Record<string, string> = {
  P1_poussee: "P1", P2_tirage: "P2", P3_squat: "P3", P4_hanche: "P4",
  epaules: "Épaule", bras_biceps: "Biceps", bras_triceps: "Triceps",
  jambes_iso: "Jambes", core: "Core",
};

export function ExerciseFilters({ onChange }: ExerciseFiltersProps) {
  const [filters, setFilters] = useState<FiltersState>({
    piliers: [],
    profils: [],
    roles: [],
  });

  const toggle = (category: keyof FiltersState, value: string) => {
    const updated = {
      ...filters,
      [category]: filters[category].includes(value)
        ? filters[category].filter((v) => v !== value)
        : [...filters[category], value],
    };
    setFilters(updated);
    onChange(updated);
  };

  return (
    <div className="space-y-3 p-4">
      <div>
        <p className="text-encre-3 text-xs mb-2">Pilier</p>
        <div className="flex flex-wrap gap-2">
          {PILIERS.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={filters.piliers.includes(p) ? "default" : "outline"}
              className={filters.piliers.includes(p) ? "bg-papier-2" : "bg-carte border-filet"}
              onClick={() => toggle("piliers", p)}
            >
              {pilierLabels[p] || p}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-encre-3 text-xs mb-2">Profil de tension</p>
        <div className="flex flex-wrap gap-2">
          {PROFILS.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={filters.profils.includes(p) ? "default" : "outline"}
              className={filters.profils.includes(p) ? "bg-papier-2" : "bg-carte border-filet"}
              onClick={() => toggle("profils", p)}
            >
              {p}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-encre-3 text-xs mb-2">Rôle</p>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <Button
              key={r}
              size="sm"
              variant={filters.roles.includes(r) ? "default" : "outline"}
              className={filters.roles.includes(r) ? "bg-papier-2" : "bg-carte border-filet"}
              onClick={() => toggle("roles", r)}
            >
              {r}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
