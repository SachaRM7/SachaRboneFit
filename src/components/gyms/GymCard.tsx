import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { statutInventaire, type StatutInventaire } from "@/lib/engine/disponibilite";
import type { Gym } from "@/db/schema";

/**
 * Ce qu'on sait du matériel de ce lieu.
 *
 * La carte affichait `gym.notes` — un texte libre écrit une fois à la création
 * du lieu et jamais relu depuis. Saint-Martin annonçait donc « Machines à
 * inventorier sur place » avec ses 123 appareils décrits : la phrase datait de
 * l'époque où la salle était vide, et rien ne la mettait à jour.
 *
 * Le statut se lit maintenant à sa source : la colonne `inventaire_statut` et
 * le nombre réel d'appareils. La note reste affichée, mais comme ce qu'elle
 * est — une note.
 */
function libelleInventaire(statut: StatutInventaire, appareils: number): string {
  if (statut === "complet") {
    return `Inventaire complet — ${appareils} appareil${appareils > 1 ? "s" : ""}`;
  }
  if (appareils > 0) {
    return `${appareils} appareil${appareils > 1 ? "s" : ""} décrit${appareils > 1 ? "s" : ""}`;
  }
  return "Matériel à décrire";
}

interface GymCardProps {
  gym: Gym;
  /** Appareils utilisables décrits dans ce lieu. */
  appareils?: number;
  onClick?: () => void;
}

export function GymCard({ gym, appareils, onClick }: GymCardProps) {
  const statut = statutInventaire(gym.inventaireStatut);

  return (
    <Card
      className="bg-carte border-filet cursor-pointer hover:border-filet transition-colors"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-encre text-base">{gym.nom}</CardTitle>
          {gym.est24h && (
            <Badge variant="outline" className="border-gain text-gain text-xs shrink-0">
              24h
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {gym.horairesOuverture && (
          <p className="text-encre-2 text-sm">{gym.horairesOuverture}</p>
        )}
        {appareils !== undefined && (
          <p className="text-encre-2 text-sm">{libelleInventaire(statut, appareils)}</p>
        )}
        {gym.notes && (
          <p className="text-encre-3 text-xs line-clamp-2">{gym.notes}</p>
        )}
      </CardContent>
    </Card>
  );
}
