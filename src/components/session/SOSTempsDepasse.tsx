"use client";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tempsDepasse } from "@/lib/sos/temps-depasse";
import { formaterEcoulee } from "@/lib/engine/duree-seance";
import type { ExerciceRestant } from "@/lib/sos/types";

interface SOSTempsDepasseProps {
  dureeActuelleMin: number;
  dureeCibleMin: number;
  exercicesRestants: ExerciceRestant[];
  /** Séries encore à faire, par instance : le coût réel de ce qui reste. */
  seriesRestantesPar?: Record<string, number>;
  reposSecondesPar?: Record<string, number>;
  onClose: () => void;
  onApply: (exercicesCoupes: string[]) => void;
  onIncident: (data: { type: string; contexte: Record<string, unknown>; decision: string }) => void;
}

/**
 * Le temps de séance, dit sans détour.
 *
 * L'écran affichait « 105 min / cible 60 min », puis « Temps OK après
 * recalcul », puis un bouton « Appliquer les coupes » qui ne disait pas ce
 * qu'il couperait. Trois affirmations dont deux se contredisaient.
 *
 * Il montre maintenant l'écart avant d'agir : où l'on arrive en finissant
 * tout, ce que retirer changerait, et nommément quoi. Le bouton n'apparaît que
 * s'il y a vraiment quelque chose à retirer — proposer d'appliquer un
 * changement vide était le même défaut que sur l'écran Énergie.
 */
export function SOSTempsDepasse({
  dureeActuelleMin,
  dureeCibleMin,
  exercicesRestants,
  seriesRestantesPar = {},
  reposSecondesPar = {},
  onClose,
  onApply,
  onIncident,
}: SOSTempsDepasseProps) {
  // Le calcul est déterministe et sans effet : il se fait au rendu, et rien
  // n'oblige à appuyer sur un bouton pour savoir où l'on en est.
  const bilan = tempsDepasse(
    dureeActuelleMin, dureeCibleMin, exercicesRestants, reposSecondesPar, seriesRestantesPar,
  );
  const aQuelqueChoseARetirer = bilan.exercices_coupes.length > 0;

  const appliquer = () => {
    onApply(bilan.exercices_coupes);
    onIncident({
      type: "temps_depasse",
      contexte: {
        duree_actuelle_min: dureeActuelleMin,
        duree_cible_min: dureeCibleMin,
        exercices_coupes: bilan.exercices_coupes,
        fin_estimee_min: bilan.temps_estime_apres_coupe_min,
      },
      decision: bilan.message,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-encre/80 flex items-end justify-center">
      <div className="bg-carte rounded-t-2xl w-full max-w-md p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-encre">Le temps qui passe</h2>
          <button onClick={onClose} className="p-2" aria-label="Fermer">
            <X className="w-5 h-5 text-encre-2" />
          </button>
        </div>

        <div className="rounded-lg border border-filet bg-papier-2 p-3 space-y-1">
          <p className="text-encre text-sm">
            <span className="chiffres tabular-nums">{formaterEcoulee(dureeActuelleMin * 60)}</span> écoulées,
            pour une durée idéale de{" "}
            <span className="chiffres tabular-nums">{dureeCibleMin} min</span>.
          </p>
          <p className="text-encre-2 text-sm">{bilan.message}</p>
        </div>

        {aQuelqueChoseARetirer ? (
          <>
            <div className="space-y-1.5">
              <p className="text-encre-2 text-sm">Ce qui serait retiré :</p>
              <ul className="space-y-1">
                {bilan.exercices_coupes.map((nom) => (
                  <li key={nom} className="text-encre text-sm bg-papier-2 rounded-lg px-3 py-2">
                    {nom}
                  </li>
                ))}
              </ul>
              {/* Seuls les accessoires sont proposés : retirer un pilier
                  changerait la séance, pas seulement sa durée. */}
              <p className="text-encre-3 text-xs">
                Tes exercices principaux ne sont jamais retirés.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 border-filet text-encre" onClick={onClose}>
                Je continue
              </Button>
              <Button className="flex-1 bg-encre text-papier" onClick={appliquer}>
                Retirer ces exercices
              </Button>
            </div>
          </>
        ) : (
          /* Pas de diff, pas de bouton : proposer d'appliquer un changement
             vide était le défaut de l'écran Énergie, il ne se reproduit pas. */
          <Button variant="outline" className="w-full border-filet text-encre" onClick={onClose}>
            Continuer la séance
          </Button>
        )}
      </div>
    </div>
  );
}
