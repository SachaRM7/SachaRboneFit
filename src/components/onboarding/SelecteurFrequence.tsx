"use client";
import { Minus, Plus } from "lucide-react";
import { ajusterFourchette, type ChampFourchette, type Fourchette } from "@/lib/saisie";

/**
 * Minimum, objectif, maximum de séances par semaine.
 *
 * Trois rangées de six boutons faisaient dix-huit cibles à l'écran pour trois
 * chiffres. Un pas-à-pas dit la même chose en trois lignes, et laisse voir la
 * fourchette d'un coup d'œil.
 *
 * Les trois valeurs sont liées : déplacer une borne emmène les autres plutôt
 * que de produire un état incohérent qu'on reprocherait ensuite.
 */

export const FREQUENCE_MIN = 1;
export const FREQUENCE_MAX = 7;

const LIGNES: Array<{ champ: ChampFourchette; libelle: string; aide: string }> = [
  { champ: "min", libelle: "Minimum", aide: "les semaines chargées" },
  { champ: "cible", libelle: "Objectif", aide: "une semaine normale" },
  { champ: "max", libelle: "Maximum", aide: "quand tout va bien" },
];

interface Props {
  valeur: Fourchette;
  onChange: (f: Fourchette) => void;
}

export function SelecteurFrequence({ valeur, onChange }: Props) {
  const pas = (champ: ChampFourchette, delta: number) => {
    const suivant = Math.min(FREQUENCE_MAX, Math.max(FREQUENCE_MIN, valeur[champ] + delta));
    if (suivant === valeur[champ]) return;
    onChange(ajusterFourchette(valeur, champ, suivant));
  };

  return (
    <div className="rounded-xl border border-filet bg-carte divide-y divide-filet-doux">
      {LIGNES.map(({ champ, libelle, aide }) => (
        <div key={champ} className="flex items-center gap-3 px-4 py-3">
          <div className="flex-1 min-w-0">
            <p className="text-encre text-sm font-medium">{libelle}</p>
            <p className="text-encre-3 text-xs">{aide}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => pas(champ, -1)}
              disabled={valeur[champ] <= FREQUENCE_MIN}
              aria-label={`${libelle} : une séance de moins`}
              className="w-11 h-11 rounded-lg border border-filet grid place-items-center text-encre-2 disabled:opacity-30"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span
              className="chiffres w-10 text-center text-lg font-semibold tabular-nums"
              aria-live="polite"
            >
              {valeur[champ]}
            </span>
            <button
              type="button"
              onClick={() => pas(champ, 1)}
              disabled={valeur[champ] >= FREQUENCE_MAX}
              aria-label={`${libelle} : une séance de plus`}
              className="w-11 h-11 rounded-lg border border-filet grid place-items-center text-encre-2 disabled:opacity-30"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
