import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { seanceTemplates, exerciseInTemplate, exerciseInstances, exercises } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const { templateId } = await params;
  try {
    const template = await db.query.seanceTemplates.findFirst({
      where: eq(seanceTemplates.id, templateId),
    });

    if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const exercisesInTemplate = await db.query.exerciseInTemplate.findMany({
      where: eq(exerciseInTemplate.seanceTemplateId, templateId),
      with: {
        exerciseInstance: {
          with: {
            exercise: true,
            gym: true,
          },
        },
      },
      orderBy: (eit, { asc }) => [asc(eit.ordre)],
    });

    const exercises = exercisesInTemplate.map((eit: any) => ({
      id: eit.exerciseInstance.id,
      nom: eit.exerciseInstance.exercise.nom,
      machineNom: eit.exerciseInstance.machineNom,
      gymNom: eit.exerciseInstance.gym?.nom,
      seriesCibles: eit.seriesCibles,
      fourchetteRepsMin: eit.fourchetteRepsMin,
      fourchetteRepsMax: eit.fourchetteRepsMax,
      tempo: eit.tempo,
      incrementsPossibles: eit.exerciseInstance.incrementsPossibles,
      poidsNonCompte: eit.exerciseInstance.poidsNonCompte,
    }));

    return NextResponse.json({ ...template, exercises });
  } catch (error) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
