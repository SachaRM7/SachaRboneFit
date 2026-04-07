"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSessionStore } from "@/stores/sessionStore";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function FinishSessionPage() {
  const { templateId } = useParams();
  const router = useRouter();
  const { active, clear } = useSessionStore();
  const [energie, setEnergie] = useState(75);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!active) {
      router.replace(`/sessions/new/${templateId}`);
    }
  }, [active, templateId]);

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
          seanceTemplateId: active.seanceTemplateId,
          gymId: active.gymId,
          date: new Date().toISOString().split("T")[0],
          dureeMinutes: Math.round((Date.now() - active.startedAt) / 60000),
          energieFin: energie,
          notesSeance: notes,
          sets: validSets,
        }),
      });

      if (!res.ok) throw new Error();

      clear();
      const data = await res.json();
      toast.success("Séance enregistrée");
      router.push(`/sessions/${data.id}`);
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
