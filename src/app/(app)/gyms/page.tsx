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
   * Les lieux de CE compte.
   *
   * La requête ne portait que `archive_le IS NULL` : l'écran listait les salles
   * de tous les comptes de la base. Sur un compte partagé à deux, chacun voyait
   * les lieux de l'autre — et pouvait ouvrir leur fiche.
   *
   * Le compte des appareils est fait par la base, dans la même requête : le
   * faire ensuite, lieu par lieu, rendait l'écran linéaire en nombre de salles.
   */
  const mesSalles = await db
    .select({
      gym: gyms,
      appareils: sql<number>`cast(count(${exerciseInstances.id}) as int)`,
    })
    .from(gyms)
    .leftJoin(
      exerciseInstances,
      and(eq(exerciseInstances.gymId, gyms.id), machinesUtilisablesAujourdhui()),
    )
    .where(and(eq(gyms.userId, userId), isNull(gyms.archiveLe)))
    .groupBy(gyms.id)
    .orderBy(gyms.nom);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-encre">Mes salles</h1>
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
        {mesSalles.map(({ gym, appareils }) => (
          <Link key={gym.id} href={`/gyms/${gym.id}`} className="block">
            <GymCard gym={gym} appareils={appareils} />
          </Link>
        ))}
      </div>

      {mesSalles.length === 0 && (
        <p className="text-encre-3 text-center py-8">
          Aucune salle. Crée ta première salle pour commencer.
        </p>
      )}
    </div>
  );
}
