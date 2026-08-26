"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { douleur } from "@/lib/sos/douleur";
import { SOSResultat } from "./SOSResultat";
import type { DouleurResult, ExerciceRestant } from "@/lib/sos/types";
import { ZONES_DOULEUR } from "@/lib/referentiels/muscles";

// Les zones viennent du referentiel : chacune est reliee aux muscles qu'elle implique.
// L'ancienne liste etait ecrite ici et ne correspondait a aucune donnee de la base.
const ZONES = ZONES_DOULEUR.map((z) => z.zone);
const TYPES = [
  { value: "sourde", label: "Sourde" },
  { value: "aiguë", label: "Aiguë" },
  { value: "irradiation", label: "Irradiation" },
  { value: "raideur", label: "Raideur" },
] as const;

interface SOSDouleurProps {
  exercicesRestants: ExerciceRestant[];
  onClose: () => void;
  onStopSeance: () => void;
  onSkipExercices: (ids: string[]) => void;
  onAllegerExercices: (ids: string[]) => void;
  onIncident: (data: { type: string; contexte: Record<string, unknown>; decision: string }) => void;
  sessionLogId: string;
}

export function SOSDouleur({
  exercicesRestants,
  onClose,
  onStopSeance,
  onSkipExercices,
  onAllegerExercices,
  onIncident,
  sessionLogId,
}: SOSDouleurProps) {
  const [zone, setZone] = useState("");
  const [niveau, setNiveau] = useState(5);
  const [typeDouleur, setTypeDouleur] = useState<"sourde" | "aiguë" | "irradiation" | "raideur">("sourde");
  const [result, setResult] = useState<DouleurResult | null>(null);
  const [showResult, setShowResult] = useState(false);

  const handleEvaluate = () => {
    const res = douleur(zone, niveau, typeDouleur, exercicesRestants);
    setResult(res);
    setShowResult(true);

    // Create incident
    onIncident({
      type: "douleur",
      contexte: { zone, niveau, type_douleur: typeDouleur, action: res.action },
      decision: res.message,
    });

    if (res.action === "stop_seance") {
      // handled by button in result
    } else if (res.action === "skip_zone") {
      const ids = res.exercices_impactes.map(e => e.exercise_instance_id);
      onSkipExercices(ids);
    } else if (res.action === "alleger") {
      const ids = res.exercices_impactes.map(e => e.exercise_instance_id);
      onAllegerExercices(ids);
    }
  };

  if (showResult && result) {
    const exercicesWithNames = result.exercices_impactes.map(e => ({
      ...e,
      nom: exercicesRestants.find(ex => ex.exercise_instance_id === e.exercise_instance_id)?.nom || e.exercise_instance_id,
    }));

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
            message={result.message}
            exercicesImpactes={exercicesWithNames}
            actions={
              result.action === "stop_seance"
                ? [
                    { label: "Terminer la séance", onClick: onStopSeance, variant: "destructive" as const },
                    { label: "Continuer quand même", onClick: onClose, variant: "outline" as const },
                  ]
                : [
                    { label: "OK", onClick: onClose },
                  ]
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-encre/80 flex items-end justify-center">
      <div className="bg-carte rounded-t-2xl w-full max-w-md p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-encre">Douleur</h2>
          <button onClick={onClose} className="p-2">
            <X className="w-5 h-5 text-encre-2" />
          </button>
        </div>

        {/* Zone */}
        <div className="space-y-2">
          <label className="text-encre-2 text-sm">Zone touchée</label>
          <div className="flex flex-wrap gap-2">
            {ZONES.map((z) => (
              <button
                key={z}
                onClick={() => setZone(z)}
                className={`px-3 py-1.5 rounded text-sm ${
                  zone === z ? "bg-feu-orange text-encre" : "bg-papier-2 text-encre-2"
                }`}
              >
                {z}
              </button>
            ))}
          </div>
        </div>

        {/* Niveau */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <label className="text-encre-2 text-sm">Niveau</label>
            <span className="text-encre font-medium">{niveau}/10</span>
          </div>
          <Slider
            value={[niveau]}
            onValueChange={(v) => setNiveau(Array.isArray(v) ? v[0]! : v)}
            min={1}
            max={10}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-encre-3">
            <span>Gêne légère</span>
            <span>Insupportable</span>
          </div>
        </div>

        {/* Type */}
        <div className="space-y-2">
          <label className="text-encre-2 text-sm">Type de douleur</label>
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setTypeDouleur(t.value)}
                className={`px-3 py-2 rounded text-sm ${
                  typeDouleur === t.value ? "bg-feu-orange text-encre" : "bg-papier-2 text-encre-2"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <Button className="w-full" onClick={handleEvaluate} disabled={!zone}>
          Évaluer
        </Button>

        <Button variant="outline" className="w-full" onClick={onClose}>
          Annuler
        </Button>
      </div>
    </div>
  );
}