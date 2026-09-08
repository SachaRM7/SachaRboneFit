"use client";
import { LayoutList, Focus } from "lucide-react";
import { VUES_LIVE, type VueLive } from "@/lib/live/vue-live";

/**
 * Basculer entre les deux représentations de la MÊME séance.
 *
 * Ce n'est pas un changement d'écran : rien n'est rechargé, rien n'est recréé,
 * aucun brouillon ne se perd et le minuteur continue. Les deux vues lisent le
 * même store — le sélecteur ne fait que changer ce qui est rendu.
 *
 * Deux entrées seulement, nommées, avec une icône. Un interrupteur sans texte
 * aurait été plus compact et aurait demandé d'apprendre lequel des deux états
 * est lequel.
 */

interface Props {
  vue: VueLive;
  onChanger: (v: VueLive) => void;
}

const LIBELLES: Record<VueLive, { texte: string; Icone: typeof Focus }> = {
  focus: { texte: "Focus", Icone: Focus },
  liste: { texte: "Liste", Icone: LayoutList },
};

export function SelecteurVue({ vue, onChanger }: Props) {
  return (
    <div
      role="group"
      aria-label="Affichage de la séance"
      className="inline-flex rounded-2xl bg-papier-2 p-1"
    >
      {VUES_LIVE.map((v) => {
        const { texte, Icone } = LIBELLES[v];
        const actif = v === vue;
        return (
          <button
            key={v}
            onClick={() => onChanger(v)}
            aria-pressed={actif}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-medium transition-colors ${
              actif ? "bg-carte text-primary shadow-sm" : "text-encre-3"
            }`}
          >
            <Icone className="w-3.5 h-3.5" aria-hidden />
            {texte}
          </button>
        );
      })}
    </div>
  );
}
