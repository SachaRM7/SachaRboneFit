import { ExerciseLibrary } from "@/components/exercises/ExerciseLibrary";
import { db } from "@/db/client";
import { exercises } from "@/db/schema";
import { MOCK_USER_ID } from "@/lib/constants";
import { eq } from "drizzle-orm";

export default async function ExercisesPage() {
  const allExercises = await db.query.exercises.findMany({
    where: eq(exercises.userId, MOCK_USER_ID),
  });

  return (
    <div className="pb-4">
      <h1 className="text-xl font-bold text-white p-4">Exercices</h1>
      <ExerciseLibrary exercises={allExercises} />
    </div>
  );
}
