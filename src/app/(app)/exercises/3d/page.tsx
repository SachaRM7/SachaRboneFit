import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Exercise3DStudio } from "@/components/exercises/three/ExerciseViewer";

export default function Exercise3DPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-8 pt-6">
      <Link href="/exercises" className="movement-back">
        <ArrowLeft size={18} aria-hidden /> Banque d’exercices
      </Link>
      <p className="mt-8 text-xs uppercase tracking-widest text-encre-3">
        Le mouvement sous tous les angles
      </p>
      <h1 className="mt-2 text-3xl font-bold text-encre">Studio 3D</h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-encre-2">
        Tourne autour du corps, ralentis le geste et repère les muscles ciblés.
        Trois premières démonstrations pour explorer la future bibliothèque.
      </p>
      <Exercise3DStudio />
    </main>
  );
}
