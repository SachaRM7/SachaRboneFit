"use client";
import { Check } from "lucide-react";
import type { AvancementExercice } from "@/lib/live/vue-live";

/**
 * Toute la séance en quelques lignes, depuis la vue Focus.
 *
 * La vue Focus montre un exercice à la fois — c'est son intérêt, et c'est aussi
 * ce qu'elle coûte : on perd de vue ce qui reste. Cette liste rend le reste en
 * un coup d'œil sans quitter l'écran, et permet d'ouvrir n'importe quel
 * exercice, terminé compris.
 *
 * ELLE NE CALCULE RIEN. `avancement` a déjà répondu, une fois, pour les deux
 * vues. Recompter ici « combien de séries faites » aurait produit un second
 * décompte, et le jour où l'un des deux change de règle, l'écran s'affiche en
 * se contredisant lui-même.
 *
 * La navigation reste libre : on peut revenir sur un exercice terminé pour
 * relire ou corriger. Un enchaînement qu'on ne peut pas remonter serait un
 * assistant, pas un carnet.
 */

interface Props {
  etats: AvancementExercice[];
  /** L'exercice actuellement affiché — mis en évidence, pas verrouillé. */
  courant: number;
  onChoisir: (index: number) => void;
  reportes?: string[];
}

export function ListeCompacte({ etats, courant, onChoisir, reportes = [] }: Props) {
  return (
    <ul className="space-y-1" aria-label="Exercices de la séance">
      {etats.map((e, i) => {
        const actif = i === courant;
        return (
          <li key={e.id}>
            <button
              onClick={() => onChoisir(i)}
              aria-current={actif ? "true" : undefined}
              className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                actif ? "bg-papier-2 border border-encre" : "border border-transparent active:bg-papier-2"
              }`}
            >
              <span className="chiffres text-xs text-encre-3 w-4 shrink-0">{i + 1}</span>
              <span className={`flex-1 text-sm truncate ${
                e.statut === "termine" ? "text-encre-3" : "text-encre"
              }`}>
                {e.nom}
                {e.statut !== "termine" && reportes.includes(e.id) && (
                  <small className="ml-2 uppercase tracking-wide text-[10px] text-encre-3">Reporté</small>
                )}
              </span>
              {/*
                L'état ne repose pas sur la seule couleur : une coche pour
                terminé, un compte pour en cours, un tiret pour à faire. Ça se
                lit aussi en niveaux de gris, et par un lecteur d'écran.
              */}
              {e.statut === "termine" ? (
                <span className="flex items-center gap-1 text-xs text-encre-3 shrink-0">
                  <Check className="w-4 h-4" aria-hidden />
                  <span className="sr-only">terminé</span>
                </span>
              ) : e.statut === "en_cours" ? (
                <span className="chiffres text-xs text-encre-2 shrink-0">
                  {e.faites}/{e.cibles}
                  <span className="sr-only"> séries faites</span>
                </span>
              ) : (
                <span className="text-xs text-encre-3 shrink-0" aria-label="pas encore commencé">—</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
