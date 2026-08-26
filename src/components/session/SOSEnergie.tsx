"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { energieChute } from "@/lib/sos/energie-chute";
import { SOSResultat } from "./SOSResultat";
import type { ExerciceRestant } from "@/lib/sos/types";

interface SOSEnergieProps {
  exercicesRestants: ExerciceRestant[];
  onClose: () => void;
  onApply: (exercicesCoupes: string[], rpeReduitSur: string[]) => void;
  onStopSeance: () => void;
  onIncident: (data: { type: string; contexte: Record<string, unknown>; decision: string }) => void;
}

export function SOSEnergie({ exercicesRestants, onClose, onApply, onStopSeance, onIncident }: SOSEnergieProps) {
  const [energie, setEnergie] = useState(5);
  const [showResult, setShowResult] = useState(false);
  const [resultData, setResultData] = useState<{ coupes: string[]; rpeReduit: string[]; message: string } | null>(null);

  const handleApply = () => {
    const result = energieChute(energie, exercicesRestants);
    setResultData({
      coupes: result.exercices_coupes,
      rpeReduit: result.rpe_reduit_sur,
      message: result.message,
    });
    setShowResult(true);

    onIncident({
      type: "energie_chute",
      contexte: { energie_actuelle: energie, exercices_restants: exercicesRestants.length, exercices_coupes: result.exercices_coupes },
      decision: result.message,
    });
  };

  if (showResult && resultData) {
    const impactes = [
      ...resultData.coupes.map(nom => ({ exercise_instance_id: nom, nom, impact: "skip" as const })),
      ...resultData.rpeReduit.map(nom => ({ exercise_instance_id: nom, nom, impact: "alleger" as const })),
    ];

    return (
      <div className="fixed inset-0 z-50 bg-encre/80 flex items-end justify-center">
        <div className="bg-carte rounded-t-2xl w-full max-w-md p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-encre">Résultat</h2>
            <button onClick={onClose} className="p-2">
              <X className="w-5 h-5 text-encre-2" />
            </button>
          </div>
          <SOSResultat
            message={resultData.message}
            exercicesImpactes={impactes}
            actions={[
              { label: "Appliquer les changements", onClick: () => { onApply(resultData.coupes, resultData.rpeReduit); onClose(); } },
              { label: "Continuer sans couper", onClick: onClose, variant: "outline" as const },
            ]}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-encre/80 flex items-end justify-center">
      <div className="bg-carte rounded-t-2xl w-full max-w-md p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-encre">Énergie en chute</h2>
          <button onClick={onClose} className="p-2">
            <X className="w-5 h-5 text-encre-2" />
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <label className="text-encre-2 text-sm">Énergie actuelle</label>
            <span className="text-encre font-medium">{energie}/10</span>
          </div>
          <Slider
            value={[energie]}
            onValueChange={(v) => setEnergie(Array.isArray(v) ? v[0]! : v)}
            min={1}
            max={10}
            step={1}
            className="w-full"
          />
        </div>

        <p className="text-encre-3 text-sm">
          {exercicesRestants.length} exercice(s) restant(s)
        </p>

        <Button className="w-full" onClick={handleApply}>
          Adapter la séance
        </Button>

        <Button variant="outline" className="w-full" onClick={onClose}>
          Annuler
        </Button>
      </div>
    </div>
  );
}