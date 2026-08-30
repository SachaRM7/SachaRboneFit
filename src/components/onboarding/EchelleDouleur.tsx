"use client";
import { SEVERITE_ECARTEMENT } from "@/lib/validators/onboarding";

/**
 * L'intensité d'une gêne, de 1 à 10.
 *
 * Un `input[type=range]` demande de viser au doigt une valeur précise sur une
 * barre de quelques millimètres. Onze cibles franches se touchent sans viser,
 * et se lisent sans interpréter la position d'un curseur.
 *
 * Ce qui est dit sous l'échelle décrit la CONSÉQUENCE, pas la règle : le seuil
 * appartient au moteur, l'utilisateur n'a pas à le connaître pour répondre.
 */

interface Props {
  valeur: number;
  onChange: (v: number) => void;
  labelZone: string;
}

export function EchelleDouleur({ valeur, onChange, labelZone }: Props) {
  const ecarte = valeur >= SEVERITE_ECARTEMENT;

  return (
    <div className="space-y-2">
      <div className="flex gap-1" role="radiogroup" aria-label={`Intensité — ${labelZone}`}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={valeur === n}
            aria-label={`${n} sur 10`}
            onClick={() => onChange(n)}
            className={`chiffres flex-1 h-11 rounded-md border text-sm tabular-nums ${
              valeur === n
                ? "border-encre bg-encre text-papier"
                : n < valeur
                  ? "border-filet bg-papier-2 text-encre-2"
                  : "border-filet bg-carte text-encre-3"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="text-encre-2 text-sm">
        {ecarte
          ? "Les exercices qui sollicitent fortement cette zone seront évités."
          : "J'adapterai les exercices qui sollicitent cette zone."}
      </p>
    </div>
  );
}
