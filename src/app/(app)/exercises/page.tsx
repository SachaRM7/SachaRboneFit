import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { exercises } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ExerciseLibrary } from "@/components/exercises/ExerciseLibrary";

export default async function ExercisesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const allExercises = await db.query.exercises.findMany({
    where: eq(exercises.userId, user.id),
  });

  return (
    <div className="pb-4">
      <h1 className="text-xl font-bold text-white p-4">Exercices</h1>
      <ExerciseLibrary exercises={allExercises} />
    </div>
  );
}
