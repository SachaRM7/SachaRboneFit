"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSessionStore } from "@/stores/sessionStore";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, Check } from "lucide-react";

interface ExerciseBlockProps {
  exercise: {
    id: string;
    nom: string;
    machineNom: string;
    seriesCibles: number;
    fourchetteRepsMin: number;
    fourchetteRepsMax: number;
    tempo: string;
    incrementsPossibles: number[];
    poidsNonCompte: number | null;
  };
  history: { charge: number; reps: number; rpe?: number }[];
  onNext: () => void;
}

function ExerciseBlock({ exercise, history, onNext }: ExerciseBlockProps) {
  const { upsertSet, active } = useSessionStore();
  const [currentSerie, setCurrentSerie] = useState(1);
  const [charge, setCharge] = useState(exercise.incrementsPossibles[0] || 0);
  const [reps, setReps] = useState(exercise.fourchetteRepsMin);
  const [rpe, setRpe] = useState(8);
  const [validated, setValidated] = useState<number[]>([]);

  const increment = exercise.incrementsPossibles[0] || 2.5;

  const handleValidate = () => {
    upsertSet({
      exerciseInstanceId: exercise.id,
      numeroSerie: currentSerie,
      repsEffectuees: reps,
      charge,
      rpeEffectif: rpe,
      validatedAt: Date.now(),
    });
    const newValidated = [...validated, currentSerie];
    setValidated(newValidated);

    if (newValidated.length >= exercise.seriesCibles) {
      onNext();
    } else {
      setCurrentSerie(currentSerie + 1);
    }
  };

  const adjustCharge = (delta: number) => {
    setCharge((c) => Math.max(0, c + delta));
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-4">
      <div>
        <p className="text-white font-semibold">{exercise.nom}</p>
        <p className="text-zinc-500 text-sm">{exercise.machineNom}</p>
      </div>

      {history.length > 0 && history[0] && (
        <div className="text-zinc-500 text-xs">
          Dernier: {history[0].charge}kg × {history.map(h => h.reps).join("/")}
        </div>
      )}

      <div className="text-center py-2">
        <p className="text-4xl font-bold text-white">{exercise.tempo}</p>
        <p className="text-zinc-500 text-sm">Tempo</p>
      </div>

      <div className="text-center">
        <p className="text-6xl font-bold text-white">{charge}<span className="text-2xl text-zinc-500">kg</span></p>
        <div className="flex justify-center gap-4 mt-2">
          <Button variant="outline" size="lg" className="bg-zinc-800" onClick={() => adjustCharge(-increment)}>−</Button>
          <Button variant="outline" size="lg" className="bg-zinc-800" onClick={() => adjustCharge(increment)}>+</Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-zinc-500">Répétitions</span>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="bg-zinc-800" onClick={() => setReps(r => Math.max(1, r - 1))}>−</Button>
          <span className="text-2xl font-bold text-white w-12 text-center">{reps}</span>
          <Button variant="outline" size="sm" className="bg-zinc-800" onClick={() => setReps(r => r + 1)}>+</Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-zinc-500">RPE</span>
          <span className="text-white font-medium">{rpe}</span>
        </div>
        <input
          type="range"
          min="6"
          max="10"
          step="0.5"
          value={rpe}
          onChange={(e) => setRpe(parseFloat(e.target.value))}
          className="w-full"
        />
      </div>

      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: exercise.seriesCibles }, (_, i) => i + 1).map((n) => (
          <div
            key={n}
            className={`h-10 rounded flex items-center justify-center text-sm font-medium ${
              validated.includes(n)
                ? "bg-green-700 text-white"
                : n === currentSerie
                ? "bg-zinc-700 text-white"
                : "bg-zinc-800 text-zinc-500"
            }`}
          >
            {validated.includes(n) ? <Check className="w-4 h-4" /> : n}
          </div>
        ))}
      </div>

      <Button
        className="w-full h-14 text-lg"
        onClick={handleValidate}
        disabled={validated.includes(currentSerie)}
      >
        {validated.includes(currentSerie) ? "Validée" : `Valider série ${currentSerie}`}
      </Button>
    </div>
  );
}

export default function LiveSessionPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = useParams();
  const searchParams = useSearchParams();
  const gymId = searchParams.get("gymId") || "";
  const router = useRouter();
  const { active, start, clear, setCurrentExerciseIndex } = useSessionStore();
  const [templateData, setTemplateData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/sessions/${templateId}`)
      .then((r) => r.json())
      .then((d) => {
        setTemplateData(d);
        setLoading(false);
      });
  }, [templateId]);

  useEffect(() => {
    if (!active && templateData) {
      start({
        seanceTemplateId: templateId as string,
        gymId,
      });
    }
  }, [templateData, active]);

  if (loading) return <div className="p-4 text-white">Chargement...</div>;
  if (!templateData) return <div className="p-4 text-white">Template non trouvé</div>;

  const exercises = templateData.exercises || [];

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-5 h-5 text-white" />
        </Button>
        <h1 className="text-xl font-bold text-white">{templateData.nom}</h1>
      </div>

      <div className="space-y-4">
        {exercises.map((ex: any, i: number) => (
          <ExerciseBlock
            key={ex.id}
            exercise={ex}
            history={[]}
            onNext={() => setCurrentExerciseIndex(i + 1)}
          />
        ))}
      </div>

      <Button
        className="w-full"
        variant="outline"
        onClick={() => router.push(`/sessions/new/${templateId}/finish`)}
      >
        Terminer la séance
      </Button>
    </div>
  );
}
