"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useCoach } from "./ContexteCoach";
import { CoachDrawer } from "./CoachDrawer";

/** Accès central sur mobile et latéral sur ordinateur, masqué pendant la séance. */
export function BoutonCoach() {
  const { ouvert, fermer, contexte } = useCoach();
  const chemin = usePathname();
  const enSeance = contexte?.ecran === "seance";

  return (
    <>
      {!enSeance && chemin !== "/coach" && (
        <Link
          href="/coach"
          prefetch={false}
          aria-label="Demander au coach"
          className={`coach-trigger ${contexte?.ecran === "progression" ? "coach-quiet" : ""}`}
          style={{
            bottom: "calc(var(--barre-nav) - var(--rangee-nav) + 0.25rem)",
          }}
        >
          <span className="coach-trigger-icon">
            <Sparkles size={21} aria-hidden />
          </span>
          <span>Coach</span>
        </Link>
      )}
      <CoachDrawer open={ouvert} onClose={fermer} />
    </>
  );
}
