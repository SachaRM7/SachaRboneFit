import { Badge } from "@/components/ui/badge";
import { libellePilier } from "@/lib/referentiels/libelles";

/**
 * Étiquette de pilier.
 *
 * Elle portait neuf couleurs distinctes — une par pilier — ce qui contredit la
 * règle du système Carnet : la couleur ne décore jamais, elle signale. Un pilier
 * n'est pas un signal, c'est une catégorie ; il se lit très bien en toutes lettres.
 */
export function PilierBadge({ pilier }: { pilier: string }) {
  // Troisième copie de la table des piliers, et la seule qui disait « Core »
  // là où les autres disent « Gainage ». Une seule source désormais.
  const libelle = libellePilier(pilier);

  return (
    <Badge variant="outline" className="border-filet text-encre-3 text-xs font-medium">
      {libelle}
    </Badge>
  );
}
