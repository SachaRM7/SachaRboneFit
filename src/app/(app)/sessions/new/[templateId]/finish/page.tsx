"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSessionStore } from "@/stores/sessionStore";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ProgressionSummary } from "@/components/session/ProgressionSummary";
import { Feu } from "@/components/carnet/Feu";

export default function FinishSessionPage() {
  const { templateId } = useParams();
  const router = useRouter();
  const { active, clear } = useSessionStore();
  const [energie, setEnergie] = useState(7);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [feuTendance, setFeuTendance] = useState<string | null>(null);
  const [feuTendanceRaison, setFeuTendanceRaison] = useState<string | null>(null);

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
      (s) => s.repsEffectuees !== null && s.charge !== null,
    );

    if (validSets.length === 0) {
      toast.error("Au moins une série est requise");
      return;
    }

    setLoading(true);
    try {
      // Complete LA seance existante. L'ancien flux envoyait un POST, ce qui creait
      // une deuxieme ligne session_logs : l'une portait le contexte sans series,
      // l'autre les series sans contexte.
      const res = await fetch(`/api/session-logs/${active.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dureeMinutes: Math.round((Date.now() - active.startedAt) / 60000),
          energieFin: energie,
          notesSeance: notes || null,
          feuBiologiqueTendance: feuTendance,
          series: validSets.map((s) => ({
            exerciseInstanceId: s.exerciseInstanceId,
            numeroSerie: s.numeroSerie,
            repsEffectuees: s.repsEffectuees,
            charge: s.charge,
            rpeEffectif: s.rpeEffectif,
            reposReelSecondes: s.reposReelSecondes ?? null,
            notes: s.notes ?? null,
          })),
        }),
      });

      if (!res.ok) throw new Error("cloture impossible");

      const sessionLogId = active.id;
      clear();
      toast.success("Séance enregistrée");
      router.push(`/sessions/${sessionLogId}`);
    } catch {
      toast.error("Erreur lors de l'enregistrement");
      setLoading(false);
    }
  };

  if (!active) return null;

  const startedAt = new Date(active.startedAt);
  const now = new Date();
  const duration = Math.round((now.getTime() - startedAt.getTime()) / 60000);


  return (
    <div className="min-h-screen bg-papier p-4 space-y-6 pb-24">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold text-encre">Séance terminée</h1>
        <span className="flex items-center gap-2 text-xs text-encre-3">
          <Feu niveau={feuTendance} />
          {new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-px bg-filet border border-filet rounded-lg overflow-hidden">
        <div className="bg-papier p-3">
          <p className="text-[11px] text-encre-3">Durée</p>
          <p className="chiffres text-xl font-semibold text-encre mt-0.5">{duration}<span className="text-xs text-encre-3 ml-1">min</span></p>
        </div>
        <div className="bg-papier p-3">
          <p className="text-[11px] text-encre-3">Exercices</p>
          <p className="chiffres text-xl font-semibold text-encre mt-0.5">
            {new Set(active.sets.map((s) => s.exerciseInstanceId)).size}
          </p>
        </div>
        <div className="bg-papier p-3">
          <p className="text-[11px] text-encre-3">Séries</p>
          <p className="chiffres text-xl font-semibold text-encre mt-0.5">{active.sets.length}</p>
        </div>
      </div>

      <ProgressionSummary
        sets={active.sets.filter((s) => s.repsEffectuees !== null && s.charge !== null) as Array<{ exerciseInstanceId: string; repsEffectuees: number; charge: number }>}
        templateId={active.seanceTemplateId}
      />

      <div className="border border-filet rounded-lg p-3 bg-carte">
        <p className="text-sm text-encre-3 italic">Feu de tendance</p>
        <p className="text-sm text-encre-2 mt-1 leading-relaxed">
          {feuTendanceRaison ?? (feuTendance ? `Tendance ${feuTendance}` : "Analyse en cours…")}
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-encre-2">Ton énergie en fin de séance</Label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="1"
            max="10"
            value={energie}
            onChange={(e) => setEnergie(parseInt(e.target.value))}
            className="flex-1 accent-[var(--encre)]"
            aria-label="Énergie de fin, de 1 à 10"
          />
          <span className="chiffres text-2xl font-semibold text-encre w-10 text-center">{energie}</span>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-encre-2">Notes</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Sensations, douleurs, remarques…"
          className="bg-carte border-filet text-encre"
        />
      </div>

      <Button
        className="w-full h-13 rounded-full bg-encre text-papier hover:bg-encre/90"
        onClick={handleSubmit}
        disabled={loading}
      >
        {loading ? "Enregistrement…" : "Enregistrer la séance"}
      </Button>
    </div>
  );
}
