"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { energieChute } from "@/lib/sos/energie-chute";
import type { ExerciceRestant } from "@/lib/sos/types";

interface SOSEnergieProps {
  exercicesRestants: ExerciceRestant[];
  onClose: () => void;
  onApply: (exercicesCoupes: string[], rpeReduitSur: string[]) => void;
  onStopSeance: () => void;
  onIncident: (data: { type: string; contexte: Record<string, unknown>; decision: string }) => void;
}

/**
 * L'énergie en cours de séance.
 *
 * L'écran avait deux défauts, tous deux du même genre : un bouton qui promet
 * quelque chose qu'il ne fait pas.
 *
 * À 8/10, il annonçait « Énergie correcte, pas d'ajustement nécessaire » — puis
 * proposait « Appliquer les changements ». Il n'y en avait aucun : le bouton
 * appliquait une liste vide et fermait la modale.
 *
 * À 1/10, il annonçait « Proposé d'arrêter la séance » — et « Appliquer les
 * changements » ne terminait rien du tout. `onStopSeance` existait, mais aucune
 * action ne l'appelait.
 *
 * Chaque suggestion a maintenant son geste, et un seul : rien à faire, alléger,
 * ou arrêter. Un changement vide n'a pas de bouton.
 */
export function SOSEnergie({
  exercicesRestants, onClose, onApply, onStopSeance, onIncident,
}: SOSEnergieProps) {
  const [energie, setEnergie] = useState(5);
  const [confirme, setConfirme] = useState(false);

  // Déterministe et sans effet : le bilan se recalcule à chaque déplacement du
  // curseur, et on voit ce qui changerait avant de décider quoi que ce soit.
  const bilan = energieChute(energie, exercicesRestants);

  const tracer = () =>
    onIncident({
      type: "energie_chute",
      contexte: {
        energie_actuelle: energie,
        exercices_restants: exercicesRestants.length,
        exercices_coupes: bilan.exercices_coupes,
        suggestion: bilan.suggestion,
      },
      decision: bilan.message,
    });

  const alleger = () => {
    tracer();
    onApply(bilan.exercices_coupes, bilan.rpe_reduit_sur);
    onClose();
  };

  const arreter = () => {
    tracer();
    onStopSeance();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-encre/80 flex items-end justify-center">
      <div className="bg-carte rounded-t-2xl w-full max-w-md p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-encre">Où en est ton énergie ?</h2>
          <button onClick={onClose} className="p-2" aria-label="Fermer">
            <X className="w-5 h-5 text-encre-2" />
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <label className="text-encre-2 text-sm">Énergie actuelle</label>
            <span className="text-encre font-medium chiffres tabular-nums">{energie}/10</span>
          </div>
          <Slider
            value={[energie]}
            onValueChange={(v) => setEnergie(Array.isArray(v) ? v[0]! : v)}
            min={1} max={10} step={1}
            className="w-full"
          />
        </div>

        <div className="rounded-lg border border-filet bg-papier-2 p-3">
          <p className="text-encre-2 text-sm">{bilan.message}</p>
          <p className="text-encre-3 text-xs mt-1">
            {exercicesRestants.length} exercice{exercicesRestants.length > 1 ? "s" : ""} restant
            {exercicesRestants.length > 1 ? "s" : ""}.
          </p>
        </div>

        {bilan.suggestion === "rien" && (
          /* Rien à appliquer : pas de bouton qui prétende le contraire. */
          <Button variant="outline" className="w-full border-filet text-encre" onClick={onClose}>
            Continuer la séance
          </Button>
        )}

        {bilan.suggestion === "alleger" && (
          <>
            <div className="space-y-2">
              {bilan.exercices_coupes.length > 0 && (
                <div>
                  <p className="text-encre-2 text-sm">Retirés :</p>
                  <ul className="mt-1 space-y-1">
                    {bilan.exercices_coupes.map((nom) => (
                      <li key={nom} className="text-encre text-sm bg-papier-2 rounded-lg px-3 py-2">{nom}</li>
                    ))}
                  </ul>
                </div>
              )}
              {bilan.rpe_reduit_sur.length > 0 && (
                <div>
                  <p className="text-encre-2 text-sm">Allégés d&apos;un point d&apos;effort :</p>
                  <ul className="mt-1 space-y-1">
                    {bilan.rpe_reduit_sur.map((nom) => (
                      <li key={nom} className="text-encre text-sm bg-papier-2 rounded-lg px-3 py-2">{nom}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 border-filet text-encre" onClick={onClose}>
                Je continue tel quel
              </Button>
              <Button className="flex-1 bg-encre text-papier" onClick={alleger}>
                Alléger la suite
              </Button>
            </div>
          </>
        )}

        {bilan.suggestion === "stop" && (
          /*
            Arrêter est un geste réel, pas un message. Il se confirme, et il
            termine effectivement la séance — ce que « Appliquer les
            changements » ne faisait pas.
          */
          <>
            {confirme ? (
              <div className="space-y-2">
                <p className="text-encre-2 text-sm">
                  La séance sera clôturée avec les séries déjà validées. Celles-ci sont
                  conservées.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 border-filet text-encre"
                    onClick={() => setConfirme(false)}>
                    Finalement je continue
                  </Button>
                  <Button variant="destructive" className="flex-1" onClick={arreter}>
                    Terminer maintenant
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 border-filet text-encre" onClick={onClose}>
                  Je continue
                </Button>
                <Button className="flex-1 bg-encre text-papier" onClick={() => setConfirme(true)}>
                  Terminer la séance
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
