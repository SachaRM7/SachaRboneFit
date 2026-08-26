"use client";
import { useEffect, useState } from "react";
import { IllustrationExercice } from "@/components/exercises/IllustrationExercice";
import { CATALOGUE_PAR_SLUG } from "@/lib/referentiels/catalogue";

interface Record {
  exerciseInstanceId: string;
  exerciseName: string;
  machineNom: string;
  charge: number;
  reps: number;
  estimation1RM: number;
  date: string;
  recent: boolean;
  slug?: string | null;
}

/**
 * Records personnels : meilleur 1RM estimé par machine.
 *
 * L'application enregistrait les performances depuis toujours sans jamais en
 * extraire de record.
 */
export function Records() {
  const [resultat, setResultat] = useState<{ records: Record[] } | null>(null);
  const chargement = resultat === null;

  useEffect(() => {
    let annule = false;
    fetch("/api/progression/records")
      .then((r) => (r.ok ? r.json() : { records: [] }))
      .then((d) => !annule && setResultat(d))
      .catch(() => !annule && setResultat({ records: [] }));
    return () => { annule = true; };
  }, []);

  if (chargement) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-papier-2 rounded-lg h-14 animate-pulse" />
        ))}
      </div>
    );
  }

  if (resultat.records.length === 0) {
    return <p className="text-encre-3 text-sm">Aucun record pour l&apos;instant — enregistre une séance.</p>;
  }

  return (
    <div className="space-y-2">
      {resultat.records.map((r) => {
        const catalogue = r.slug ? CATALOGUE_PAR_SLUG.get(r.slug) : null;
        return (
          <div key={r.exerciseInstanceId} className="border-t border-filet-doux pt-2.5 flex items-start gap-3">
            {r.slug && catalogue && (
              <IllustrationExercice
                slug={r.slug}
                nom={r.exerciseName}
                nbFrames={catalogue.nbFrames}
                className="w-9 h-9 shrink-0 text-encre-3"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-encre font-semibold text-sm leading-tight">{r.exerciseName}</p>
              <p className="text-encre-3 text-xs mt-0.5">
                {r.machineNom} · {new Date(`${r.date}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
              </p>
              {r.recent && (
                <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wide bg-gain-fond text-gain px-1.5 py-0.5 rounded">
                  Dernière séance
                </span>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="chiffres text-base font-semibold text-encre">{r.estimation1RM} kg</p>
              <p className="chiffres text-[11px] text-encre-3 mt-0.5">{r.charge} × {r.reps}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
