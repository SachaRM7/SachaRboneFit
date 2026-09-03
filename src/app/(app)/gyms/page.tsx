import { redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { db } from "@/db/client";
import { exerciseInstances, gyms } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { GymCard } from "@/components/gyms/GymCard";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { machinesUtilisablesAujourdhui } from "@/db/archivage";

export default async function GymsPage() {
  // Mémoïsé pour la durée du rendu : le layout vient de faire cet
  // aller-retour vers le serveur d'authentification, inutile de le refaire.
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  /**
   * TOUTES les salles connues, et non « les miennes ».
   *
   * Une salle et son inventaire décrivent un lieu, pas un pratiquant : deux
   * personnes qui s'entraînent au même endroit y trouvent le même matériel, et
   * le parc physique n'a aucune raison d'être ressaisi une fois par compte.
   * `gyms.user_id` dit qui tient ce lieu à jour — un droit de maintenance —,
   * pas qui a le droit de le voir.
   *
   * Cet écran avait été filtré par compte pour corriger une fuite constatée
   * ailleurs. Le raisonnement était faux ici : la fuite n'était pas la
   * visibilité de la salle, c'était la DÉDUCTION de la salle du jour, qui
   * s'attribuait le lieu d'un autre sans que personne l'ait choisi. Cette
   * déduction est corrigée dans le moteur, et la lecture redevient commune.
   *
   * Trois notions distinctes, à ne plus confondre :
   *
   *   visibilité   partagée — tout le monde voit St-Martin si elle existe
   *   utilisation  explicite — une préférence, ou un choix fait sur l'écran
   *   maintenance  au mainteneur — `peutGererLaSalle`, appliqué par l'API
   *
   * Le compte des appareils est fait par la base, dans la même requête : le
   * faire ensuite, lieu par lieu, rendait l'écran linéaire en nombre de salles.
   */
  const salles = await db
    .select({
      gym: gyms,
      appareils: sql<number>`cast(count(${exerciseInstances.id}) as int)`,
    })
    .from(gyms)
    .leftJoin(
      exerciseInstances,
      and(eq(exerciseInstances.gymId, gyms.id), machinesUtilisablesAujourdhui()),
    )
    .where(isNull(gyms.archiveLe))
    .groupBy(gyms.id)
    .orderBy(gyms.nom);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        {/* « Mes salles » sous-entendait une propriété personnelle qui n'existe
            pas dans le modèle : le catalogue des lieux est commun. */}
        <h1 className="text-xl font-bold text-encre">Salles</h1>
        {/* Un seul point d'ajout, lisible dans les deux thèmes. Il y en avait
            deux — ce bouton et un flottant en bas — et celui-ci était presque
            invisible en clair, faute de contraste sur son fond. */}
        <Link href="/gyms/new">
          <Button size="sm" className="bg-encre text-papier hover:bg-encre/90">
            <Plus className="w-4 h-4 mr-1.5" />
            Ajouter
          </Button>
        </Link>
      </div>

      <div className="space-y-3">
        {salles.map(({ gym, appareils }) => (
          <Link key={gym.id} href={`/gyms/${gym.id}`} className="block">
            <GymCard gym={gym} appareils={appareils} />
          </Link>
        ))}
      </div>

      {salles.length === 0 && (
        <p className="text-encre-3 text-center py-8">
          Aucune salle. Crée ta première salle pour commencer.
        </p>
      )}
    </div>
  );
}
