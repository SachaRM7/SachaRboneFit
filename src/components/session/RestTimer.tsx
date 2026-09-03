"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface RestTimerProps {
  durationSeconds: number;
  onComplete: () => void;
  onSkip: () => void;
  onExtend: (extraSeconds: number) => void;
}

/** « 1 min 20 » plutôt que « 80 s » : c'est ce qu'on lit d'un coup d'œil. */
function formaterDuree(secondes: number): string {
  if (secondes < 60) return `${secondes} s`;
  const minutes = Math.floor(secondes / 60);
  const reste = secondes % 60;
  return reste === 0 ? `${minutes} min` : `${minutes} min ${reste}`;
}

export function RestTimer({ durationSeconds, onComplete, onSkip, onExtend }: RestTimerProps) {
  const [elapsed, setElapsed] = useState(0);
  // Ref plutot qu'un state : sert uniquement a ne declencher onComplete qu'une fois.
  const completedRef = useRef(false);
  // Initialise dans l'effet : appeler Date.now() pendant le rendu le rend non deterministe.
  const startTimeRef = useRef<number | null>(null);
  const durationRef = useRef(durationSeconds);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    // Le prochain tick recalcule `elapsed` : pas besoin de le remettre a zero ici.
    startTimeRef.current = Date.now();
    durationRef.current = durationSeconds;
    completedRef.current = false;
  }, [durationSeconds]);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const newElapsed = Math.floor((now - (startTimeRef.current ?? now)) / 1000);
      setElapsed(newElapsed);
      const remaining = durationRef.current - newElapsed;
      if (remaining <= 0 && !completedRef.current) {
        completedRef.current = true;
        onComplete();
      }
      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [durationSeconds, onComplete]);

  // Handle visibility change (app backgrounded/foregrounded on iOS)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        // Recalculate elapsed on return to foreground
        const now = Date.now();
        const newElapsed = Math.floor((now - (startTimeRef.current ?? now)) / 1000);
        setElapsed(newElapsed);
        const remaining = durationRef.current - newElapsed;
        if (remaining <= 0 && !completedRef.current) {
          completedRef.current = true;
          onComplete();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [onComplete]);

  const remaining = Math.max(0, durationSeconds - elapsed);
  const progress = Math.min(1, elapsed / durationSeconds);
  const circumference = 2 * Math.PI * 80;
  const strokeDashoffset = circumference * (1 - progress);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const timeDisplay = mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}`;

  const isOvertime = elapsed >= durationSeconds;
  const overtimeSeconds = isOvertime ? elapsed - durationSeconds : 0;

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      {/* SVG Circular Timer */}
      <div className="relative">
        <svg width="180" height="180" viewBox="0 0 180 180">
          {/*
            L'anneau suit le thème, comme le reste.

            Il était tracé en blanc translucide, et l'arc de progression en
            blanc puis en vert vif : invisible sur le papier du thème clair, et
            hors palette dans les deux. C'est l'écran qu'on regarde le plus
            longtemps d'une séance — entre chaque série.

            `currentColor` plutôt qu'une valeur lue en JavaScript : le SVG
            hérite alors de la couleur du texte, qui vient déjà des tokens, et
            suit le changement de thème sans rendu supplémentaire.
          */}
          <circle
            cx="90"
            cy="90"
            r="80"
            fill="none"
            className="text-filet"
            stroke="currentColor"
            strokeWidth="8"
          />
          {/* Progress arc */}
          <circle
            cx="90"
            cy="90"
            r="80"
            fill="none"
            /* Le dépassement est un SIGNAL — la seule couleur de l'anneau,
               au sens du système Carnet : elle apparaît quand quelque chose a
               lieu, elle ne décore pas le temps qui passe. */
            className={isOvertime ? "text-gain" : "text-encre-2"}
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            transform="rotate(-90 90 90)"
            style={{ transition: "stroke-dashoffset 0.1s linear" }}
          />
        </svg>
        {/* Time display in center */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {isOvertime ? (
            /*
              À zéro, le repos est ATTEINT — ce n'est pas un dépassement.
              L'écran affichait « Repos terminé » puis un compteur qui montait
              indéfiniment, ce qui se lisait comme un retard alors que se
              reposer plus longtemps est une décision légitime. On dit donc ce
              qui est vrai : le repos est fait, et voilà depuis combien de temps.
            */
            <div className="text-center">
              <p className="text-3xl font-bold text-gain">Prêt</p>
              <p className="text-lg text-gain/70">
                repos atteint
                {overtimeSeconds >= 5 ? ` depuis ${formaterDuree(overtimeSeconds)}` : ""}
              </p>
            </div>
          ) : (
            <>
              <p className={`text-4xl font-bold ${remaining <= 10 ? "text-feu-orange" : "text-encre"}`}>
                {timeDisplay}
              </p>
              <p className="text-encre-3 text-sm">de repos</p>
            </>
          )}
        </div>
      </div>

      {/* Control buttons */}
      <div className="flex gap-4">
        <Button
          variant="outline"
          className="h-14 px-5 text-base bg-papier-2 border-filet text-encre"
          onClick={onSkip}
        >
          Passer
        </Button>
        {/*
          « +30 s » n'a qu'une utilité, et elle est réelle : repousser le signal
          sonore quand on décide de récupérer plus longtemps. Sans lui, le bip
          tombe pendant qu'on souffle encore. Il ne modifie aucune prescription
          et n'invente aucune donnée — c'est l'instant du rappel qui bouge.
        */}
        <Button
          variant="outline"
          className="h-14 px-5 text-base bg-papier-2 border-filet text-encre"
          onClick={() => onExtend(30)}
        >
          +30 s de récup
        </Button>
      </div>
    </div>
  );
}