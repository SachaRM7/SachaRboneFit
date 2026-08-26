/**
 * Affiche une variation : gain, perte ou stagnation.
 *
 * Un seul endroit décide de la couleur et du signe. Auparavant, quatre mappings
 * de couleur coexistaient dans l'application, avec des divergences.
 *
 * Deux règles portées ici :
 * - la couleur ne code jamais seule : un signe accompagne toujours la valeur,
 *   pour le daltonisme comme pour un écran en plein soleil ;
 * - le SENS suit l'objectif, pas le signe du nombre. En sèche, perdre du poids
 *   est un gain — d'où `sensInverse`.
 */
export type SensDelta = "gain" | "perte" | "neutre";

export function sensDuDelta(valeur: number, sensInverse = false): SensDelta {
  if (valeur === 0) return "neutre";
  const positif = valeur > 0;
  return (sensInverse ? !positif : positif) ? "gain" : "perte";
}

const CLASSES: Record<SensDelta, string> = {
  gain: "text-gain",
  perte: "text-perte",
  neutre: "text-neutre",
};

interface Props {
  valeur: number;
  unite?: string;
  /** Vrai quand une baisse est une bonne nouvelle (poids en sèche). */
  sensInverse?: boolean;
  /** Nombre de décimales affichées. */
  decimales?: number;
  className?: string;
}

export function Delta({ valeur, unite = "", sensInverse = false, decimales = 1, className = "" }: Props) {
  const sens = sensDuDelta(valeur, sensInverse);
  const arrondi = Number(valeur.toFixed(decimales));

  if (arrondi === 0) {
    return (
      <span className={`chiffres font-semibold ${CLASSES.neutre} ${className}`}>
        =<span className="sr-only"> stable</span>
      </span>
    );
  }

  const signe = arrondi > 0 ? "+" : "−";
  const absolu = Math.abs(arrondi).toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimales,
  });

  return (
    <span className={`chiffres font-semibold ${CLASSES[sens]} ${className}`}>
      {signe}
      {absolu}
      {unite && <span className="ml-0.5">{unite}</span>}
      <span className="sr-only">{sens === "gain" ? " — progression" : " — régression"}</span>
    </span>
  );
}
