"use client";
import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, List, Check } from "lucide-react";
import { TableauSeries } from "./TableauSeries";
import { ListeCompacte } from "./ListeCompacte";
import type { ExercicePrescrit } from "./types";
import type { AvancementExercice } from "@/lib/live/vue-live";

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
 * Les deux besoins sont réels, et ils ne se satisfont pas au même moment. D'où
 * deux vues — celle-ci pour faire, la Liste pour relire.
 *
 * CE QU'ELLE NE FAIT PAS
 *
 * Elle ne réimplémente aucun tracker. La saisie, la validation, l'historique
 * « Dernière », la réouverture d'une série, la fiche d'exécution : tout vient
 * de `TableauSeries`, exactement comme en vue Liste. La seule différence entre
 * les deux vues est le NOMBRE d'exercices rendus — un ici, tous là-bas.
 *
 * C'est ce qui garantit qu'une série validée en Focus est immédiatement
 * validée en Liste : ce n'est pas une synchronisation, c'est le même composant
 * lisant le même store.
 */

interface Props {
  /** Les exercices visibles de la séance, dans l'ordre. */
  exercices: ExercicePrescrit[];
  /** L'avancement, calculé une fois pour les deux vues. */
  etats: AvancementExercice[];
  courant: number;
  onNaviguer: (index: number) => void;
  rpeReduction: (exerciceId: string) => number;
  onSerieValidee: (reposSecondes: number | null) => void;
  modeReserve?: boolean;
  /** Les actions propres à un exercice — remplacement, réglages — déjà montées. */
  actions?: (exercice: ExercicePrescrit) => ReactNode;
  /** Les slots de prescription restants — voir `TableauSeries`. */
  slotsDe?: (exercice: ExercicePrescrit) => number[];
  avancementDe?: (exercice: ExercicePrescrit) => {
    faites: number;
    cibles: number;
  };
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
  slotsDe,
  avancementDe,
}: Props) {
  const [listeOuverte, setListeOuverte] = useState(false);
  const exercice = exercices[courant];

  if (!exercice) {
    return (
      <p className="text-encre-3 text-sm px-1">Aucun exercice à afficher.</p>
    );
  }

  const precedent = courant > 0 ? courant - 1 : null;
  const suivant = courant < exercices.length - 1 ? courant + 1 : null;

  const aller = (i: number) => {
    onNaviguer(i);
    setListeOuverte(false);
  };

  return (
    <div className="focus-v2 space-y-4">
      <div className="focus-heading">
        <span className="eyebrow">Un mouvement à la fois</span>
        <span>
          Exercice {courant + 1} / {exercices.length}
        </span>
      </div>
      <nav className="exercise-rail" aria-label="Exercices de la séance">
        {exercices.map((ex, index) => (
          <button
            key={ex.id}
            onClick={() => aller(index)}
            aria-current={index === courant ? "step" : undefined}
            aria-label={`${ex.nom}, exercice ${index + 1}${etats[index]?.statut === "termine" ? ", terminé" : ""}`}
            className={etats[index]?.statut === "termine" ? "rail-done" : ""}
          >
            <span>
              {etats[index]?.statut === "termine" ? (
                <Check size={14} aria-hidden />
              ) : (
                String(index + 1).padStart(2, "0")
              )}
            </span>
            <span>{ex.nom}</span>
          </button>
        ))}
      </nav>
      {/*
        La barre de navigation : où l'on est, et comment aller ailleurs.

        Les deux flèches encadrent le compteur plutôt que d'être empilées avec
        lui : les pouces atteignent les bords de l'écran, pas son centre.
      */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => precedent !== null && aller(precedent)}
          disabled={precedent === null}
          aria-label="Exercice précédent"
          className="shrink-0 rounded-2xl border border-filet-doux bg-carte p-2.5 disabled:opacity-30 active:bg-filet"
        >
          <ChevronLeft className="w-5 h-5 text-encre-2" aria-hidden />
        </button>

        <button
          onClick={() => setListeOuverte((v) => !v)}
          aria-expanded={listeOuverte}
          className="flex-1 min-w-0 rounded-2xl border border-filet-doux bg-carte px-3 py-2 active:bg-filet"
        >
          <span className="flex items-center justify-center gap-2">
            <List className="w-4 h-4 text-encre-3 shrink-0" aria-hidden />
            <span className="text-encre text-sm font-medium truncate">
              {exercice.nom}
            </span>
            <span className="chiffres text-xs text-encre-3 shrink-0">
              {courant + 1}/{exercices.length}
            </span>
          </span>
        </button>

        <button
          onClick={() => suivant !== null && aller(suivant)}
          disabled={suivant === null}
          aria-label="Exercice suivant"
          className="shrink-0 rounded-2xl border border-filet-doux bg-carte p-2.5 disabled:opacity-30 active:bg-filet"
        >
          <ChevronRight className="w-5 h-5 text-encre-2" aria-hidden />
        </button>
      </div>

      {/*
        Toute la séance, à un appui. Repliée par défaut : elle sert à s'orienter,
        pas à occuper l'écran pendant qu'on soulève.
      */}
      {listeOuverte && (
        <div className="rounded-3xl border border-filet-doux bg-carte p-3">
          <ListeCompacte etats={etats} courant={courant} onChoisir={aller} />
        </div>
      )}

      {/*
        Le même composant qu'en vue Liste, avec le même store derrière. Une
        série validée ici est validée là-bas — il n'y a rien à synchroniser.
      */}
      <TableauSeries
        exercice={exercice}
        rpeReduction={rpeReduction(exercice.id)}
        onSerieValidee={onSerieValidee}
        modeReserve={modeReserve}
        actions={actions?.(exercice)}
        slots={slotsDe?.(exercice)}
        avancementSlot={avancementDe?.(exercice)}
      />
    </div>
  );
}
