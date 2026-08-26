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
      <div className="bg-feu-orange/10 border border-feu-orange/25 rounded-lg p-4">
        <p className="text-feu-orange font-medium">{message}</p>
      </div>

      {exercicesImpactes && exercicesImpactes.length > 0 && (
        <div className="space-y-2">
          <p className="text-encre-2 text-sm">Exercices impactés :</p>
          {exercicesImpactes.map((ex, i) => (
            <div key={i} className="flex items-center justify-between bg-papier-2 rounded px-3 py-2">
              <span className="text-encre text-sm">{ex.nom || ex.exercise_instance_id}</span>
              <span className={`text-xs px-2 py-0.5 rounded ${
                ex.impact === "skip" ? "bg-perte-fond text-perte" : "bg-feu-orange/15 text-feu-orange"
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
                ? "bg-perte hover:bg-perte/90 text-papier"
                : action.variant === "outline"
                ? "bg-papier-2 hover:bg-papier-2 text-encre border border-filet"
                : "bg-gain hover:bg-gain text-encre"
            }`}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}