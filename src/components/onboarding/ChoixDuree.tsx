"use client";
import { useState } from "react";
import { ChampNombre } from "./ChampNombre";
import { BORNES_DUREE, DUREES_PROPOSEES } from "@/lib/validators/onboarding";
import { nombre } from "@/lib/saisie";

/**
 * Combien de temps dure une séance.
 *
 * Quatre durées courantes en un tap, et « Autre » pour le reste. Taper « 60 »
 * au clavier pour une valeur que presque tout le monde choisit était du travail
 * inutile — et c'est là que naissaient les « 060 ».
 */

interface Props {
  label: string;
  valeur: string;
  onChange: (v: string) => void;
  aide?: string;
}

export function ChoixDuree({ label, valeur, onChange, aide }: Props) {
  const proposee = DUREES_PROPOSEES.includes(Number(valeur) as never);
  const [libre, setLibre] = useState(valeur !== "" && !proposee);

  return (
    <div className="space-y-2">
      <p className="text-encre-2 text-sm">{label}</p>
      <div className="flex flex-wrap gap-2">
        {DUREES_PROPOSEES.map((d) => {
          const actif = !libre && Number(valeur) === d;
          return (
            <button
              key={d}
              type="button"
              aria-pressed={actif}
              onClick={() => { setLibre(false); onChange(String(d)); }}
              className={`chiffres h-11 min-w-[4.5rem] px-3 rounded-lg border text-sm ${
                actif ? "border-encre bg-encre text-papier" : "border-filet bg-carte text-encre"
              }`}
            >
              {d} min
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={libre}
          onClick={() => { setLibre(true); onChange(""); }}
          className={`h-11 px-4 rounded-lg border text-sm ${
            libre ? "border-encre bg-encre text-papier" : "border-filet bg-carte text-encre"
          }`}
        >
          Autre
        </button>
      </div>

      {libre && (
        <ChampNombre
          id={`duree-${label}`}
          label="Durée en minutes"
          valeur={valeur}
          onChange={onChange}
          placeholder={String(BORNES_DUREE.defaut)}
          unite="min"
        />
      )}

      {aide && <p className="text-encre-3 text-xs">{aide}</p>}

      {valeur !== "" &&
        (nombre(valeur, BORNES_DUREE.defaut) < BORNES_DUREE.min ||
          nombre(valeur, BORNES_DUREE.defaut) > BORNES_DUREE.max) && (
          <p className="text-perte text-sm">
            Entre {BORNES_DUREE.min} et {BORNES_DUREE.max} minutes.
          </p>
        )}
    </div>
  );
}
