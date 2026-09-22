"use client";

import { ArrowLeft, ChartNoAxesCombined, Square, Stopwatch } from "@/components/ui/icons";
import { MascotteCoach } from "@/components/coach/MascotteCoach";
import type { ComponentProps } from "react";
import type { AvancementExercice, VueLive } from "@/lib/live/vue-live";
import { ChronoSeance } from "./ChronoSeance";
import { SelecteurVue } from "./SelecteurVue";

interface Props {
  nom: string;
  vue: VueLive;
  courant: number;
  etats: AvancementExercice[];
  etatMascotte: ComponentProps<typeof MascotteCoach>["etat"];
  demarreeA?: number;
  dureeCibleMinutes?: number | null;
  dureeMaxMinutes?: number | null;
  onRetour: () => void;
  onAides: () => void;
  onDuree: () => void;
  onTerminer: () => void;
  onVue: (vue: VueLive) => void;
}

export function EnteteLive({
  nom, vue, courant, etats, etatMascotte, demarreeA,
  dureeCibleMinutes, dureeMaxMinutes, onRetour, onAides, onDuree, onTerminer, onVue,
}: Props) {
  const termines = etats.filter((etat) => etat.statut === "termine").length;
  return (
    <header className="live-session-header">
      <div className="live-focus-topline">
        <button type="button" className="live-back" aria-label="Quitter la séance" onClick={onRetour}>
          <ArrowLeft aria-hidden />
        </button>
        <div className="live-focus-title">
          <h1>Séance du jour</h1>
          <p>{nom}{etats.length > 0 && (vue === "focus"
            ? ` · Exercice ${courant + 1} sur ${etats.length}`
            : ` · ${etats.length} exercice${etats.length > 1 ? "s" : ""}`)}</p>
        </div>
        {etatMascotte !== "repos" && <button type="button" className="live-coach-state" onClick={onAides} aria-label="Coach et ajustements de la séance">
          <MascotteCoach etat={etatMascotte} taille="compact" presence="discrete" anime={etatMascotte === "encouragement"} />
        </button>}
        <div className="live-focus-progress" aria-label={`${termines} exercices terminés sur ${etats.length}`}>
          <div className="live-progress-segments" aria-hidden="true">
            {etats.map((etat, index) => (
              <span key={etat.id} className={etat.statut === "termine" ? "is-complete" : index === courant ? "is-current" : undefined} />
            ))}
          </div>
          <span className="live-progress-count chiffres">{termines}/{etats.length}</span>
        </div>
        <SelecteurVue vue={vue} onChanger={onVue} />
      </div>
      <div className="live-focus-summary">
        <div className="live-focus-stats">
          <button type="button" className="live-focus-summary-item" onClick={onDuree} aria-label="Adapter la durée de la séance">
            <Stopwatch aria-hidden />
            <span>Durée</span>
            {demarreeA ? <ChronoSeance demarreeA={demarreeA} dureeCibleMinutes={dureeCibleMinutes} dureeMaxMinutes={dureeMaxMinutes} compact /> : <strong className="chiffres">0 min</strong>}
          </button>
          <div className="live-focus-summary-item">
            <ChartNoAxesCombined aria-hidden />
            <span>Volume estimé</span>
            <strong className="chiffres">— kg</strong>
          </div>
        </div>
        <button type="button" className="live-finish-button" onClick={onTerminer}>
          <Square aria-hidden /> Finir la séance
        </button>
      </div>
    </header>
  );
}
