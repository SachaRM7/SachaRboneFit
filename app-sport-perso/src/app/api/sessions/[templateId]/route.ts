import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { seanceTemplates, exerciseInTemplate, programmeBlocs } from "@/db/schema";
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

    const exercisesInTemplate = await db.query.exerciseInTemplate.findMany({
      where: eq(exerciseInTemplate.seanceTemplateId, templateId),
    });

    // Fetch all exercise instances for the user
    const allInstances = await db.query.exerciseInstances.findMany({
      where: (ei, { eq }) => eq(ei.userId, userId),
    });

    const instanceMap = new Map(allInstances.map(i => [i.id, i]));

    const exercises = exercisesInTemplate.map((eit: any) => {
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
