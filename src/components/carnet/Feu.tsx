/**
 * Pastille du feu biologique du jour.
 *
 * Remplace les quatre mappings de couleur dupliqués dans l'application, dont
 * deux se trouvaient dans le même fichier.
 */
export type NiveauFeu = "vert" | "orange" | "rouge";

const COULEURS: Record<NiveauFeu, string> = {
  vert: "bg-feu-vert",
  orange: "bg-feu-orange",
  rouge: "bg-feu-rouge",
};

const LIBELLES: Record<NiveauFeu, string> = {
  vert: "Feu vert — séance complète",
  orange: "Feu orange — séance allégée",
  rouge: "Feu rouge — récupération",
};

interface Props {
  niveau: NiveauFeu | string | null | undefined;
  /** Affiche le libellé à côté de la pastille. */
  avecLibelle?: boolean;
  className?: string;
}

function estNiveau(v: unknown): v is NiveauFeu {
  return v === "vert" || v === "orange" || v === "rouge";
}

export function Feu({ niveau, avecLibelle = false, className = "" }: Props) {
  if (!estNiveau(niveau)) return null;

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span
        className={`w-2.5 h-2.5 rounded-full shrink-0 ${COULEURS[niveau]}`}
        role="img"
        aria-label={LIBELLES[niveau]}
      />
      {avecLibelle && <span className="text-sm text-encre-2">{LIBELLES[niveau]}</span>}
    </span>
  );
}
