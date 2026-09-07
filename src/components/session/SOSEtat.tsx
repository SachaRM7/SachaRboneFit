"use client";
import { X, BatteryLow, Activity } from "lucide-react";

/**
 * Le choix entre deux choses qu'on confondait faute d'endroit où les séparer.
 *
 * POURQUOI UN CHOISISSEUR PLUTÔT QU'UN CINQUIÈME BOUTON
 *
 * La barre SOS en porte quatre, et elle vit en bas d'un écran de téléphone,
 * sous le pouce, pendant une séance. Un cinquième bouton aurait rétréci les
 * cinq : la cible tactile de « Douleur » — le geste le plus urgent de la
 * barre — aurait diminué pour faire de la place au moins urgent. Ce n'est pas
 * un compromis acceptable.
 *
 * « Énergie ↓ » devient donc « État ↓ », qui ouvre ce choix. Un appui de plus
 * pour la baisse d'énergie, ce que l'écran compense en nommant les deux
 * entrées sans ambiguïté.
 *
 * ET LES DONNÉES NE FUSIONNENT PAS. Un bouton commun n'est pas une donnée
 * commune : `energie_chute` reste `energie_chute`, `symptome_general` est un
 * type distinct. Sans quoi un débrief ne pourrait plus dire laquelle des deux
 * a eu lieu.
 */

interface Props {
  onEnergie: () => void;
  onSymptome: () => void;
  onClose: () => void;
}

export function SOSEtat({ onEnergie, onSymptome, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 bg-encre/80 flex items-end justify-center">
      <div className="bg-carte rounded-t-2xl w-full max-w-md p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-encre">Qu&apos;est-ce qui se passe ?</h2>
          <button onClick={onClose} className="p-2" aria-label="Fermer">
            <X className="w-5 h-5 text-encre-2" />
          </button>
        </div>

        <button
          onClick={onEnergie}
          className="w-full flex items-center gap-3 rounded-lg border border-filet bg-papier-2 px-3 py-3 text-left active:bg-filet"
        >
          <BatteryLow className="w-5 h-5 text-feu-orange shrink-0" />
          <span>
            <span className="block text-encre text-sm font-medium">Baisse d&apos;énergie</span>
            <span className="block text-encre-3 text-xs">Je suis vidé, mais rien d&apos;autre.</span>
          </span>
        </button>

        <button
          onClick={onSymptome}
          className="w-full flex items-center gap-3 rounded-lg border border-filet bg-papier-2 px-3 py-3 text-left active:bg-filet"
        >
          <Activity className="w-5 h-5 text-feu-orange shrink-0" />
          <span>
            <span className="block text-encre text-sm font-medium">Symptôme général</span>
            {/*
              Les exemples font le travail que la définition ne ferait pas :
              « symptôme général » ne dit rien à froid, « mal de tête, nausée »
              se reconnaît immédiatement. Et la dernière moitié de la phrase
              renvoie la douleur d'exercice vers son propre bouton.
            */}
            <span className="block text-encre-3 text-xs">
              Mal de tête, nausée, vertige… Pas une douleur sur un mouvement.
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}
