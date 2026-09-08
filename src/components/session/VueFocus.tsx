"use client";
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { LecteurExercice } from "./LecteurExercice";
import { ListeCompacte } from "./ListeCompacte";
import type { ExercicePrescrit } from "./types";
import type { AvancementExercice } from "@/lib/live/vue-live";
import type { SerieValidee } from "./useSaisieSeries";

/**
 * Un exercice à la fois — la séance telle qu'on la vit devant la machine.
 *
 * POURQUOI CETTE VUE EXISTE
 *
 * Le Live affichait toute la séance verticalement. C'est une bonne vue de
 * carnet : on voit tout, on corrige n'importe quelle série, on scanne ce qui
 * reste. C'est une mauvaise vue d'effort : la page est longue, l'exercice
 * courant se perd au milieu, et il faut chercher où l'on en est entre deux
 * séries, une main sur le téléphone.
 *
 * CE QUI A CHANGÉ
 *
 * Cette vue rendait auparavant le tableau de la vue Liste avec un exercice au
 * lieu de six. Les deux se ressemblaient donc au point qu'on ne savait pas
 * laquelle on regardait. Elle compose maintenant son propre lecteur — voir
 * `LecteurExercice` — et la parenté avec la Liste ne passe plus par le DOM mais
 * par `useSaisieSeries` : le même store, les mêmes lignes, la même validation.
 *
 * Ce fichier ne garde donc que ce qui est propre à la NAVIGATION : où l'on est
 * dans la séance, et comment aller ailleurs.
 */

interface Props {
  /** Les exercices visibles de la séance, dans l'ordre. */
  exercices: ExercicePrescrit[];
  /** L'avancement, calculé une fois pour les deux vues. */
  etats: AvancementExercice[];
  courant: number;
  onNaviguer: (index: number) => void;
  rpeReduction: (exerciceId: string) => number;
  onSerieValidee: (resultat: SerieValidee) => void;
  modeReserve?: boolean;
  /** Les actions propres à un exercice — remplacement, réglages — déjà montées. */
  actions?: (exercice: ExercicePrescrit) => ReactNode;
}

export function VueFocus({
  exercices,
  etats,
  courant,
  onNaviguer,
  rpeReduction,
  onSerieValidee,
  modeReserve = false,
  actions,
}: Props) {
  const [listeOuverte, setListeOuverte] = useState(false);
  const exercice = exercices[courant];

  if (!exercice) {
    return <p className="text-encre-3 text-sm px-1">Aucun exercice à afficher.</p>;
  }

  const precedent = courant > 0 ? courant - 1 : null;
  const suivant = courant < exercices.length - 1 ? courant + 1 : null;

  const aller = (i: number) => {
    onNaviguer(i);
    setListeOuverte(false);
  };

  return (
    <div className="focus-v2">
      {/*
        Où l'on est dans la séance — porté par le rang de l'exercice plutôt que
        par un contrôle utilitaire posé à côté. Les flèches encadrent le
        compteur : les pouces atteignent les bords de l'écran, pas son centre.
      */}
      <nav className="focus-nav" aria-label="Navigation entre les exercices">
        <button
          onClick={() => precedent !== null && aller(precedent)}
          disabled={precedent === null}
          aria-label="Exercice précédent"
        >
          <ChevronLeft className="w-5 h-5" aria-hidden />
        </button>

        {/* Le rang ouvre la séance entière : le nom de l'exercice est déjà en
            grand dans le lecteur, le répéter ici ne dirait rien de plus. */}
        <button
          onClick={() => setListeOuverte(true)}
          aria-expanded={listeOuverte}
          aria-haspopup="dialog"
          className="focus-nav-rang"
        >
          <span className="eyebrow">Exercice</span>
          <span className="chiffres">
            {courant + 1} / {exercices.length}
          </span>
          <ChevronDown className="w-4 h-4" aria-hidden />
        </button>

        <button
          onClick={() => suivant !== null && aller(suivant)}
          disabled={suivant === null}
          aria-label="Exercice suivant"
        >
          <ChevronRight className="w-5 h-5" aria-hidden />
        </button>
      </nav>

      <LecteurExercice
        exercice={exercice}
        rpeReduction={rpeReduction(exercice.id)}
        modeReserve={modeReserve}
        onSerieValidee={onSerieValidee}
        actions={actions?.(exercice)}
        onSuivant={suivant !== null ? () => aller(suivant) : null}
      />

      {/*
        Toute la séance, à un appui — en feuille plutôt qu'en accordéon : elle
        sert à s'orienter, et une liste qui pousse le lecteur vers le bas fait
        perdre la place qu'on venait justement regarder.
      */}
      {listeOuverte && (
        <div
          className="focus-feuille"
          role="dialog"
          aria-modal="true"
          aria-label="Exercices de la séance"
        >
          <button
            type="button"
            className="focus-feuille-fond"
            aria-label="Fermer"
            onClick={() => setListeOuverte(false)}
          />
          <div className="focus-feuille-panneau">
            <header>
              <p className="eyebrow">Séance</p>
              <button
                type="button"
                onClick={() => setListeOuverte(false)}
                aria-label="Fermer"
              >
                <X className="w-5 h-5" aria-hidden />
              </button>
            </header>
            <ListeCompacte etats={etats} courant={courant} onChoisir={aller} />
          </div>
        </div>
      )}
    </div>
  );
}
