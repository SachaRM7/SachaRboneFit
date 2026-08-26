import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { exercises, exerciseInstances } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { PilierBadge } from "@/components/exercises/PilierBadge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ExerciseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { id } = await params;

  const exercise = await db.query.exercises.findFirst({
    where: and(eq(exercises.id, id), eq(exercises.userId, user.id)),
  });

  if (!exercise) notFound();

  const instances = await db.query.exerciseInstances.findMany({
    where: eq(exerciseInstances.exerciseId, id),
    with: { gym: true },
  });

  return (
    <div className="p-4 space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <PilierBadge pilier={exercise.pilier} />
          <Badge variant="outline" className="border-filet text-encre-3">
            {exercise.profilTension}
          </Badge>
          <Badge variant="outline" className="border-filet text-encre-3">
            {exercise.type}
          </Badge>
        </div>
        <h1 className="text-xl font-bold text-encre">{exercise.nom}</h1>
        {exercise.musclesPrincipaux && exercise.musclesPrincipaux.length > 0 && (
          <p className="text-encre-3 text-sm mt-1">
            Muscles: {exercise.musclesPrincipaux.join(", ")}
          </p>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-encre mb-3">Instances</h2>
        {instances.length === 0 ? (
          <p className="text-encre-3">Aucune instance. Ajoutez une machine dans une salle.</p>
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
                    Convention: {inst.conventionCharge} | Incréments: {inst.incrementsPossibles?.join(", ")}
                  </p>
                  {inst.poidsNonCompte && (
                    <p className="text-encre-3 text-xs">
                      Plateforme: {inst.poidsNonCompte} kg
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
