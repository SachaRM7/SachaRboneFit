"use client";
import { LayoutList, Focus } from "@/components/ui/icons";
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
  const destination = VUES_LIVE.find((candidate) => candidate !== vue) ?? "focus";
  const { texte, Icone } = LIBELLES[destination];
  return (
    <button
      type="button"
      onClick={() => onChanger(destination)}
      className="live-view-switch"
      aria-label={`Afficher la vue ${texte}`}
    >
      <Icone aria-hidden />
    </button>
  );
}
