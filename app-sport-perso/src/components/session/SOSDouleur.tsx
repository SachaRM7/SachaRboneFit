"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { douleur } from "@/lib/sos/douleur";
import { SOSResultat } from "./SOSResultat";
import type { DouleurResult } from "@/lib/sos/types";

const ZONES = ["épaule", "bas du dos", "genou", "poignet", "coude", "cou", "hanche", "cheville", "quadriceps", "ischios", "pectoraux", "dorsaux"];
const TYPES = [
  { value: "sourde", label: "Sourde" },
  { value: "aiguë", label: "Aiguë" },
  { value: "irradiation", label: "Irradiation" },
  { value: "raideur", label: "Raideur" },
] as const;

interface SOSDouleurProps {
  exercicesRestants: { exercise_instance_id: string; nom: string; muscles_principaux: string[]; categorie_role: string; statut: string }[];
  onClose: () => void;
  onStopSeance: () => void;
  onSkipExercices: (ids: string[]) => void;
  onAllegerExercices: (ids: string[]) => void;
  onIncident: (data: { type: string; contexte: Record<string, any>; decision: string }) => void;
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
    const res = douleur(zone, niveau, typeDouleur, exercicesRestants as any);
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
      <div className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center">
        <div className="bg-zinc-900 rounded-t-2xl w-full max-w-md p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Résultat</h2>
            <button onClick={onClose} className="p-2">
              <X className="w-5 h-5 text-zinc-400" />
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
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center">
      <div className="bg-zinc-900 rounded-t-2xl w-full max-w-md p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Douleur</h2>
          <button onClick={onClose} className="p-2">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Zone */}
        <div className="space-y-2">
          <label className="text-zinc-400 text-sm">Zone touchée</label>
          <div className="flex flex-wrap gap-2">
            {ZONES.map((z) => (
              <button
                key={z}
                onClick={() => setZone(z)}
                className={`px-3 py-1.5 rounded text-sm ${
                  zone === z ? "bg-amber-600 text-white" : "bg-zinc-800 text-zinc-300"
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
            <label className="text-zinc-400 text-sm">Niveau</label>
            <span className="text-white font-medium">{niveau}/10</span>
          </div>
          <Slider
            value={[niveau]}
            onValueChange={(v) => setNiveau(Array.isArray(v) ? v[0]! : v)}
            min={1}
            max={10}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-zinc-500">
            <span>Gêne légère</span>
            <span>Insupportable</span>
          </div>
        </div>

        {/* Type */}
        <div className="space-y-2">
          <label className="text-zinc-400 text-sm">Type de douleur</label>
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setTypeDouleur(t.value)}
                className={`px-3 py-2 rounded text-sm ${
                  typeDouleur === t.value ? "bg-amber-600 text-white" : "bg-zinc-800 text-zinc-300"
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