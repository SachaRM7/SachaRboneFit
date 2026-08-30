"use client";

/**
 * Une note sur une échelle, en cibles franches.
 *
 * Un `input[type=range]` demande de viser au doigt une valeur précise sur une
 * barre de quelques millimètres, et ne montre pas la valeur choisie sans
 * qu'on interprète la position d'un curseur. Des cibles franches se touchent
 * sans viser et se lisent sans interpréter.
 *
 * `valeur` peut valoir `null` : rien n'est alors présélectionné. C'est ce qui
 * distingue « il n'a pas répondu » de « il a répondu 7 », que tout curseur
 * préréglé confond — et un défaut renvoyé tel quel est une donnée inventée.
 */

interface Props {
  valeur: number | null;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label: string;
  /** Rendu sous l'échelle, aux extrémités. */
  legendeBasse?: string;
  legendeHaute?: string;
}

export function EchelleDiscrete({
  valeur,
  onChange,
  min = 1,
  max = 10,
  label,
  legendeBasse,
  legendeHaute,
}: Props) {
  const valeurs = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1" role="radiogroup" aria-label={label}>
        {valeurs.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={valeur === n}
            aria-label={`${n} sur ${max}`}
            onClick={() => onChange(n)}
            className={`chiffres flex-1 h-11 rounded-md border text-sm tabular-nums ${
              valeur === n
                ? "border-encre bg-encre text-papier"
                : valeur !== null && n < valeur
                  ? "border-filet bg-papier-2 text-encre-2"
                  : "border-filet bg-carte text-encre-3"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      {(legendeBasse || legendeHaute) && (
        <div className="flex justify-between text-encre-3 text-xs">
          <span>{legendeBasse}</span>
          <span>{legendeHaute}</span>
        </div>
      )}
    </div>
  );
}
