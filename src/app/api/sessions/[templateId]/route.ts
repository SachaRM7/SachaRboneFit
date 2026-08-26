import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { seanceTemplates, exerciseInTemplate, programmeBlocs, exerciseInstances, exercises, gyms } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { templateId } = await params;
  try {
    const template = await db.query.seanceTemplates.findFirst({
      where: eq(seanceTemplates.id, templateId),
    });

    if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Verify the template belongs to a bloc owned by this user
    const bloc = await db.query.programmeBlocs.findFirst({
      where: (b, { eq, and }) => and(eq(b.id, template.blocId), eq(b.userId, userId)),
    });
    if (!bloc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Sans tri explicite, l'ordre d'affichage dependait de l'ordre de retour de
    // Postgres : la seance pouvait sortir dans le desordre d'une fois sur l'autre.
    const exercisesInTemplate = await db.query.exerciseInTemplate.findMany({
      where: eq(exerciseInTemplate.seanceTemplateId, templateId),
      orderBy: (eit, { asc }) => [asc(eit.ordre)],
    });

    // Fetch all exercise instances for the user
    const allInstances = await db.query.exerciseInstances.findMany({
      where: (ei, { eq }) => eq(ei.userId, userId),
    });

    // Manually load exercise and gym relations
    const exerciseIds = [...new Set(allInstances.map(i => i.exerciseId))];
    const gymIds = [...new Set(allInstances.map(i => i.gymId).filter(Boolean))];

    const allExercises = exerciseIds.length > 0 ? await db.query.exercises.findMany({
      where: (ex, { inArray }) => inArray(ex.id, exerciseIds),
    }) : [];
    const allGyms = gymIds.length > 0 ? await db.query.gyms.findMany({
      where: (g, { inArray }) => inArray(g.id, gymIds),
    }) : [];

    const exerciseMap = new Map(allExercises.map(e => [e.id, e]));
    const gymMap = new Map(allGyms.map(g => [g.id, g]));

    const instanceMap = new Map(allInstances.map(i => [i.id, {
      ...i,
      exercise: exerciseMap.get(i.exerciseId),
      gym: i.gymId ? gymMap.get(i.gymId) : null,
    }]));

    const exercises = exercisesInTemplate.map((eit) => {
      const inst = instanceMap.get(eit.exerciseInstanceId);
      return {
        id: inst?.id,
        nom: inst?.exercise?.nom || "",
        machineNom: inst?.machineNom || "",
        gymNom: inst?.gym?.nom || "",
        seriesCibles: eit.seriesCibles,
        fourchetteRepsMin: eit.fourchetteRepsMin,
        fourchetteRepsMax: eit.fourchetteRepsMax,
        tempo: eit.tempo,
        incrementsPossibles: inst?.incrementsPossibles || [],
        poidsNonCompte: inst?.poidsNonCompte || null,
        reposSecondes: eit.reposSecondes,
        ordre: eit.ordre,
        categorieRole: inst?.exercise?.categorieRole || "",
        profilTension: inst?.exercise?.profilTension || "",
        musclesPrincipaux: inst?.exercise?.musclesPrincipaux || [],
      };
    });

    return NextResponse.json({ ...template, exercises });
  } catch (error) {
    console.error("[sessions/templateId] error:", error);
    return NextResponse.json({ error: "Failed", details: String(error) }, { status: 500 });
  }
}
