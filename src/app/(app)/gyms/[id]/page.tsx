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
import { peutGererLaSalle, REFUS_GESTION_SALLE } from "@/lib/autorisations";
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
   * La fiche est LISIBLE par tous : un lieu est un fait commun, et quelqu'un
   * qui va s'entraîner à St-Martin doit pouvoir en consulter les horaires et le
   * matériel sans l'avoir créée.
   *
   * Ce qui n'est pas commun, c'est la MAINTENANCE. Cette page avait été filtrée
   * par compte pour empêcher un autre d'y modifier quoi que ce soit — mais ça
   * fermait aussi la consultation, et l'API garde déjà l'écriture par
   * `peutGererLaSalle`. Le formulaire n'apparaît donc que pour le mainteneur :
   * le refus était sinon découvert après avoir rempli les champs, en 403.
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
    .where(and(eq(gyms.id, id), isNull(gyms.archiveLe)))
    .groupBy(gyms.id)
    .limit(1);

  if (!salle) notFound();
  const { gym, appareils } = salle;

  // La même fonction que l'API : deux règles séparées auraient fini par
  // différer, et l'écran aurait proposé une action que le serveur refuse.
  const jePeuxLaGerer = peutGererLaSalle(gym, userId);

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
      {jePeuxLaGerer ? (
        <>
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
        </>
      ) : (
        <div className="space-y-2 rounded-lg border border-filet bg-carte p-4">
          {gym.horairesOuverture && (
            <p className="text-encre-2 text-sm">{gym.horairesOuverture}</p>
          )}
          {gym.est24h && <p className="text-encre-2 text-sm">Ouvert 24 h.</p>}
          {gym.notes && <p className="text-encre-2 text-sm">{gym.notes}</p>}
          {/* Dire pourquoi, plutôt que de faire disparaître le formulaire sans
              explication : le lieu est consultable, et on peut s'y entraîner. */}
          <p className="text-encre-3 text-xs">{REFUS_GESTION_SALLE}</p>
        </div>
      )}
    </div>
  );
}
