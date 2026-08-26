"use client";

import { useState } from "react";
import { X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { machineOccupee } from "@/lib/sos/machine-occupee";
import type { ExerciseInstanceWithExercise, SubstituteResult } from "@/lib/engine/substitutions";

interface SOSMachineOccupeeProps {
  exerciseInstanceId: string;
  gymId: string;
  allInstances: ExerciseInstanceWithExercise[];
  templateExerciseIds: string[];
  musclesCourbatures: string[];
  onClose: () => void;
  onSubstitute: (substituteInstanceId: string, substituteName: string) => void;
}

export function SOSMachineOccupee({
  exerciseInstanceId,
  gymId,
  allInstances,
  templateExerciseIds,
  musclesCourbatures,
  onClose,
  onSubstitute,
}: SOSMachineOccupeeProps) {
  const [result, setResult] = useState<{ substituts: SubstituteResult[]; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleEvaluate = async () => {
    setLoading(true);
    const res = await machineOccupee(
      { exercise_instance_id: exerciseInstanceId, gym_id: gymId, seance_template_id: "", daily_state_id: null },
      allInstances,
      templateExerciseIds,
      musclesCourbatures,
    );
    setResult(res);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-encre/80 flex items-end justify-center">
      <div className="bg-carte rounded-t-2xl w-full max-w-md p-4 space-y-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-encre">Machine occupée</h2>
          <button onClick={onClose} className="p-2">
            <X className="w-5 h-5 text-encre-2" />
          </button>
        </div>

        {!result ? (
          <>
            <p className="text-encre-2 text-sm">Trouver un substitut pour cet exercice.</p>
            <Button
              className="w-full"
              onClick={handleEvaluate}
              disabled={loading}
            >
              {loading ? "Recherche..." : "Trouver des substituts"}
            </Button>
          </>
        ) : result.substituts.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-encre-2">{result.message}</p>
            <p className="text-encre-3 text-sm mt-2">Tu peux passer à l&apos;exercice suivant.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-encre-2 text-sm">{result.message}</p>
            {result.substituts.map((sub) => (
              <button
                key={sub.exerciseInstanceId}
                onClick={() => onSubstitute(sub.exerciseInstanceId, sub.exerciseName)}
                className="w-full p-3 bg-papier-2 rounded-lg hover:bg-papier-2 transition-colors text-left"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-encre font-medium">{sub.exerciseName}</p>
                    <p className="text-encre-3 text-sm">{sub.machineName}</p>
                  </div>
                  <Check className="w-5 h-5 text-gain" />
                </div>
                <p className="text-encre-3 text-xs mt-1">{sub.raisonCompatibilite}</p>
              </button>
            ))}
          </div>
        )}

        <Button variant="outline" className="w-full" onClick={onClose}>
          Annuler
        </Button>
      </div>
    </div>
  );
}