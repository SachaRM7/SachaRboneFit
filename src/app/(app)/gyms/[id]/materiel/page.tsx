import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/client";
import { gyms, exerciseInstances, exercises } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IllustrationExercice } from "@/components/exercises/IllustrationExercice";
import { CATALOGUE_PAR_SLUG } from "@/lib/referentiels/catalogue";
import { LIBELLES_EQUIPEMENT, versEquipement } from "@/lib/referentiels/equipements";
import { ArrowLeft } from "lucide-react";

/**
 * Materiel reellement disponible dans une salle.
 *
 * Cet ecran n'existait pas : les machines n'etaient visibles que depuis la fiche
 * d'un exercice, et rien ne permettait de voir le parc d'une salle d'un coup.
 */
export default async function MaterielSallePage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const { id } = await params;

  const salle = await db.query.gyms.findFirst({
    where: and(eq(gyms.id, id), eq(gyms.userId, userId)),
  });
  if (!salle) notFound();

  const instances = await db.query.exerciseInstances.findMany({
    where: and(eq(exerciseInstances.gymId, id), eq(exerciseInstances.userId, userId)),
    with: { exercise: true },
  });

  const totalCatalogue = await db.$count(exercises, eq(exercises.userId, userId));

  const parPilier = new Map<string, typeof instances>();
  for (const i of instances) {
    const pilier = i.exercise?.pilier ?? "autre";
    parPilier.set(pilier, [...(parPilier.get(pilier) ?? []), i]);
  }

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-3">
        <Link href={`/gyms/${id}`} aria-label="Retour à la salle">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5 text-white" /></Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white">Matériel · {salle.nom}</h1>
          <p className="text-zinc-500 text-sm">
            {instances.length} machine{instances.length > 1 ? "s" : ""} référencée
            {instances.length > 1 ? "s" : ""} sur {totalCatalogue} exercices au catalogue
          </p>
        </div>
      </div>

      {instances.length === 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <p className="text-zinc-400 text-sm">
            Aucune machine référencée dans cette salle. Une séance ici ne pourra proposer
            aucun exercice tant que le matériel n&apos;est pas décrit.
          </p>
        </div>
      )}

      {[...parPilier.entries()].map(([pilier, liste]) => (
        <section key={pilier} className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">{pilier}</h2>
          <div className="space-y-2">
            {liste.map((i) => {
              const slug = i.exercise?.slug;
              const equipement = versEquipement(i.exercise?.equipement);
              return (
                <div key={i.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                  <div className="flex items-start gap-3">
                    {slug && CATALOGUE_PAR_SLUG.has(slug) && (
                      <IllustrationExercice
                        slug={slug}
                        nom={i.exercise?.nom ?? ""}
                        nbFrames={CATALOGUE_PAR_SLUG.get(slug)!.nbFrames}
                        className="w-10 h-10 shrink-0 text-zinc-400"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium text-sm">{i.machineNom}</p>
                      <p className="text-zinc-500 text-xs">{i.exercise?.nom}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        {equipement && (
                          <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px]">
                            {LIBELLES_EQUIPEMENT[equipement]}
                          </Badge>
                        )}
                        <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px]">
                          {i.conventionCharge}
                        </Badge>
                        {i.chargeMax !== null && (
                          <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px]">
                            max {i.chargeMax} kg
                          </Badge>
                        )}
                      </div>
                      <p className="text-zinc-600 text-xs mt-1.5">
                        Incréments : {i.incrementsPossibles?.join(", ")} kg
                        {i.poidsNonCompte ? ` · ${i.poidsNonCompte} kg non comptés` : ""}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
