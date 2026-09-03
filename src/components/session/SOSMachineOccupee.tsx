"use client";

import { useState } from "react";
import { X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { machineOccupee } from "@/lib/sos/machine-occupee";
import type { ExerciseInstanceWithExercise, SubstituteResult } from "@/lib/engine/substitutions";

interface ExerciceDeLaSeance {
  id: string;
  nom: string;
  machineNom?: string | null;
  /** Séries déjà validées : un exercice terminé n'est plus « occupé ». */
  seriesFaites: number;
  seriesCibles: number;
}

interface SOSMachineOccupeeProps {
  /** Les exercices encore à faire, pour désigner celui qui est occupé. */
  exercicesDeLaSeance: ExerciceDeLaSeance[];
  exerciseInstanceId: string;
  gymId: string;
  allInstances: ExerciseInstanceWithExercise[];
  templateExerciseIds: string[];
  musclesCourbatures: string[];
  onClose: () => void;
  onSubstitute: (substituteInstanceId: string, substituteName: string) => void;
}

/**
 * « Machine occupée », depuis l'exercice concerné.
 *
 * L'écran partait de `currentExerciseIndex` — un index qui ne pilote plus rien
 * depuis que toute la séance s'affiche d'un coup. La modale cherchait donc un
 * substitut à un exercice choisi au hasard, sans jamais demander lequel était
 * réellement pris.
 *
 * Et elle proposait la substitution d'emblée. Devant une machine occupée, la
 * première question n'est pas « par quoi la remplacer » mais « puis-je faire
 * autre chose et y revenir » : changer d'exercice coûte une comparaison
 * d'historique, passer à la suite ne coûte rien.
 */
export function SOSMachineOccupee({
  exercicesDeLaSeance,
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

  // Les exercices qu'il reste à faire : ceux-là seuls peuvent être occupés.
  const candidats = exercicesDeLaSeance.filter((e) => e.seriesFaites < e.seriesCibles);
  const [occupe, setOccupe] = useState<string>(
    () => candidats.find((e) => e.id === exerciseInstanceId)?.id ?? candidats[0]?.id ?? exerciseInstanceId,
  );
  const exerciceOccupe = exercicesDeLaSeance.find((e) => e.id === occupe);
  const aSuivant = candidats.some((e) => e.id !== occupe);

  const handleEvaluate = async () => {
    setLoading(true);
    const res = await machineOccupee(
      { exercise_instance_id: occupe, gym_id: gymId, seance_template_id: "", daily_state_id: null },
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
            <div className="space-y-2">
              <p className="text-encre-2 text-sm">Quelle machine est prise ?</p>
              <div className="space-y-1.5">
                {candidats.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setOccupe(e.id)}
                    aria-pressed={e.id === occupe}
                    className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                      e.id === occupe
                        ? "border-encre bg-papier-2 text-encre"
                        : "border-filet bg-carte text-encre-2"
                    }`}
                  >
                    <span className="block text-sm font-medium">{e.nom}</span>
                    {e.machineNom && e.machineNom !== e.nom && (
                      <span className="block text-xs text-encre-3">{e.machineNom}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* La suite d'abord : y revenir ne coûte rien, changer d'exercice
                coupe l'historique de comparaison. */}
            {aSuivant && (
              <div className="rounded-lg border border-filet bg-papier-2 p-3">
                <p className="text-encre text-sm font-medium">Passe à l&apos;exercice suivant</p>
                <p className="text-encre-2 text-xs mt-0.5">
                  Tu reviendras sur {exerciceOccupe?.nom ?? "cet exercice"} quand la machine
                  se libère — c&apos;est ce qui préserve ta progression dessus.
                </p>
                <Button variant="outline" className="w-full mt-2 border-filet text-encre"
                  onClick={onClose}>
                  Je fais autre chose et j&apos;y reviens
                </Button>
              </div>
            )}

            <p className="text-encre-2 text-sm">
              Si tu ne peux pas attendre, cherchons un remplaçant.
            </p>
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