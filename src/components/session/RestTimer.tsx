"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface RestTimerProps {
  durationSeconds: number;
  onComplete: () => void;
  onSkip: () => void;
  onExtend: (extraSeconds: number) => void;
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
          {/* Background circle */}
          <circle
            cx="90"
            cy="90"
            r="80"
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="8"
          />
          {/* Progress arc */}
          <circle
            cx="90"
            cy="90"
            r="80"
            fill="none"
            stroke={isOvertime ? "#22c55e" : "rgba(255,255,255,0.7)"}
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
            <div className="text-center">
              <p className="text-3xl font-bold text-green-400">Repos terminé</p>
              <p className="text-lg text-green-400/70">+ {overtimeSeconds}s</p>
            </div>
          ) : (
            <>
              <p className={`text-4xl font-bold ${remaining <= 10 ? "text-orange-400" : "text-white"}`}>
                {timeDisplay}
              </p>
              <p className="text-zinc-500 text-sm">de repos</p>
            </>
          )}
        </div>
      </div>

      {/* Control buttons */}
      <div className="flex gap-4">
        <Button
          variant="outline"
          className="w-20 h-14 text-base bg-zinc-800 border-zinc-700"
          onClick={onSkip}
        >
          Skip
        </Button>
        <Button
          variant="outline"
          className="w-20 h-14 text-base bg-zinc-800 border-zinc-700"
          onClick={() => onExtend(30)}
        >
          +30s
        </Button>
      </div>
    </div>
  );
}