"use client";

import { useState, useEffect, useRef } from "react";

interface SessionDebriefProps {
  sessionLogId: string;
  templateLettre: string;
  date: string;
}

export function SessionDebrief({ sessionLogId, templateLettre, date }: SessionDebriefProps) {
  const [debrief, setDebrief] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Le bouton « Réessayer » relance l'effet : le débrief n'est pas conservé,
  // il est redemandé au modèle à chaque fois.
  const [essai, setEssai] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchDebrief() {
      setLoading(true);
      setError(false);
      setDebrief("");

      try {
        const res = await fetch("/api/coach/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionLogId,
            message: `Génère un debrief de la séance ${templateLettre} du ${date}. Résume les progressions charges/reps, les points positifs, les points d'attention, et ce qu'il faut préparer pour la prochaine séance. Sois concis et encourageant.`,
          }),
        });

        if (!res.ok || !res.body) {
          // `res.body!` : l'assertion faisait lever une exception au lieu de
          // rendre l'erreur, et l'écran perdait la seule chose qu'il pouvait
          // encore dire.
          if (!cancelled) setError(true);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const dataStr = line.slice(6).trim();

            try {
              const data = JSON.parse(dataStr);
              if (data.content !== undefined) {
                fullText += data.content;
                if (!cancelled) {
                  setDebrief(fullText);
                }
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchDebrief();

    return () => {
      cancelled = true;
    };
  }, [sessionLogId, templateLettre, date, essai]);

  /**
   * Le chargement finit toujours quelque part.
   *
   * Il y avait deux façons de finir dans le vide, et l'une n'avait même pas
   * besoin d'une panne :
   *
   *   — en cas d'erreur, `return null` faisait DISPARAÎTRE le bloc entier.
   *     À l'écran : un titre « Debrief Coach », trois points qui rebondissent,
   *     puis plus rien. Rien ne distinguait une panne d'un débrief qui n'avait
   *     rien à dire, et rien ne permettait de réessayer.
   *   — quand le flux se terminait sans contenu — la réponse arrive, mais
   *     vide —, le composant sortait du chargement avec `debrief` à `""` et
   *     rendait un cadre titré vide.
   *
   * Les deux cas sont désormais dits. Le débrief n'est pas conservé en base :
   * il est redemandé au modèle à chaque ouverture de la séance, donc réessayer
   * a un sens — et l'échec d'un jour n'est pas définitif.
   */
  return (
    <div className="bg-carte rounded-lg p-4 space-y-2">
      <h3 className="text-sm font-medium text-encre-2 flex items-center gap-2">
        <span>🤖</span> Debrief Coach
      </h3>

      {loading ? (
        <div className="flex gap-1 py-2" role="status" aria-label="Le coach rédige">
          <span className="w-2 h-2 bg-filet rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 bg-filet rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 bg-filet rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      ) : debrief ? (
        <p ref={contentRef} className="text-sm text-encre-2 whitespace-pre-wrap">
          {debrief}
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-encre-2">
            {error
              ? "Le coach n'a pas pu rédiger ce débrief."
              : "Le coach n'a rien renvoyé pour cette séance."}
          </p>
          <button
            type="button"
            onClick={() => setEssai((n) => n + 1)}
            className="h-9 px-3 rounded-lg border border-filet text-encre text-sm"
          >
            Réessayer
          </button>
        </div>
      )}
    </div>
  );
}
