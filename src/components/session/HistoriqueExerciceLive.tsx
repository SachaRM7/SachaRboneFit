"use client";

import { useState } from "react";
import { ChevronRight, History } from "@/components/ui/icons";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { rpeVersReserve } from "@/lib/engine/reserve";
import type { ExercicePrescrit } from "./types";

const nombre = (valeur: number) => valeur.toLocaleString("fr-FR");
const dateCourte = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

export function HistoriqueExerciceLive({ exercice }: { exercice: ExercicePrescrit }) {
  const [ouvert, setOuvert] = useState(false);
  // Older cached plans have undated sets; keep them visible without inventing a date.
  const seances = exercice.historiqueSeances?.length
    ? exercice.historiqueSeances
    : exercice.historique?.length
      ? [{ sessionLogId: "reference", date: null, sets: exercice.historique.map((serie, index) => ({ ...serie, numero: index + 1, rpe: null })) }]
      : [];
  return <section className="focus-history-block" aria-label="Historique de cet exercice">
    <header>
      <h3>Historique de cet exercice</h3>
      {seances.length > 0 && <button type="button" onClick={() => setOuvert(true)}>Voir plus <ChevronRight aria-hidden /></button>}
    </header>
    {seances.length === 0 ? <div className="focus-history-empty">
      <History aria-hidden />
      <div><strong>Aucun historique pour le moment</strong><p>Tes séries apparaîtront ici au fil de tes entraînements.</p></div>
    </div> : <div className="focus-history-grid">
      {seances.slice(0, 2).map((seance) => {
        const premiere = seance.sets[0];
        if (!premiere) return null;
        const identiques = seance.sets.every((serie) => serie.charge === premiere.charge && serie.reps === premiere.reps);
        const memeCharge = seance.sets.every((serie) => serie.charge === premiere.charge);
        const reserve = premiere.rpe != null && seance.sets.every((serie) => serie.rpe === premiere.rpe) ? rpeVersReserve(premiere.rpe) : null;
        return <div key={seance.sessionLogId}>
          <span>{seance.date ? dateCourte(seance.date) : "Dernière séance"}</span>
          <div className="focus-history-performance">
            <strong className="chiffres">{identiques ? `${seance.sets.length} × ${premiere.reps} @ ${nombre(premiere.charge)} kg` : `${seance.sets.length} séries${memeCharge ? ` @ ${nombre(premiere.charge)} kg` : ""}`}</strong>
            {reserve !== null && <small>{reserve === 5 ? "5+" : reserve} RIR</small>}
          </div>
        </div>;
      })}
    </div>}
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogContent className="live-detail-sheet">
        <DialogHeader><DialogTitle>Historique · {exercice.nom}</DialogTitle></DialogHeader>
        <div className="live-detail-body">
          {seances.map((seance) => <section key={seance.sessionLogId}>
            <h3>{seance.date ? dateCourte(seance.date) : "Dernière séance"}</h3>
            <ul className="live-history-details">{seance.sets.map((serie) => <li key={serie.numero}>
              <span>Série {serie.numero}</span><strong>{serie.reps} × {nombre(serie.charge)} kg</strong>
              {serie.rpe != null && <span>{rpeVersReserve(serie.rpe) === 5 ? "5+" : rpeVersReserve(serie.rpe)} RIR</span>}
            </li>)}</ul>
          </section>)}
        </div>
      </DialogContent>
    </Dialog>
  </section>;
}
