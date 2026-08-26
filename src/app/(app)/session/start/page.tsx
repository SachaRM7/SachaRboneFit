"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { computeFeuJour } from "@/lib/engine/feu-biologique";
import { computeVolumeAdjustment } from "@/lib/engine/volume-adjustment";
import { applyVolumeAdjustment } from "@/lib/engine/apply-adjustment";
import { FeuBiologique } from "@/components/ui/FeuBiologique";
import type { DailyStateInput } from "@/lib/validators/daily-state";

export default function SessionStartPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center"><div className="text-white">Chargement...</div></div>}>
      <SessionStartPageContent />
    </Suspense>
  );
}

function SessionStartPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adjustment, setAdjustment] = useState<{ totalPct: number; raisons: string[] } | null>(null);
  const [feuJour, setFeuJour] = useState<"vert" | "orange" | "rouge">("vert");

  useEffect(() => {
    const dailyStateId = searchParams.get("dailyStateId");
    const date = searchParams.get("date");
    const gymId = searchParams.get("gymId");

    // Cas derive au rendu (voir parametresManquants) : pas de setState synchrone ici.
    if (!dailyStateId || !date || !gymId) return;

    fetch(`/api/daily-state?date=${date}`)
      .then((r) => r.json())
      .then(async (dailyState) => {
        if (!dailyState || !dailyState.id) {
          setError("DailyState non trouve");
          setLoading(false);
          return;
        }

        const stateForFeu: DailyStateInput = {
          date,
          sommeilHeures: dailyState.sommeilHeures ?? 7,
          jeuneBool: dailyState.jeuneBool ?? false,
          shiftRecentBool: dailyState.shiftRecentBool ?? false,
          shiftType: dailyState.shiftType ?? "aucun",
          energieDepart: dailyState.energieDepart ?? 5,
          courbatures: dailyState.courbatures ?? [],
        };
        const feu = computeFeuJour(stateForFeu);
        setFeuJour(feu.feu);

        // La rotation est calculee cote serveur a partir de `ordreDansSemaine`.
        // Elle reposait auparavant sur le dernier caractere du nom de la seance :
        // renommer une seance cassait le cycle.
        const prochaineRes = await fetch("/api/programme/prochaine-seance");
        if (!prochaineRes.ok) {
          setError("Aucun programme actif. Crée un bloc et ses séances.");
          setLoading(false);
          return;
        }
        const prochaine = await prochaineRes.json();
        const nextTemplate = prochaine.template;

        const templateId = nextTemplate.id;

        const templateRes = await fetch(`/api/sessions/${templateId}`);
        const template = await templateRes.json();
        const templateExercises = template.exercises || [];

        const musclesCibles = templateExercises.flatMap((e: { musclesPrincipaux?: string[] }) => e.musclesPrincipaux || []);
        const volAdj = computeVolumeAdjustment(stateForFeu, musclesCibles);
        setAdjustment(volAdj);

        const adjusted = applyVolumeAdjustment(templateExercises, volAdj);

        const sessionRes = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            seanceTemplateId: templateId,
            gymId,
            date,
            dailyStateId,
            feuBiologiqueJour: feu.feu,
            volumeAjustePct: volAdj.totalPct,
            volumeAjusteRaison: volAdj.raisons.join("; "),
          }),
        });

        if (!sessionRes.ok) {
          setError("Erreur creation session");
          setLoading(false);
          return;
        }

        const session = await sessionRes.json();

        // L'ancien passage de relais par sessionStorage n'etait jamais relu :
        // l'ajustement calcule ici etait donc perdu. Il est desormais persiste sur
        // la seance (volumeAjustePct) ; son application aux series reste a faire.
        void adjusted;

        router.push(`/sessions/new/${templateId}?gymId=${gymId}&sessionId=${session.id}`);
      })
      .catch((e) => {
        setError(e.message || "Erreur");
        setLoading(false);
      });
  }, [searchParams, router]);

  const parametresManquants =
    !searchParams.get("dailyStateId") || !searchParams.get("date") || !searchParams.get("gymId");

  if (parametresManquants) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-red-500">Parametres manquants</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white">Chargement...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-white">Redirection vers la seance...</div>
    </div>
  );
}
