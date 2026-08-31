"use client";
import { useEffect, useState } from "react";
import { estimer1RMDepuisRpe } from "@/lib/engine/records";
import { Delta } from "@/components/carnet/Delta";
import { Button } from "@/components/ui/button";

interface ExercisePerf {
  exerciseInstanceId: string;
  exerciseName: string;
  machineNom: string;
  pilier: string;
  best1RM: number;
  totalVolume: number;
  sets: { charge: number; reps: number; numero: number; rpe?: number | null }[];
}

interface ProgressionSummaryProps {
  sets: Array<{
    exerciseInstanceId: string;
    repsEffectuees: number;
    charge: number;
    rpeEffectif?: number | null;
  }>;
  templateId: string;
}

export function ProgressionSummary({ sets, templateId }: ProgressionSummaryProps) {
  const [loading, setLoading] = useState(true);
  const [exercises, setExercises] = useState<Array<{
    exerciseInstanceId: string;
    exerciseName: string;
    machineNom: string;
    pilier: string;
    currentBest1RM: number;
    currentVolume: number;
    lastBest1RM: number | null;
    lastVolume: number | null;
    lastSets: { charge: number; reps: number; numero: number }[];
    delta: "up" | "down" | "same" | "new";
    completedRange: boolean;
    suggestedCharge: number | null;
  }>>([]);

  useEffect(() => {
    const uniqueInstances = [...new Set(sets.map((s) => s.exerciseInstanceId))];
    // Pas de setState synchrone ici : le cas vide est derive au rendu (voir plus bas).
    if (uniqueInstances.length === 0) return;

    Promise.all(
      uniqueInstances.map(async (instanceId) => {
        const currentSets = sets.filter((s) => s.exerciseInstanceId === instanceId);
        const currentBest1RM = Math.max(...currentSets.map((s) => estimer1RMDepuisRpe(s.charge, s.repsEffectuees, s.rpeEffectif)));
        const currentVolume = currentSets.reduce((sum, s) => sum + s.charge * s.repsEffectuees, 0);

        const lastRes = await fetch(`/api/set-logs/last-session?exerciseInstanceId=${instanceId}`);
        const lastData = await lastRes.json();
        const lastSets = lastData?.sets || [];

        const lastBest1RM = lastSets.length > 0
          ? Math.max(...lastSets.map((s: { charge: number; reps: number; rpe?: number | null }) =>
              estimer1RMDepuisRpe(s.charge, s.reps, s.rpe)))
          : null;
        const lastVolume = lastSets.length > 0
          ? lastSets.reduce((sum: number, s: { charge: number; reps: number }) => sum + s.charge * s.reps, 0)
          : null;

        const lastSessionRes = await fetch(`/api/sessions/last?exerciseInstanceId=${instanceId}`);
        const lastSessionData = await lastSessionRes.json();

        return {
          exerciseInstanceId: instanceId,
          exerciseName: lastSessionData?.exerciseName || "Exercice",
          machineNom: lastSessionData?.machineNom || "",
          pilier: lastSessionData?.pilier || "core",
          currentBest1RM,
          currentVolume,
          lastBest1RM,
          lastVolume,
          lastSets,
          delta: (lastBest1RM === null ? "new" : currentBest1RM > lastBest1RM ? "up" : currentBest1RM < lastBest1RM ? "down" : "same") as "up" | "down" | "same" | "new",
          completedRange: false,
          suggestedCharge: null,
        };
      })
    ).then((results) => {
      setExercises(results);
      setLoading(false);
    });
  }, [sets]);

  if (loading) {
    return (
      <div className="space-y-3">
        <p className="text-encre-3 text-sm">Analyse des progressions...</p>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-papier-2 rounded-lg h-14 animate-pulse" />
        ))}
      </div>
    );
  }

  if (exercises.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-encre-3 text-sm italic">Comparaison à la dernière séance</p>
      {exercises.map((ex) => {
        const ecart = ex.lastBest1RM === null ? null : ex.currentBest1RM - ex.lastBest1RM;

        return (
          <div key={ex.exerciseInstanceId} className="border-t border-filet-doux pt-2.5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-encre font-semibold text-sm leading-tight">{ex.exerciseName}</p>
              <p className="text-encre-3 text-xs mt-0.5">{ex.machineNom}</p>
              {ex.completedRange && (
                <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wide bg-gain-fond text-gain px-1.5 py-0.5 rounded">
                  Fourchette complétée
                </span>
              )}
            </div>
            <div className="text-right shrink-0">
              {ecart === null ? (
                <p className="chiffres text-sm font-semibold text-neutre">Première fois</p>
              ) : (
                <Delta valeur={ecart} unite="kg" decimales={0} className="text-base" />
              )}
              <p className="chiffres text-[11px] text-encre-3 mt-0.5">1RM {ex.currentBest1RM} kg</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}