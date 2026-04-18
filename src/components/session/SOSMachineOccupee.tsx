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
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center">
      <div className="bg-zinc-900 rounded-t-2xl w-full max-w-md p-4 space-y-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Machine occupée</h2>
          <button onClick={onClose} className="p-2">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {!result ? (
          <>
            <p className="text-zinc-400 text-sm">Trouver un substitut pour cet exercice.</p>
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
            <p className="text-zinc-400">{result.message}</p>
            <p className="text-zinc-500 text-sm mt-2">Tu peux passer à l'exercice suivant.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-zinc-400 text-sm">{result.message}</p>
            {result.substituts.map((sub) => (
              <button
                key={sub.exerciseInstanceId}
                onClick={() => onSubstitute(sub.exerciseInstanceId, sub.exerciseName)}
                className="w-full p-3 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors text-left"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-medium">{sub.exerciseName}</p>
                    <p className="text-zinc-500 text-sm">{sub.machineName}</p>
                  </div>
                  <Check className="w-5 h-5 text-green-400" />
                </div>
                <p className="text-zinc-500 text-xs mt-1">{sub.raisonCompatibilite}</p>
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