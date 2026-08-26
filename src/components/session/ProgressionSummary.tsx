"use client";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ExercisePerf {
  exerciseInstanceId: string;
  exerciseName: string;
  machineNom: string;
  pilier: string;
  best1RM: number;
  totalVolume: number;
  sets: { charge: number; reps: number; numero: number }[];
}

interface ProgressionSummaryProps {
  sets: Array<{ exerciseInstanceId: string; repsEffectuees: number; charge: number }>;
  templateId: string;
}

function estimated1RM(charge: number, reps: number): number {
  if (reps <= 0 || charge <= 0) return 0;
  if (reps === 1) return charge;
  return Math.round(charge * (1 + reps / 30));
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
        const currentBest1RM = Math.max(...currentSets.map((s) => estimated1RM(s.charge, s.repsEffectuees)));
        const currentVolume = currentSets.reduce((sum, s) => sum + s.charge * s.repsEffectuees, 0);

        const lastRes = await fetch(`/api/set-logs/last-session?exerciseInstanceId=${instanceId}`);
        const lastData = await lastRes.json();
        const lastSets = lastData?.sets || [];

        const lastBest1RM = lastSets.length > 0
          ? Math.max(...lastSets.map((s: { charge: number; reps: number }) => estimated1RM(s.charge, s.reps)))
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
        <p className="text-zinc-500 text-sm">Analyse des progressions...</p>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-zinc-800 rounded-lg h-16 animate-pulse" />
        ))}
      </div>
    );
  }

  if (exercises.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-zinc-400 text-sm font-medium">Comparaison à la dernière séance</p>
      {exercises.map((ex) => {
        const deltaLabel = ex.delta === "new" ? "Première séance" :
          ex.delta === "up" ? `+${Math.round(ex.currentBest1RM - (ex.lastBest1RM || 0))}kg 1RM ↑` :
          ex.delta === "down" ? `${Math.round(ex.currentBest1RM - (ex.lastBest1RM || 0))}kg 1RM ↓` :
          "= stable";
        const deltaColor = ex.delta === "up" ? "text-green-400" : ex.delta === "down" ? "text-red-400" : "text-zinc-400";

        return (
          <div key={ex.exerciseInstanceId} className="bg-zinc-800/50 rounded-lg p-3 space-y-1">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-white font-medium text-sm">{ex.exerciseName}</p>
                <p className="text-zinc-500 text-xs">{ex.machineNom}</p>
              </div>
              <Badge variant="outline" className="text-xs border-zinc-700 text-zinc-400">
                {ex.pilier}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className={`font-medium ${deltaColor}`}>{deltaLabel}</span>
              <span className="text-zinc-500">
                {ex.lastBest1RM !== null
                  ? `${ex.lastBest1RM}kg → ${ex.currentBest1RM}kg`
                  : `${ex.currentBest1RM}kg 1RM`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}