"use client";
import { Search, SlidersHorizontal, X } from "lucide-react";
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

const normaliser = (texte: string) =>
  texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const TOUTES = "__toutes__";

export function ExerciseLibrary({ exercises, salles }: ExerciseLibraryProps) {
  const [filters, setFilters] = useState({
    piliers: [] as string[],
    profils: [] as string[],
    roles: [] as string[],
  });
  // Filtre par salle : la bibliotheque montrait tous les exercices sans jamais
  // tenir compte du materiel reellement present sur place.
  const [recherche, setRecherche] = useState("");
  const [salleId, setSalleId] = useState<string>(TOUTES);

  const filtered = useMemo(() => {
    const termes = normaliser(recherche).trim().split(/\s+/).filter(Boolean);
    return exercises.filter((ex) => {
      const texte = normaliser(
        [
          ex.nom,
          ...(ex.musclesPrincipaux ?? []),
          ...ex.instances.map((i) => i.machineNom),
        ].join(" "),
      );
      if (!termes.every((terme) => texte.includes(terme))) return false;
      if (filters.piliers.length > 0 && !filters.piliers.includes(ex.pilier))
        return false;
      if (
        filters.profils.length > 0 &&
        !filters.profils.includes(ex.profilTension)
      )
        return false;
      if (filters.roles.length > 0 && !filters.roles.includes(ex.categorieRole))
        return false;
      if (salleId !== TOUTES && !ex.instances.some((i) => i.gymId === salleId))
        return false;
      return true;
    });
  }, [exercises, filters, salleId, recherche]);

  const nbDisponibles = useMemo(
    () =>
      salleId === TOUTES
        ? exercises.length
        : exercises.filter((e) => e.instances.some((i) => i.gymId === salleId))
            .length,
    [exercises, salleId],
  );

  return (
    <div className="library-v2 space-y-4">
      <div className="library-search">
        <Search size={20} aria-hidden />
        <input
          type="search"
          aria-label="Rechercher un exercice, un muscle ou une machine"
          placeholder="Un exercice, un muscle, une machine…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
        {recherche && (
          <button
            aria-label="Effacer la recherche"
            onClick={() => setRecherche("")}
          >
            <X size={18} />
          </button>
        )}
      </div>
      {salles.length > 0 && (
        <div className="px-4 space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSalleId(TOUTES)}
              aria-pressed={salleId === TOUTES}
              className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                salleId === TOUTES
                  ? "bg-encre text-papier border-encre"
                  : "bg-carte text-encre-2 border-filet"
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
                  salleId === s.id
                    ? "bg-encre text-papier border-encre"
                    : "bg-carte text-encre-2 border-filet"
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

      <details className="library-filters">
        <summary>
          <SlidersHorizontal size={16} aria-hidden />
          Affiner les exercices
          <span>
            {filters.piliers.length +
              filters.profils.length +
              filters.roles.length || ""}
          </span>
        </summary>
        <ExerciseFilters onChange={setFilters} />
      </details>
      <p className="library-count" aria-live="polite">
        {filtered.length} exercice{filtered.length > 1 ? "s" : ""} affiché
        {filtered.length > 1 ? "s" : ""}
      </p>
      <ExerciseList
        exercises={filtered}
        salleId={salleId === TOUTES ? null : salleId}
      />
    </div>
  );
}
