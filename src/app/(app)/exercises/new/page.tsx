import { ExerciseForm } from "@/components/exercises/ExerciseForm";

export default function NewExercisePage() {
  return (
    <div className="p-4">
      <h1 className="text-xl font-bold text-encre mb-4">Nouvel exercice</h1>
      <ExerciseForm />
    </div>
  );
}
