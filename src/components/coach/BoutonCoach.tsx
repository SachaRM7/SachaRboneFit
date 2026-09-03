"use client";
import { Sparkles } from "lucide-react";
import { useCoach } from "./ContexteCoach";
import { CoachDrawer } from "./CoachDrawer";

/**
 * L'entrée vers le coach.
 *
 * C'était une bulle ronde de 56 px, en bas à droite, avec une icône de bulle de
 * dialogue : le vocabulaire visuel du support client. Il ne s'agit pas d'un
 * service après-vente, et l'icône ne disait pas de quoi on peut parler.
 *
 * Une étiquette nommée, discrète, posée au-dessus de la barre de navigation.
 * Elle disparaît pendant la séance : là, ce sont les actions immédiates de
 * `SOSBar` qui servent — machine occupée, douleur, charge, repos — et une
 * conversation n'a pas à s'interposer entre deux séries.
 */
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
          className="fixed right-4 z-40 h-10 pl-3 pr-4 rounded-full bg-encre text-papier
                     flex items-center gap-1.5 text-sm font-medium shadow-sm
                     active:scale-[0.98] transition-transform"
          /* Posée au-dessus de la barre, à partir de sa hauteur réelle. Le
             calcul était juste mais recopié : `env(...) + 5.5rem` supposait
             une rangée de 4 rem, et aurait cessé de l'être en la changeant. */
          style={{ bottom: "calc(var(--barre-nav) + 1.5rem)" }}
        >
          <Sparkles className="w-4 h-4" aria-hidden />
          Coach
        </button>
      )}
      <CoachDrawer open={ouvert} onClose={fermer} />
    </>
  );
}
