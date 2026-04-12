"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tempsDepasse } from "@/lib/sos/temps-depasse";
import { SOSResultat } from "./SOSResultat";

interface SOSTempsDepasseProps {
  dureeActuelleMin: number;
  dureeCibleMin: number;
  exercicesRestants: { exercise_instance_id: string; nom: string; seriesCibles?: number; reposSecondes?: number; ordre?: number; categorie_role: string; statut: string }[];
  onClose: () => void;
  onApply: (exercicesCoupes: string[]) => void;
  onIncident: (data: { type: string; contexte: Record<string, any>; decision: string }) => void;
}

export function SOSTempsDepasse({
  dureeActuelleMin,
  dureeCibleMin,
  exercicesRestants,
  onClose,
  onApply,
  onIncident,
}: SOSTempsDepasseProps) {
  const [showResult, setShowResult] = useState(false);
  const [resultData, setResultData] = useState<{ coupes: string[]; message: string } | null>(null);

  const handleApply = () => {
    const result = tempsDepasse(dureeActuelleMin, dureeCibleMin, exercicesRestants as any, {});
    setResultData({
      coupes: result.exercices_coupes,
      message: result.message,
    });
    setShowResult(true);

    onIncident({
      type: "temps_depasse",
      contexte: { duree_actuelle_min: dureeActuelleMin, duree_cible_min: dureeCibleMin, exercices_coupes: result.exercices_coupes },
      decision: result.message,
    });
  };

  if (showResult && resultData) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center">
        <div className="bg-zinc-900 rounded-t-2xl w-full max-w-md p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Temps dépassé</h2>
            <button onClick={onClose} className="p-2">
              <X className="w-5 h-5 text-zinc-400" />
            </button>
          </div>
          <SOSResultat
            message={`${dureeActuelleMin} min / ${dureeCibleMin} min cible. ${resultData.message}`}
            exercicesImpactes={resultData.coupes.map(nom => ({ exercise_instance_id: nom, nom, impact: "skip" as const }))}
            actions={[
              { label: "Appliquer les coupes", onClick: () => { onApply(resultData.coupes); onClose(); } },
              { label: "Continuer sans couper", onClick: onClose, variant: "outline" as const },
            ]}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center">
      <div className="bg-zinc-900 rounded-t-2xl w-full max-w-md p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Temps dépassé</h2>
          <button onClick={onClose} className="p-2">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        <div className="text-center py-4">
          <p className="text-4xl font-bold text-white">{dureeActuelleMin}<span className="text-xl text-zinc-500"> min</span></p>
          <p className="text-zinc-500 text-sm">Objectif : {dureeCibleMin} min</p>
        </div>

        <Button className="w-full" onClick={handleApply}>
          Analyser et proposer des coupes
        </Button>

        <Button variant="outline" className="w-full" onClick={onClose}>
          Annuler
        </Button>
      </div>
    </div>
  );
}