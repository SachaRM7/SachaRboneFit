"use client";

import { useEffect, useState } from "react";
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
  onDefer: (exerciseInstanceId: string, exerciseName: string) => void;
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
  onDefer,
  onSubstitute,
}: SOSMachineOccupeeProps) {
  const [reponse, setReponse] = useState<{ id: string; substituts: SubstituteResult[]; message: string } | null>(null);

  // Les exercices qu'il reste à faire : ceux-là seuls peuvent être occupés.
  const candidats = exercicesDeLaSeance.filter((e) => e.seriesFaites < e.seriesCibles);
  const [occupe, setOccupe] = useState<string>(
    () => candidats.find((e) => e.id === exerciseInstanceId)?.id ?? candidats[0]?.id ?? exerciseInstanceId,
  );
  const exerciceOccupe = exercicesDeLaSeance.find((e) => e.id === occupe);
  const aSuivant = candidats.some((e) => e.id !== occupe);

  useEffect(() => {
    let annule = false;
    void machineOccupee(
      { exercise_instance_id: occupe, gym_id: gymId, seance_template_id: "", daily_state_id: null },
      allInstances, templateExerciseIds, musclesCourbatures,
    ).then((res) => { if (!annule) setReponse({ id: occupe, ...res }); });
    return () => { annule = true; };
  }, [occupe, gymId, allInstances, templateExerciseIds, musclesCourbatures]);
  const result = reponse?.id === occupe ? reponse : null;

  return (
    <div className="fixed inset-0 z-50 bg-encre/80 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Machine occupée">
      <div className="bg-carte rounded-t-2xl w-full max-w-md p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-4 max-h-[85dvh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div><p className="eyebrow">Machine occupée</p><h2 className="text-lg font-semibold">{exerciceOccupe?.nom ?? "Cet exercice"}</h2></div>
          <button onClick={onClose} className="h-11 w-11 grid place-items-center" aria-label="Fermer machine occupée"><X aria-hidden /></button>
        </div>
        <details className="live-debrief-detail">
          <summary>Choisir un autre exercice concerné</summary>
          <div className="space-y-2">{candidats.map((e) => <button key={e.id} type="button" onClick={() => setOccupe(e.id)} aria-pressed={e.id === occupe} className="w-full text-left min-h-11 rounded-xl border border-filet p-3">{e.nom}</button>)}</div>
        </details>
        {aSuivant && <Button variant="outline" className="w-full min-h-12" onClick={() => onDefer(occupe, exerciceOccupe?.nom ?? "Cet exercice")}>
          Je fais autre chose et j&apos;y reviens
        </Button>}
        {!result ? <div role="status" aria-label="Recherche des alternatives" className="h-24 rounded-xl bg-papier-2 animate-pulse" /> : <div className="space-y-2">
          <p className="text-sm text-encre-2">{result.message}</p>
          {result.substituts.map((sub) => <button key={sub.exerciseInstanceId} onClick={() => onSubstitute(sub.exerciseInstanceId, sub.exerciseName)} className="w-full p-4 bg-papier-2 rounded-xl text-left">
            <span className="flex items-center justify-between gap-3"><strong>{sub.exerciseName}</strong><Check size={20} aria-hidden /></span>
            <span className="block text-sm text-encre-2">{sub.machineName}</span>
            <span className="block text-xs text-encre-3 mt-1">{sub.raisonCompatibilite}</span>
          </button>)}
        </div>}
        <Button variant="ghost" className="w-full min-h-11" onClick={onClose}>Annuler</Button>
      </div>
    </div>
  );
}
