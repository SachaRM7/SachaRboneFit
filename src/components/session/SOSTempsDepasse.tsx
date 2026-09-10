"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tempsDepasse } from "@/lib/sos/temps-depasse";
import { formaterEcoulee } from "@/lib/engine/duree-seance";
import type { ExerciceRestant } from "@/lib/sos/types";

interface SOSTempsDepasseProps {
  dureeActuelleMin: number;
  dureeCibleMin: number;
  exercicesRestants: ExerciceRestant[];
  seriesRestantesPar?: Record<string, number>;
  reposSecondesPar?: Record<string, number>;
  onClose: () => void;
  onApply: (resultat: { exercicesCoupes: string[]; minutesRestantes: number }) => void;
  onIncident: (data: { type: string; contexte: Record<string, unknown>; decision: string }) => void;
}

const CHOIX = [15, 30, 45] as const;

/** Choisit un temps restant ; le moteur existant décide seul des coupes. */
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
  const [minutes, setMinutes] = useState<number | null>(null);
  const [personnalise, setPersonnalise] = useState("");
  const budget = minutes === -1 ? Number.parseInt(personnalise, 10) : minutes;
  const budgetValide = budget != null && Number.isFinite(budget) && budget >= 5 && budget <= 180;

  const bilan = useMemo(
    () => budgetValide
      ? tempsDepasse(
          dureeActuelleMin,
          dureeActuelleMin + budget,
          exercicesRestants,
          reposSecondesPar,
          seriesRestantesPar,
        )
      : null,
    [budget, budgetValide, dureeActuelleMin, exercicesRestants, reposSecondesPar, seriesRestantesPar],
  );

  const appliquer = () => {
    if (!bilan || !budgetValide) return;
    onApply({ exercicesCoupes: bilan.exercices_coupes, minutesRestantes: budget });
    onIncident({
      type: "temps_depasse",
      contexte: {
        duree_actuelle_min: dureeActuelleMin,
        duree_cible_initiale_min: dureeCibleMin,
        minutes_restantes: budget,
        exercices_coupes: bilan.exercices_coupes,
        fin_estimee_min: bilan.temps_estime_apres_coupe_min,
      },
      decision: bilan.message,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-encre/80 flex items-end justify-center" role="dialog" aria-modal="true">
      <div
        className="bg-carte rounded-t-2xl w-full max-w-md p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-4 max-h-[85dvh] overflow-y-auto"
        style={{ paddingBottom: "calc(1rem + var(--marge-bas))" }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-encre">Combien de temps te reste-t-il&nbsp;?</h2>
            <p className="text-encre-3 text-xs mt-1">
              {formaterEcoulee(dureeActuelleMin * 60)} écoulées · cible initiale {dureeCibleMin} min
            </p>
          </div>
          <button onClick={onClose} className="p-2" aria-label="Fermer">
            <X className="w-5 h-5 text-encre-2" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2" aria-label="Temps restant">
          {CHOIX.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setMinutes(n)}
              aria-pressed={minutes === n}
              className={`h-14 rounded-xl border text-base font-semibold ${minutes === n ? "border-encre bg-encre text-papier" : "border-filet bg-papier-2 text-encre"}`}
            >
              {n} min
            </button>
          ))}
          <button
            type="button"
            onClick={() => setMinutes(-1)}
            aria-pressed={minutes === -1}
            className={`h-14 rounded-xl border text-base font-semibold ${minutes === -1 ? "border-encre bg-encre text-papier" : "border-filet bg-papier-2 text-encre"}`}
          >
            Autre
          </button>
        </div>

        {minutes === -1 && (
          <label className="block text-sm text-encre-2">
            Minutes restantes
            <input
              type="number"
              min={5}
              max={180}
              inputMode="numeric"
              value={personnalise}
              onChange={(e) => setPersonnalise(e.target.value)}
              className="mt-1 w-full h-12 rounded-xl border border-filet bg-carte px-3 text-encre chiffres"
            />
          </label>
        )}

        {bilan && (
          <div className="rounded-xl border border-filet bg-papier-2 p-3 space-y-2" aria-live="polite">
            <p className="font-medium text-encre">Plan pour les {budget} prochaines minutes</p>
            {bilan.exercices_coupes.length > 0 ? (
              <>
                <p className="text-sm text-encre-2">
                  {bilan.exercices_coupes.length} exercice{bilan.exercices_coupes.length > 1 ? "s" : ""} accessoire{bilan.exercices_coupes.length > 1 ? "s" : ""} retiré{bilan.exercices_coupes.length > 1 ? "s" : ""} :
                </p>
                <ul className="space-y-1">
                  {bilan.exercices_coupes.map((nom) => <li key={nom} className="text-sm text-encre">{nom}</li>)}
                </ul>
              </>
            ) : (
              <p className="text-sm text-encre-2">Aucun exercice à retirer. Le programme reste intact.</p>
            )}
            <p className="text-xs text-encre-3">Les séries déjà faites et les exercices principaux restent intacts.</p>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 border-filet text-encre" onClick={onClose}>Annuler</Button>
          <Button className="flex-1 bg-encre text-papier" disabled={!bilan} onClick={appliquer}>Adapter</Button>
        </div>
      </div>
    </div>
  );
}
