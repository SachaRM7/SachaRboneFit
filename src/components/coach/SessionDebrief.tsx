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

        if (!res.ok) {
          if (!cancelled) setError(true);
          return;
        }

        const reader = res.body!.getReader();
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
  }, [sessionLogId, templateLettre, date]);

  if (error) return null;

  return (
    <div className="bg-carte rounded-lg p-4 space-y-2">
      <h3 className="text-sm font-medium text-encre-2 flex items-center gap-2">
        <span>🤖</span> Debrief Coach
      </h3>

      {loading ? (
        <div className="flex gap-1 py-2">
          <span className="w-2 h-2 bg-filet rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 bg-filet rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 bg-filet rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      ) : debrief ? (
        <p ref={contentRef} className="text-sm text-encre-2 whitespace-pre-wrap">
          {debrief}
        </p>
      ) : null}
    </div>
  );
}
