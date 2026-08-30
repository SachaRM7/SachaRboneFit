"use client";
import { SEVERITE_ECARTEMENT } from "@/lib/validators/onboarding";
import { EchelleDiscrete } from "@/components/ui/EchelleDiscrete";

/**
 * L'intensité d'une gêne, de 1 à 10.
 *
 * L'échelle elle-même est générique (`EchelleDiscrete`) : ce composant ne
 * garde que ce qui lui appartient — le seuil métier et la phrase qui décrit
 * la CONSÉQUENCE plutôt que la règle. L'utilisateur n'a pas à connaître le
 * seuil pour répondre.
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
      <EchelleDiscrete
        valeur={valeur}
        onChange={onChange}
        label={`Intensité — ${labelZone}`}
      />
      <p className="text-encre-2 text-sm">
        {ecarte
          ? "Les exercices qui sollicitent fortement cette zone seront évités."
          : "J'adapterai les exercices qui sollicitent cette zone."}
      </p>
    </div>
  );
}
