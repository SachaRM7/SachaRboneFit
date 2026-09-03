import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { seanceTemplates, exerciseInTemplate, programmeBlocs, exerciseInstances, exercises, gyms } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { dernieresSeriesPour } from "@/services/plan-seance";
import { computeNextSets } from "@/lib/engine/double-progression";
import { REPOS_PAR_DEFAUT_SECONDES } from "@/services/plan-seance";
import { CHARGE_INCONNUE, configurationDe } from "@/lib/engine/charges";
import { detailErreur } from "@/lib/erreurs";

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
      where: (eit, { and, eq, isNull }) =>
        and(eq(eit.seanceTemplateId, templateId), isNull(eit.archiveLe)),
      orderBy: (eit, { asc }) => [asc(eit.ordre)],
    });

    // Fetch all exercise instances for the user
    const allInstances = await db.query.exerciseInstances.findMany({
      where: (ei, { isNull }) => isNull(ei.archiveLe),
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

    // Cette route sert de repli quand l'écran de séance est ouvert sans plan
    // calculé. Elle ne renvoyait ni illustration, ni historique, ni charge
    // suggérée : le tableau de séries s'affichait alors avec une colonne kg
    // vide et « — » en face de chaque ligne, alors que les séries passées
    // existent. On applique ici la même double progression que le plan.
    // Une lecture d'historique pour tout le gabarit, et non une par exercice :
    // ce repli servait déjà six requêtes là où une suffit.
    const references = await dernieresSeriesPour(
      userId,
      exercisesInTemplate.map((eit) => eit.exerciseInstanceId),
    );

    const exercises = await Promise.all(
      exercisesInTemplate.map(async (eit) => {
        const inst = instanceMap.get(eit.exerciseInstanceId);
        const derniere = inst ? references.get(inst.id) ?? null : null;
        const suggestion = computeNextSets(derniere, {
          fourchetteRepsMin: eit.fourchetteRepsMin,
          fourchetteRepsMax: eit.fourchetteRepsMax,
          seriesCibles: eit.seriesCibles,
          charge: inst ? configurationDe(inst) : CHARGE_INCONNUE,
        });

        return {
          id: inst?.id,
          nom: inst?.exercise?.nom || "",
          machineNom: inst?.machineNom || "",
          gymNom: inst?.gym?.nom || "",
          slug: inst?.exercise?.slug ?? null,
          seriesCibles: eit.seriesCibles,
          fourchetteRepsMin: eit.fourchetteRepsMin,
          fourchetteRepsMax: eit.fourchetteRepsMax,
          rpeCible: eit.rpeCible,
          tempo: eit.tempo,
          incrementsPossibles: inst?.incrementsPossibles || [],
          poidsNonCompte: inst?.poidsNonCompte || null,
          // Même défaut que le plan calculé : sans lui, le chronomètre ne
          // démarre pas et l'intervalle entre séries n'est jamais mesuré.
          reposSecondes: eit.reposSecondes ?? REPOS_PAR_DEFAUT_SECONDES,
          ordre: eit.ordre,
          categorieRole: inst?.exercise?.categorieRole || "",
          profilTension: inst?.exercise?.profilTension || "",
          musclesPrincipaux: inst?.exercise?.musclesPrincipaux || [],
          chargeSuggeree: suggestion.charge,
          repsSuggerees: suggestion.reps,
          messageProgression: suggestion.messageProgression,
          // Ce chemin rend la suggestion directement, sans passer par la base :
          // le motif y voyage tel quel, sans avoir à être redérivé.
          motifProgression: suggestion.motifProgression,
          historique: (derniere?.sets ?? []).map((s) => ({ charge: s.charge, reps: s.reps })),
        };
      }),
    );

    return NextResponse.json({ ...template, exercises });
  } catch (error) {
    console.error("[sessions/templateId] error:", error);
    return NextResponse.json({ error: `Lecture de la séance : ${detailErreur(error)}` }, { status: 500 });
  }
}
