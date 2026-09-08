"use client";
import { Fragment, useEffect, useState } from "react";
import { RepereEnConstruction } from "./RepereEnConstruction";
import { IllustrationExercice } from "@/components/exercises/IllustrationExercice";
import { CATALOGUE_PAR_SLUG } from "@/lib/referentiels/catalogue";
import { libelleDeLaMesure, type PorteeDeLaMesure } from "@/lib/engine/charges";

interface Record {
  exerciseInstanceId: string;
  exerciseName: string;
  machineNom: string;
  charge: number;
  reps: number;
  estimation1RM: number;
  portee: PorteeDeLaMesure;
  date: string;
  recent: boolean;
  nature: "baseline" | "record";
  slug?: string | null;
}

/**
 * Records personnels : meilleure performance estimée, par entrée.
 *
 * L'application enregistrait les performances depuis toujours sans jamais en
 * extraire de record.
 *
 * Le chiffre affiché ne s'appelle « 1RM » que là où le nombre saisi est une
 * masse. Sur une pile ou un Smith, c'est un indice de cette entrée : le dire
 * évite de croire qu'on peut le comparer d'un appareil à l'autre.
 */
export function Records() {
  const [resultat, setResultat] = useState<{
    records: Record[];
    echec?: boolean;
  } | null>(null);
  const chargement = resultat === null;

  useEffect(() => {
    let annule = false;
    fetch("/api/progression/records")
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      )
      .then((d) => !annule && setResultat(d))
      .catch(() => !annule && setResultat({ records: [], echec: true }));
    return () => {
      annule = true;
    };
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

  if (resultat.echec)
    return (
      <p role="alert">
        Impossible de lire tes records. Reviens au bilan puis réessaie.
      </p>
    );

  if (resultat.records.length === 0) {
    return (
      <RepereEnConstruction titre="Tes prochains repères">
        <p>
          Une première performance devient une référence. La dépasser lors d’une
          autre séance fera apparaître un record.
        </p>
      </RepereEnConstruction>
    );
  }

  const groupe = (r: Record) =>
    r.nature === "record" && r.recent ? 0 : r.nature === "record" ? 1 : 2;
  const tries = [...resultat.records].sort(
    (a, b) => groupe(a) - groupe(b) || b.date.localeCompare(a.date),
  );
  const titres = [
    "Records de ta dernière séance",
    "Tes records",
    "Tes références de départ",
  ];
  return (
    <div className="records-stories space-y-2">
      {tries.map((r, index) => {
        const catalogue = r.slug ? CATALOGUE_PAR_SLUG.get(r.slug) : null;
        return (
          <Fragment key={r.exerciseInstanceId}>
            {(index === 0 || groupe(tries[index - 1]!) !== groupe(r)) && (
              <h2 className="record-group-title">{titres[groupe(r)]}</h2>
            )}
            <div className="border-t border-filet-doux pt-2.5 flex items-start gap-3">
              {r.slug && catalogue && (
                <IllustrationExercice
                  slug={r.slug}
                  nom={r.exerciseName}
                  nbFrames={catalogue.nbFrames}
                  className="w-9 h-9 shrink-0 text-encre-3"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-encre font-semibold text-sm leading-tight">
                  {r.exerciseName}
                </p>
                <p className="text-encre-3 text-xs mt-0.5">
                  {r.machineNom} ·{" "}
                  {new Date(`${r.date}T12:00:00`).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
                <span className="flex flex-wrap gap-1 mt-1">
                  {/* Une première mesure n'est pas un exploit : elle est le point
                    depuis lequel on mesurera. Le dire évite de féliciter
                    quelqu'un d'être monté sur la machine. */}
                  {r.nature === "baseline" ? (
                    <span className="inline-block text-[10px] font-bold uppercase tracking-wide bg-papier-2 text-encre-2 px-1.5 py-0.5 rounded">
                      Référence
                    </span>
                  ) : (
                    <span className="inline-block text-[10px] font-bold uppercase tracking-wide bg-gain-fond text-gain px-1.5 py-0.5 rounded">
                      Record
                    </span>
                  )}
                  {r.recent && (
                    <span className="inline-block text-[10px] font-bold uppercase tracking-wide bg-papier-2 text-encre-2 px-1.5 py-0.5 rounded">
                      Dernière séance
                    </span>
                  )}
                </span>
              </div>
              <div className="text-right shrink-0">
                <p className="chiffres text-base font-semibold text-encre">
                  {r.charge} kg
                </p>
                <p className="chiffres text-[11px] text-encre-3 mt-0.5">
                  {r.reps} répétitions
                </p>
                <p className="text-[10px] text-encre-3">
                  {libelleDeLaMesure(r.portee)} : {r.estimation1RM} kg
                </p>
              </div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
