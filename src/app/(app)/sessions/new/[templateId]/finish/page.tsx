"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSessionStore } from "@/stores/sessionStore";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ProgressionSummary } from "@/components/session/ProgressionSummary";

const PILIER_COLORS: Record<string, string> = {
  "poussee": "bg-blue-600",
  "tirage": "bg-green-600",
  "squat": "bg-orange-600",
  "hanche": "bg-red-600",
  "epaules": "bg-purple-600",
  "bras": "bg-cyan-600",
  "jambes_iso": "bg-yellow-600",
  "core": "bg-zinc-600",
};

function FeuIndicator({ feu, label }: { feu: string | null; label: string }) {
  if (!feu) return null;
  const colorMap: Record<string, string> = {
    vert: "bg-green-500",
    orange: "bg-orange-500",
    rouge: "bg-red-500",
  };
  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full ${colorMap[feu] || "bg-zinc-500"}`} />
      <span className="text-sm text-zinc-400">{label}: {feu}</span>
    </div>
  );
}

export default function FinishSessionPage() {
  const { templateId } = useParams();
  const router = useRouter();
  const { active, clear } = useSessionStore();
  const [energie, setEnergie] = useState(75);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [feuTendance, setFeuTendance] = useState<string | null>(null);
  const [feuTendanceRaison, setFeuTendanceRaison] = useState<string | null>(null);
  const [feuJour, setFeuJour] = useState<string | null>(null);

  useEffect(() => {
    if (!active) {
      router.replace(`/sessions/new/${templateId}`);
      return;
    }
    // Compute feu tendency before finishing
    computeTendance();
  }, [active]);

  const computeTendance = async () => {
    if (!active) return;
    try {
      const res = await fetch(`/api/sessions/tendency?seanceTemplateId=${active.seanceTemplateId}&limit=3`);
      if (res.ok) {
        const data = await res.json();
        // Import dynamically to avoid issues
        const { computeFeuTendance } = await import("@/lib/engine/feu-biologique");
        // Build sessions array including current (with current sets)
        const sessionsForTendance = data.sessions || [];
        // Add current session as the latest
        const currentPerf = active.sets
          .filter(s => s.repsEffectuees !== null && s.charge !== null)
          .map(s => ({
            exerciseInstanceId: s.exerciseInstanceId,
            exerciseName: "Exercice",
            volumeTotal: (s.charge || 0) * (s.repsEffectuees || 0),
            estimated1RM: (s.charge || 0) * (1 + (s.repsEffectuees || 0) / 30),
          }));
        if (currentPerf.length > 0) {
          sessionsForTendance.unshift({
            date: new Date().toISOString().slice(0, 10),
            feuJour: null,
            pilierPerfs: currentPerf,
          });
        }
        const result = computeFeuTendance({ sessions: sessionsForTendance });
        setFeuTendance(result.feu);
        setFeuTendanceRaison(result.raison);
      }
    } catch {
      // Silently fail
    }
  };

  const handleSubmit = async () => {
    if (!active) return;

    const validSets = active.sets.filter(
      (s) => s.repsEffectuees !== null && s.charge !== null
    );


    if (validSets.length === 0) {
      toast.error("Au moins une série est requise");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seanceTemplateId: active.seanceTemplateId || null,
          gymId: active.gymId,
          date: new Date().toISOString().slice(0, 10),
          dureeMinutes: Math.round((Date.now() - active.startedAt) / 60000),
          energieFin: energie,
          notesSeance: notes,
          sets: validSets,
          feuBiologiqueTendance: feuTendance,
        }),
      });

      if (!res.ok) throw new Error();

      clear();
      const data = await res.json();
      toast.success("Séance enregistrée");

      // Get template letter for the debrief
      let templateLettre = templateId as string;
      try {
        const templateRes = await fetch(`/api/sessions/${active.seanceTemplateId}`);
        if (templateRes.ok) {
          const templateData = await templateRes.json();
          templateLettre = templateData.lettre || templateId as string;
        }
      } catch {
        // Use URL templateId as fallback
      }

      const today = new Date().toISOString().slice(0, 10);
      router.push(`/sessions/${data.id}?templateLettre=${encodeURIComponent(templateLettre)}&sessionDate=${encodeURIComponent(today)}`);
    } catch {
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setLoading(false);
    }
  };

  if (!active) return null;

  const startedAt = new Date(active.startedAt);
  const now = new Date();
  const duration = Math.round((now.getTime() - startedAt.getTime()) / 60000);

  const feuTendanceDisplay = feuTendance ? (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full ${
        feuTendance === "vert" ? "bg-green-500" :
        feuTendance === "orange" ? "bg-orange-500" : "bg-red-500"
      }`} />
      <span className="text-sm text-zinc-300">{feuTendanceRaison || `Tendance ${feuTendance}`}</span>
    </div>
  ) : (
    <span className="text-sm text-zinc-500">Analyse en cours...</span>
  );

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-bold text-white">Terminer la séance</h1>

      <div className="bg-zinc-900 rounded-lg p-4 space-y-2">
        <div className="flex justify-between">
          <span className="text-zinc-500">Durée</span>
          <span className="text-white font-medium">{duration} min</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">Exercices</span>
          <span className="text-white font-medium">
            {new Set(active.sets.map((s) => s.exerciseInstanceId)).size}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">Séries</span>
          <span className="text-white font-medium">{active.sets.length}</span>
        </div>
      </div>

      {/* Feu de tendance */}
      <div className="bg-zinc-900 rounded-lg p-4 space-y-2">
        <p className="text-zinc-500 text-sm">Feu biologique de tendance</p>
        {feuTendanceDisplay}
      </div>

      {/* Résumé des progressions */}
      <ProgressionSummary
        sets={active.sets.filter(s => s.repsEffectuees !== null && s.charge !== null) as Array<{ exerciseInstanceId: string; repsEffectuees: number; charge: number }>}
        templateId={active.seanceTemplateId}
      />

      <div className="space-y-2">
        <Label>Énergie de fin (0-100)</Label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="0"
            max="100"
            value={energie}
            onChange={(e) => setEnergie(parseInt(e.target.value))}
            className="flex-1"
          />
          <span className="text-2xl font-bold text-white w-12 text-center">{energie}</span>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="observations, remarques..."
          className="bg-zinc-900 border-zinc-800 text-white"
        />
      </div>

      <Button className="w-full h-14 text-lg" onClick={handleSubmit} disabled={loading}>
        {loading ? "Enregistrement..." : "Enregistrer la séance"}
      </Button>
    </div>
  );
}