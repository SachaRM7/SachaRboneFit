"use client";
import { useEffect, useRef, useState } from "react";
import { MascotteCoach } from "@/components/coach/MascotteCoach";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "@/components/ui/icons";

interface RestTimerProps {
  durationSeconds: number;
  startedAt?: number | null;
  exerciceTermine?: string | null;
  onComplete: () => void;
  onSkip: () => void;
  onExtend: (extraSeconds: number) => void;
  /**
   * Ce qui vient après — la raison pour laquelle on attend.
   *
   * Le minuteur occupait tout l'écran sans jamais dire vers quoi il menait : on
   * en sortait pour retrouver où l'on en était. Purement informatif, calculé
   * par l'écran de séance qui connaît déjà la série suivante.
   */
  prochaine?: string | null;
  /**
   * Le repos replié en pastille ronde : la séance redevient accessible derrière.
   *
   * Le minuteur reste MONTÉ dans les deux formes — c'est lui qui déclenche le
   * bip. Le démonter pendant qu'il est replié ferait perdre le signal, et le
   * remonter le rejouerait une seconde fois.
   */
  reduit?: boolean;
  onReduire?: () => void;
  onAgrandir?: () => void;
}

/** « 1 min 20 » plutôt que « 80 s » : c'est ce qu'on lit d'un coup d'œil. */
function formaterDuree(secondes: number): string {
  if (secondes < 60) return `${secondes} s`;
  const minutes = Math.floor(secondes / 60);
  const reste = secondes % 60;
  return reste === 0 ? `${minutes} min` : `${minutes} min ${reste}`;
}

export function RestTimer({
  durationSeconds,
  startedAt,
  exerciceTermine,
  onComplete,
  onSkip,
  onExtend,
  prochaine,
  reduit = false,
  onReduire,
  onAgrandir,
}: RestTimerProps) {
  const [elapsed, setElapsed] = useState(0);
  // Ref plutot qu'un state : sert uniquement a ne declencher onComplete qu'une fois.
  const completedRef = useRef(false);
  // Initialise dans l'effet : appeler Date.now() pendant le rendu le rend non deterministe.
  const startTimeRef = useRef<number | null>(null);
  const durationRef = useRef(durationSeconds);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    // Le prochain tick recalcule `elapsed` : pas besoin de le remettre a zero ici.
    startTimeRef.current = startedAt ?? startTimeRef.current ?? Date.now();
    durationRef.current = durationSeconds;
    completedRef.current = false;
  }, [durationSeconds, startedAt]);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const newElapsed = Math.floor(
        (now - (startTimeRef.current ?? now)) / 1000,
      );
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
        const newElapsed = Math.floor(
          (now - (startTimeRef.current ?? now)) / 1000,
        );
        setElapsed(newElapsed);
        const remaining = durationRef.current - newElapsed;
        if (remaining <= 0 && !completedRef.current) {
          completedRef.current = true;
          onComplete();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [onComplete]);

  const remaining = Math.max(0, durationSeconds - elapsed);
  const progress = Math.min(1, elapsed / durationSeconds);
  const circumference = 2 * Math.PI * 80;
  const strokeDashoffset = circumference * (1 - progress);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const timeDisplay =
    mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}`;

  const isOvertime = elapsed >= durationSeconds;
  const overtimeSeconds = isOvertime ? elapsed - durationSeconds : 0;

  // Le compte à rebours dans le titre de l'onglet : lisible depuis la barre
  // d'onglets de Safari quand on regarde autre chose. Rendu au départ.
  const titreRepos = isOvertime ? "Repos atteint" : `${timeDisplay} · Repos`;
  useEffect(() => {
    const titreInitial = document.title;
    return () => { document.title = titreInitial; };
  }, []);
  useEffect(() => {
    document.title = titreRepos;
  }, [titreRepos]);

  if (reduit) {
    const rayon = 25;
    const perimetre = 2 * Math.PI * rayon;
    return (
      <button
        type="button"
        className="repos-pastille"
        data-depasse={isOvertime || undefined}
        onClick={onAgrandir}
        aria-label={isOvertime ? "Repos atteint — rouvrir le minuteur" : `Repos : ${timeDisplay} restantes — rouvrir le minuteur`}
      >
        <svg viewBox="0 0 60 60" aria-hidden>
          <circle cx="30" cy="30" r={rayon} fill="none" className="text-filet" stroke="currentColor" strokeWidth="4" />
          <circle
            cx="30"
            cy="30"
            r={rayon}
            fill="none"
            className={isOvertime ? "text-gain" : "text-primary"}
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={perimetre}
            strokeDashoffset={perimetre * (1 - progress)}
            transform="rotate(-90 30 30)"
          />
        </svg>
        <span className="chiffres">{isOvertime ? "Prêt" : timeDisplay}</span>
      </button>
    );
  }

  return (
    <div className="rest-v2 relative flex flex-col items-center gap-5 p-6">
      {onReduire && (
        <button type="button" className="repos-reduire" onClick={onReduire} aria-label="Réduire le minuteur">
          <ChevronDown className="size-5" aria-hidden />
        </button>
      )}
      <p className="eyebrow">{exerciceTermine ? "Exercice terminé · repos" : "Repos"}</p>
      {exerciceTermine && <p className="text-sm font-medium">{exerciceTermine}</p>}
      {/* SVG Circular Timer */}
      <div className="relative">
        <svg width="230" height="230" viewBox="0 0 180 180">
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
            className={isOvertime ? "text-gain" : "text-primary"}
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
                {overtimeSeconds >= 5
                  ? ` depuis ${formaterDuree(overtimeSeconds)}`
                  : ""}
              </p>
            </div>
          ) : (
            <>
              <p
                className={`text-5xl font-medium chiffres ${remaining <= 10 ? "text-feu-orange" : "text-encre"}`}
              >
                {timeDisplay}
              </p>
              <p className="text-encre-3 text-sm">de repos</p>
            </>
          )}
        </div>
      </div>

      <MascotteCoach etat="repos" taille="compact" presence="discrete" />
      {/* Ce vers quoi le repos mène. Absent quand l'exercice est fini : il n'y
          a alors pas de « prochaine », et en inventer une serait un mensonge. */}
      {prochaine && (
        <div className="repos-prochaine">
          <p className="eyebrow">Prochaine</p>
          <strong className="chiffres">{prochaine}</strong>
        </div>
      )}

      {/* Control buttons */}
      <div className="flex w-full max-w-sm flex-col gap-3">
        <Button
          className="h-14 w-full px-5 text-base bg-encre text-papier"
          onClick={onSkip}
        >
          {isOvertime ? "Continuer" : "Écourter le repos"}
        </Button>
        {/*
          Ajuster le repos n'a qu'une utilité, et elle est réelle : déplacer le
          signal sonore. Sans « + », le bip tombe pendant qu'on souffle encore ;
          sans « − », on attend un bip dont on n'a plus besoin. Rien ne modifie
          la prescription ni n'invente de donnée — c'est l'instant du rappel
          qui bouge. « − » disparaît quand il ne reste plus 30 s à retirer.
        */}
        <div className="repos-ajuster" role="group" aria-label="Ajuster le repos">
          <button type="button" onClick={() => onExtend(-30)} disabled={isOvertime || remaining <= 30} aria-label="Retirer 30 secondes de repos">
            −30 s
          </button>
          <button type="button" onClick={() => onExtend(30)} aria-label="Ajouter 30 secondes de repos">
            +30 s
          </button>
          <button type="button" onClick={() => onExtend(60)} aria-label="Ajouter 1 minute de repos">
            +1 min
          </button>
        </div>
      </div>
    </div>
  );
}
