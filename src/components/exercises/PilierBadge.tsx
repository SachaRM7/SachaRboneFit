import { Badge } from "@/components/ui/badge";

type Pilier =
  | "P1_poussee" | "P2_tirage" | "P3_squat" | "P4_hanche"
  | "epaules" | "bras_biceps" | "bras_triceps" | "jambes_iso" | "core";

const LIBELLES: Record<Pilier, string> = {
  P1_poussee: "Poussée",
  P2_tirage: "Tirage",
  P3_squat: "Squat",
  P4_hanche: "Hanche",
  epaules: "Épaules",
  bras_biceps: "Biceps",
  bras_triceps: "Triceps",
  jambes_iso: "Jambes",
  core: "Core",
};

/**
 * Étiquette de pilier.
 *
 * Elle portait neuf couleurs distinctes — une par pilier — ce qui contredit la
 * règle du système Carnet : la couleur ne décore jamais, elle signale. Un pilier
 * n'est pas un signal, c'est une catégorie ; il se lit très bien en toutes lettres.
 */
export function PilierBadge({ pilier }: { pilier: string }) {
  const libelle = LIBELLES[pilier as Pilier] ?? pilier;

  return (
    <Badge variant="outline" className="border-filet text-encre-3 text-xs font-medium">
      {libelle}
    </Badge>
  );
}
