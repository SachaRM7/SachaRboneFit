"use client";

import type { DouleurResult } from "@/lib/sos/types";

interface SOSResultatProps {
  message: string;
  exercicesImpactes?: { exercise_instance_id: string; nom?: string; impact: "skip" | "alleger" }[];
  actions: {
    label: string;
    onClick: () => void;
    variant?: "default" | "destructive" | "outline";
  }[];
}

export function SOSResultat({ message, exercicesImpactes, actions }: SOSResultatProps) {
  return (
    <div className="space-y-4">
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
        <p className="text-amber-300 font-medium">{message}</p>
      </div>

      {exercicesImpactes && exercicesImpactes.length > 0 && (
        <div className="space-y-2">
          <p className="text-zinc-400 text-sm">Exercices impactés :</p>
          {exercicesImpactes.map((ex, i) => (
            <div key={i} className="flex items-center justify-between bg-zinc-800 rounded px-3 py-2">
              <span className="text-white text-sm">{ex.nom || ex.exercise_instance_id}</span>
              <span className={`text-xs px-2 py-0.5 rounded ${
                ex.impact === "skip" ? "bg-red-900/50 text-red-300" : "bg-yellow-900/50 text-yellow-300"
              }`}>
                {ex.impact === "skip" ? "Skippé" : "Allégé"}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {actions.map((action, i) => (
          <button
            key={i}
            onClick={action.onClick}
            className={`w-full h-12 rounded-lg font-medium transition-colors ${
              action.variant === "destructive"
                ? "bg-red-600 hover:bg-red-700 text-white"
                : action.variant === "outline"
                ? "bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700"
                : "bg-green-600 hover:bg-green-700 text-white"
            }`}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}