"use client";
import { Suspense, useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSessionStore } from "@/stores/sessionStore";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, Check } from "lucide-react";
import { RestTimer } from "@/components/session/RestTimer";
import { initAudioContext, playBeep } from "@/lib/audio/beep";
import { SOSBar } from "@/components/session/SOSBar";
import { SOSMachineOccupee } from "@/components/session/SOSMachineOccupee";
import { SOSDouleur } from "@/components/session/SOSDouleur";
import { SOSEnergie } from "@/components/session/SOSEnergie";
import { SOSTempsDepasse } from "@/components/session/SOSTempsDepasse";
import { ProactiveAlert } from "@/components/coach/ProactiveAlert";
import type { ExerciseInstanceWithExercise } from "@/lib/engine/substitutions";
import type { ExerciceRestant } from "@/lib/sos/types";

type Courbature = { muscle: string; intensite: number };
interface TemplateResponse { nom: string; lettre?: string; exercises?: ExerciseFromTemplate[] }

type SOSModal = "machine" | "douleur" | "energie" | "temps" | null;

/** Le role vient de la base en texte libre : on le ramene aux trois valeurs du moteur. */
function normaliserRole(role: string | null | undefined): ExerciceRestant["categorie_role"] {
  return role === "pilier" || role === "substitut" ? role : "accessoire";
}

interface ExerciseFromTemplate {
  id: string;
  nom: string;
  machineNom: string;
  seriesCibles: number;
  fourchetteRepsMin: number;
  fourchetteRepsMax: number;
  tempo: string;
  incrementsPossibles: number[];
  reposSecondes: number | null;
  poidsNonCompte: number | null;
  categorieRole: string;
  profilTension: string;
  musclesPrincipaux: string[];
  ordre: number;
}

function ExerciseBlock({
  exercise,
  history,
  onNext,
  showTimer,
  timerDuration,
  onTimerComplete,
  onTimerSkip,
  onTimerExtend,
  audioInitialized,
  isSkipped,
  rpeReduction,
}: {
  exercise: ExerciseFromTemplate;
  history: { charge: number; reps: number; rpe?: number }[];
  onNext: () => void;
  showTimer: boolean;
  timerDuration: number | null;
  onTimerComplete: () => void;
  onTimerSkip: () => void;
  onTimerExtend: (s: number) => void;
  audioInitialized: boolean;
  isSkipped: boolean;
  rpeReduction: number;
}) {
  const { upsertSet, active } = useSessionStore();
  const [currentSerie, setCurrentSerie] = useState(1);
  const [charge, setCharge] = useState(exercise.incrementsPossibles[0] || 0);
  const [reps, setReps] = useState(exercise.fourchetteRepsMin);
  const [rpe, setRpe] = useState(Math.max(6, 8 - rpeReduction));
  const [validated, setValidated] = useState<number[]>([]);

  const increment = exercise.incrementsPossibles[0] || 2.5;

  const handleValidate = async () => {
    if (!audioInitialized) {
      await initAudioContext();
    }

    let reposReelSecondes: number | null = null;
    if (active?.restStartTimestamp && active?.restDurationSeconds) {
      reposReelSecondes = Math.floor((Date.now() - active.restStartTimestamp) / 1000);
    }

    upsertSet({
      exerciseInstanceId: exercise.id,
      numeroSerie: currentSerie,
      repsEffectuees: reps,
      charge,
      rpeEffectif: rpe,
      validatedAt: Date.now(),
      reposReelSecondes,
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

  if (isSkipped) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 opacity-50">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white font-semibold line-through">{exercise.nom}</p>
            <p className="text-zinc-500 text-sm">{exercise.machineNom}</p>
          </div>
          <span className="text-xs text-zinc-400 bg-zinc-800 px-2 py-1 rounded">Skippé</span>
        </div>
      </div>
    );
  }

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
        {exercise.poidsNonCompte && (
          <p className="text-zinc-600 text-sm mt-1">Plateforme {exercise.poidsNonCompte}kg non comptée</p>
        )}
        <div className="flex justify-center gap-4 mt-2">
          <Button
            variant="outline"
            size="lg"
            className="w-14 h-14 text-2xl bg-zinc-800 border-zinc-700"
            onClick={() => adjustCharge(-increment)}
          >
            −
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-14 h-14 text-2xl bg-zinc-800 border-zinc-700"
            onClick={() => adjustCharge(increment)}
          >
            +
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-zinc-500">Répétitions</span>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="lg"
            className="w-14 h-14 text-2xl bg-zinc-800 border-zinc-700"
            onClick={() => setReps(r => Math.max(1, r - 1))}
          >
            −
          </Button>
          <span className="text-3xl font-bold text-white w-12 text-center">{reps}</span>
          <Button
            variant="outline"
            size="lg"
            className="w-14 h-14 text-2xl bg-zinc-800 border-zinc-700"
            onClick={() => setReps(r => r + 1)}
          >
            +
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-zinc-500">RPE</span>
          <span className="text-white font-medium">{rpe}{rpeReduction > 0 && <span className="text-zinc-500 text-xs ml-1">(-{rpeReduction})</span>}</span>
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
            className={`h-12 rounded flex items-center justify-center text-base font-medium transition-colors ${
              validated.includes(n)
                ? "bg-green-700 text-white"
                : n === currentSerie
                ? "bg-zinc-700 text-white"
                : "bg-zinc-800 text-zinc-500"
            }`}
          >
            {validated.includes(n) ? <Check className="w-5 h-5" /> : n}
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
  return (
    <Suspense fallback={<div className="p-4 text-white">Chargement...</div>}>
      <LiveSessionPageContent params={params} />
    </Suspense>
  );
}

function LiveSessionPageContent({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = useParams();
  const searchParams = useSearchParams();
  const gymId = searchParams.get("gymId") || "";
  const router = useRouter();
  const { active, start, clear, setCurrentExerciseIndex, startRest, clearRest, extendRest, skipExercises, allegerExercises, upsertSet } = useSessionStore();
  const [templateData, setTemplateData] = useState<TemplateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTimer, setShowTimer] = useState(false);
  const [audioInitialized, setAudioInitialized] = useState(false);

  // SOS modal state
  const [sosModal, setSOSModal] = useState<SOSModal>(null);
  // Duree figee a l'ouverture de la modale : Date.now() pendant le rendu rend celui-ci non deterministe.
  const [dureeSOSMin, setDureeSOSMin] = useState(0);
  const [exerciseInstances, setExerciseInstances] = useState<ExerciseInstanceWithExercise[]>([]);
  const [allInstances, setAllInstances] = useState<ExerciseInstanceWithExercise[]>([]);
  const [templateExerciseIds, setTemplateExerciseIds] = useState<string[]>([]);
  const [currentExerciseId, setCurrentExerciseId] = useState<string>("");
  const [musclesCourbatures, setMusclesCourbatures] = useState<string[]>([]);

  useEffect(() => {
    fetch(`/api/sessions/${templateId}`)
      .then((r) => r.json())
      .then((d) => {
        setTemplateData(d);
        if (d.exercises) {
          setTemplateExerciseIds(d.exercises.map((e: ExerciseFromTemplate) => e.id));
          if (d.exercises.length > 0) {
            setCurrentExerciseId(d.exercises[0].id);
          }
        }
        setLoading(false);
      });

    // Fetch all exercise instances for this gym for substitution
    if (gymId) {
      fetch(`/api/exercise-instances?gymId=${gymId}`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setAllInstances(data);
          }
        })
        .catch(() => {});
    }

    // Fetch daily state for courbatures
    const today = new Date().toISOString().slice(0, 10);
    fetch(`/api/daily-state?date=${today}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.courbatures) {
          const muscles = data.courbatures
            .filter((c: Courbature) => c.intensite >= 7)
            .map((c: Courbature) => c.muscle);
          setMusclesCourbatures(muscles);
        }
      })
      .catch(() => {});
  }, [templateId, gymId]);

  useEffect(() => {
    if (!active && templateData) {
      start({
        seanceTemplateId: templateId as string,
        gymId,
      });
    }
  }, [templateData, active]);

  const handleUserInteraction = async () => {
    if (!audioInitialized) {
      await initAudioContext();
      setAudioInitialized(true);
    }
  };

  const handleSetValidated = (exerciseIndex: number, reposSecondes: number | null) => {
    if (reposSecondes && reposSecondes > 0) {
      startRest(reposSecondes, exerciseIndex);
      setShowTimer(true);
    }
  };

  const handleTimerComplete = () => {
    playBeep();
  };

  const handleTimerSkip = () => {
    clearRest();
    setShowTimer(false);
  };

  const handleTimerExtend = (extra: number) => {
    extendRest(extra);
  };

  const handleIncident = async (data: { type: string; contexte: Record<string, unknown>; decision: string }) => {
    if (!active) return;
    try {
      await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_log_id: active.id,
          type: data.type,
          contexte: data.contexte,
          decision: data.decision,
        }),
      });
    } catch (e) {
      console.error("Failed to log incident", e);
    }
  };

  const handleSubstitute = (substituteInstanceId: string, substituteName: string) => {
    // In a real app, this would update the template in the store
    toast.success(`${substituteName} utilisé à la place`);
    setSOSModal(null);
  };

  const handleSkipExercices = (ids: string[]) => {
    skipExercises(ids);
    toast.success(`${ids.length} exercice(s) skippé(s)`);
  };

  const handleAllegerExercices = (ids: string[]) => {
    allegerExercises(ids);
    toast.success(`RPE réduit sur ${ids.length} exercice(s)`);
  };

  if (loading) return <div className="p-4 text-white">Chargement...</div>;
  if (!templateData) return <div className="p-4 text-white">Template non trouvé</div>;

  const exercises: ExerciseFromTemplate[] = templateData.exercises || [];
  const skippedIds = active?.skippedExerciseIds || [];
  const rpeReductions = active?.rpeReductions || {};

  const exercisesRestants: ExerciceRestant[] = exercises
    .filter(e => !skippedIds.includes(e.id))
    .map(e => ({
      exercise_instance_id: e.id,
      nom: e.nom,
      muscles_principaux: e.musclesPrincipaux || [],
      categorie_role: normaliserRole(e.categorieRole),
      statut: "à_venir" as const,
      ordre: e.ordre,
    }));

  return (
    <div className="p-4 space-y-4" onClick={handleUserInteraction}>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-5 h-5 text-white" />
        </Button>
        <h1 className="text-xl font-bold text-white">{templateData.nom}</h1>
      </div>

      {/* SOS Bar */}
      <SOSBar
        onMachineOccupee={() => setSOSModal("machine")}
        onDouleur={() => setSOSModal("douleur")}
        onEnergie={() => setSOSModal("energie")}
        onTempsDepasse={() => {
          setDureeSOSMin(active ? Math.floor((Date.now() - active.startedAt) / 60000) : 0);
          setSOSModal("temps");
        }}
      />

      {/* Proactive Alert */}
      <ProactiveAlert onShowSOS={() => {}} />

      {/* Rest Timer Overlay */}
      {showTimer && active?.restDurationSeconds && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
          <div className="bg-zinc-900 rounded-xl border border-zinc-800">
            <RestTimer
              durationSeconds={active.restDurationSeconds}
              onComplete={handleTimerComplete}
              onSkip={handleTimerSkip}
              onExtend={handleTimerExtend}
            />
          </div>
        </div>
      )}

      <div className="space-y-4">
        {exercises.map((ex, i) => (
          <div key={ex.id} className="space-y-2">
            <ExerciseBlock
              exercise={ex}
              history={[]}
              onNext={() => {
                setCurrentExerciseIndex(i + 1);
                setShowTimer(false);
                clearRest();
              }}
              showTimer={showTimer && active?.restExerciseIndex === i}
              timerDuration={active?.restDurationSeconds || null}
              onTimerComplete={handleTimerComplete}
              onTimerSkip={handleTimerSkip}
              onTimerExtend={handleTimerExtend}
              audioInitialized={audioInitialized}
              isSkipped={skippedIds.includes(ex.id)}
              rpeReduction={rpeReductions[ex.id] || 0}
            />
            {i < exercises.length - 1 && (
              <div className="h-px bg-zinc-800 mx-2" />
            )}
          </div>
        ))}
      </div>

      <Button
        className="w-full"
        variant="outline"
        onClick={() => router.push(`/sessions/new/${templateId}/finish`)}
      >
        Terminer la séance
      </Button>

      {/* SOS Modals */}
      {sosModal === "machine" && (
        <SOSMachineOccupee
          exerciseInstanceId={currentExerciseId}
          gymId={gymId}
          allInstances={allInstances}
          templateExerciseIds={templateExerciseIds}
          musclesCourbatures={musclesCourbatures}
          onClose={() => setSOSModal(null)}
          onSubstitute={handleSubstitute}
        />
      )}

      {sosModal === "douleur" && (
        <SOSDouleur
          exercicesRestants={exercisesRestants}
          onClose={() => setSOSModal(null)}
          onStopSeance={() => router.push(`/sessions/new/${templateId}/finish`)}
          onSkipExercices={handleSkipExercices}
          onAllegerExercices={handleAllegerExercices}
          onIncident={handleIncident}
          sessionLogId={active?.id || ""}
        />
      )}

      {sosModal === "energie" && (
        <SOSEnergie
          exercicesRestants={exercisesRestants}
          onClose={() => setSOSModal(null)}
          onApply={(coupes, rpeReduit) => {
            skipExercises(coupes.map(nom => exercises.find(e => e.nom === nom)?.id).filter((id): id is string => Boolean(id)));
            // For RPE reduction, we just mark them in the store
            toast.success("Séance ajustée");
          }}
          onStopSeance={() => router.push(`/sessions/new/${templateId}/finish`)}
          onIncident={handleIncident}
        />
      )}

      {sosModal === "temps" && (
        <SOSTempsDepasse
          dureeActuelleMin={dureeSOSMin}
          dureeCibleMin={60}
          exercicesRestants={exercisesRestants}
          onClose={() => setSOSModal(null)}
          onApply={(coupes) => {
            const idsToSkip = coupes
              .map(nom => exercisesRestants.find(e => e.nom === nom)?.exercise_instance_id)
              .filter((id): id is string => Boolean(id));
            skipExercises(idsToSkip);
            toast.success("Coupes appliquées");
          }}
          onIncident={handleIncident}
        />
      )}
    </div>
  );
}