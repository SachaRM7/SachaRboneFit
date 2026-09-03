import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { db } from "@/db/client";
import { exerciseInstances, gyms } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { GymForm } from "@/components/gyms/GymForm";
import { SupprimerSalle } from "@/components/gyms/SupprimerSalle";
import { EnTeteSecondaire } from "@/components/layout/EnTeteSecondaire";
import { Button } from "@/components/ui/button";
import { machinesUtilisablesAujourdhui } from "@/db/archivage";
import Link from "next/link";

export default async function GymDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // Mémoïsé pour la durée du rendu : le layout vient de faire cet
  // aller-retour vers le serveur d'authentification, inutile de le refaire.
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const { id } = await params;

  /**
   * Le lieu ET son inventaire, en une requête.
   *
   * Le filtre par compte manquait : n'importe quel identifiant de salle
   * ouvrait la fiche d'un lieu appartenant à quelqu'un d'autre, formulaire
   * d'édition compris.
   */
  const [salle] = await db
    .select({
      gym: gyms,
      appareils: sql<number>`cast(count(${exerciseInstances.id}) as int)`,
    })
    .from(gyms)
    .leftJoin(
      exerciseInstances,
      and(eq(exerciseInstances.gymId, gyms.id), machinesUtilisablesAujourdhui()),
    )
    .where(and(eq(gyms.id, id), eq(gyms.userId, userId), isNull(gyms.archiveLe)))
    .groupBy(gyms.id)
    .limit(1);

  if (!salle) notFound();
  const { gym, appareils } = salle;

  return (
    <div className="p-4 space-y-4">
      <EnTeteSecondaire titre={gym.nom} vers="/gyms" libelleRetour="Retour aux salles" />

      <Link href={`/gyms/${id}/exercices`} className="block">
        <Button variant="outline" className="w-full bg-carte border-filet text-encre">
          {appareils > 0
            ? `Voir le matériel — ${appareils} appareil${appareils > 1 ? "s" : ""}`
            : "Décrire le matériel de cette salle"}
        </Button>
      </Link>

      {/*
        `onSuccess` n'est plus transmis : cette page est un Server Component, et
        une fonction n'y traverse pas la frontière client. C'est ce qui faisait
        échouer le rendu — la fiche répondait 500 et Safari affichait son écran
        « A server error occurred ».
      */}
      <GymForm
        gymId={id}
        defaultValues={{
          nom: gym.nom,
          horairesOuverture: gym.horairesOuverture || undefined,
          est24h: gym.est24h || false,
          notes: gym.notes || undefined,
        }}
      />

      <div className="pt-4">
        <SupprimerSalle gymId={id} nom={gym.nom} />
      </div>
    </div>
  );
}
