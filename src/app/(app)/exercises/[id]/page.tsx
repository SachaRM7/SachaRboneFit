import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { exercises, exerciseInstances } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { PilierBadge } from "@/components/exercises/PilierBadge";
import { IllustrationExercice } from "@/components/exercises/IllustrationExercice";
import { EquiperDansSalle } from "@/components/exercises/EquiperDansSalle";
import { CATALOGUE_PAR_SLUG } from "@/lib/referentiels/catalogue";
import { Badge } from "@/components/ui/badge";
import { libelleProfilTension, libelleTypeMouvement, libelleMuscles } from "@/lib/referentiels/libelles";
import { LIBELLES_CONVENTION } from "@/lib/validators/exercise-instance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ExerciseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { id } = await params;

  const exercise = await db.query.exercises.findFirst({
    where: eq(exercises.id, id),
  });

  if (!exercise) notFound();

  const instances = await db.query.exerciseInstances.findMany({
    where: eq(exerciseInstances.exerciseId, id),
    with: { gym: true },
  });

  // L'illustration n'etait affichee que dans la liste et les records : la fiche
  // d'un exercice, seul endroit ou l'on vient justement verifier un mouvement,
  // n'en montrait aucune.
  const fiche = exercise.slug ? CATALOGUE_PAR_SLUG.get(exercise.slug) : undefined;

  return (
    <div className="p-4 space-y-4 pb-24">
      {fiche && exercise.slug && (
        <div className="flex justify-center rounded-xl border border-filet bg-carte py-6">
          <IllustrationExercice
            slug={exercise.slug}
            nom={exercise.nom}
            nbFrames={fiche.nbFrames}
            anime
            className="h-44 w-44 text-encre"
          />
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-2">
          <PilierBadge pilier={exercise.pilier} />
          <Badge variant="outline" className="border-filet text-encre-3">
            {libelleProfilTension(exercise.profilTension)}
          </Badge>
          <Badge variant="outline" className="border-filet text-encre-3">
            {libelleTypeMouvement(exercise.type)}
          </Badge>
        </div>
        <h1 className="text-xl font-bold text-encre">{exercise.nom}</h1>
        {exercise.musclesPrincipaux && exercise.musclesPrincipaux.length > 0 && (
          <p className="text-encre-3 text-sm mt-1">
            Muscles : {libelleMuscles(exercise.musclesPrincipaux)}
          </p>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-encre mb-3">Où le faire</h2>
        {instances.length === 0 ? (
          <p className="text-encre-3 mb-3">Cet exercice n&apos;est équipé dans aucune de tes salles.</p>
        ) : (
          <div className="space-y-3">
            {instances.map((inst) => (
              <Card key={inst.id} className="bg-carte border-filet">
                <CardHeader className="pb-2">
                  <CardTitle className="text-encre text-sm">{inst.machineNom}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  <p className="text-encre-2 text-xs">{inst.gym?.nom}</p>
                  <p className="text-encre-3 text-xs">
                    {LIBELLES_CONVENTION[inst.conventionCharge as keyof typeof LIBELLES_CONVENTION] ?? inst.conventionCharge} · incréments {inst.incrementsPossibles?.join(", ")} kg
                  </p>
                  {inst.poidsNonCompte && (
                    <p className="text-encre-3 text-xs">
                      Plateforme {inst.poidsNonCompte} kg non comptée
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* La bibliothèque comptait 121 exercices consultables et 9
            programmables, sans chemin entre les deux : il fallait deviner qu'un
            exercice ne devient utilisable qu'une fois équipé dans une salle. */}
        <div className="mt-3">
          <EquiperDansSalle
            exerciseId={exercise.id}
            exerciceNom={exercise.nom}
            sallesDejaEquipees={instances.map((i) => i.gymId).filter((id): id is string => Boolean(id))}
          />
        </div>
      </div>
    </div>
  );
}
