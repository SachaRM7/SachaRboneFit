"use client";

import {
  Activity,
  Check,
  ChevronDown,
  ChevronRight,
  Dumbbell,
  Hourglass,
  Zap,
} from "@/components/ui/icons";
import { IllustrationExercice } from "@/components/exercises/IllustrationExercice";
import { ligneMusclesLive } from "./presentation-live";
import { ecrireTempo, lireTempo } from "@/lib/engine/execution";
import type { AvancementExercice } from "@/lib/live/vue-live";
import type { ExercicePrescrit } from "./types";

interface Props {
  exercices: ExercicePrescrit[];
  etats: AvancementExercice[];
  courant: number;
  onChoisir: (index: number) => void;
  reportes?: string[];
  note?: string;
  onNote?: (note: string) => void;
  afficherNote?: boolean;
}

function tempoPrescrit(tempo: string | null | undefined): string | null {
  if (!tempo) return null;
  const lu = lireTempo(tempo);
  return lu ? ecrireTempo(lu) : tempo.trim() || null;
}

export function ListeCompacte({
  exercices,
  etats,
  courant,
  onChoisir,
  reportes = [],
  note = "",
  onNote,
  afficherNote = false,
}: Props) {
  return (
    <div className="live-list-view">
      <ol className="live-list" aria-label="Exercices de la séance">
        {etats.map((etat, index) => {
          const exercice = exercices.find((item) => item.id === etat.id);
          if (!exercice) return null;
          const actif = index === courant;
          const termine = etat.statut === "termine";
          const tempo = tempoPrescrit(exercice.tempo);
          const muscles = ligneMusclesLive(exercice.musclesPrincipaux, exercice.musclesSecondaires);

          return (
            <li
              key={etat.id}
              className="live-list-item"
              data-status={termine ? "termine" : actif ? "courant" : "a-venir"}
            >
              <span className="live-list-state" aria-hidden>
                {termine && <Check />}
                <b className="chiffres">{index + 1}</b>
              </span>
              <button
                type="button"
                onClick={() => onChoisir(index)}
                aria-current={actif ? "true" : undefined}
                className="live-list-card"
              >
                <span className="live-list-illustration">
                  {exercice.slug ? (
                    <IllustrationExercice
                      slug={exercice.slug}
                      nom={exercice.nom}
                      className="w-full h-full"
                    />
                  ) : (
                    <Dumbbell aria-hidden />
                  )}
                </span>
                <span className="live-list-content">
                  <strong>{exercice.nom}</strong>
                  {exercice.machineNom && exercice.machineNom !== exercice.nom && (
                    <small>{exercice.machineNom}</small>
                  )}
                  <span className="live-list-metrics">
                    <span className="chiffres">
                      {exercice.seriesCibles} × {exercice.fourchetteRepsMin}–{exercice.fourchetteRepsMax}
                    </span>
                    {exercice.reposSecondes != null && (
                      <span className="chiffres"><Hourglass aria-hidden />{exercice.reposSecondes} s</span>
                    )}
                    {tempo && (
                      <span className="chiffres"><Activity aria-hidden />{tempo}</span>
                    )}
                  </span>
                  <span className="live-list-muscles">
                    {muscles ?? (reportes.includes(etat.id) ? "Reporté" : "")}
                  </span>
                </span>
                <span className="live-list-open" aria-hidden><ChevronRight /></span>
              </button>
            </li>
          );
        })}
      </ol>

      {afficherNote && onNote && (
        <details className="live-quick-note">
          <summary>
            <Zap aria-hidden />
            <span>Note rapide de la séance</span>
            <ChevronDown aria-hidden />
          </summary>
          <label>
            <span className="sr-only">Note rapide de la séance</span>
            <textarea
              value={note}
              onChange={(event) => onNote(event.target.value)}
              placeholder="Note ce que tu veux retenir de cette séance."
              rows={3}
            />
          </label>
        </details>
      )}
    </div>
  );
}
