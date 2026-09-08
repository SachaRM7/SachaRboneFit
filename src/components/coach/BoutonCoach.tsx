"use client";
import { Sparkles } from "lucide-react";
import { useCoach } from "./ContexteCoach";
import { CoachDrawer } from "./CoachDrawer";

/** Accès central sur mobile et latéral sur ordinateur, masqué pendant la séance. */
export function BoutonCoach() {
  const { ouvert, ouvrir, fermer, contexte } = useCoach();
  const enSeance = contexte?.ecran === "seance";

  return (
    <>
      {!enSeance && (
        <button
          type="button"
          onClick={() => ouvrir()}
          aria-label="Demander au coach"
          className="coach-trigger"
          style={{
            bottom: "calc(var(--barre-nav) - var(--rangee-nav) + 0.25rem)",
          }}
        >
          <span className="coach-trigger-icon">
            <Sparkles size={21} aria-hidden />
          </span>
          <span>Coach</span>
        </button>
      )}
      <CoachDrawer open={ouvert} onClose={fermer} />
    </>
  );
}
