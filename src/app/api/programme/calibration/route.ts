import { NextResponse } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  exerciseInTemplate,
  exerciseInstances,
  exercises,
  gyms,
  programmeBlocs,
  seanceTemplates,
  users,
  contraintes,
} from "@/db/schema";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { detailErreur } from "@/lib/erreurs";
import { planCalibration, type MachineDisponible } from "@/lib/engine/plan-calibration";

/**
 * Fabrique les séances de la phase de calibration à partir du matériel
 * réellement présent dans la salle.
 *
 * C'est ce qui manquait entre l'onboarding et la première séance : l'écran de
 * démarrage exigeait un gabarit, et rien n'en produisait. La route est
 * idempotente — un bloc qui a déjà ses séances est renvoyé tel quel, on ne
 * reconstruit pas un programme sous les pieds de quelqu'un.
 */
export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const corps = await request.json().catch(() => ({}));
    const salleDemandee = typeof corps?.gymId === "string" ? corps.gymId : null;

    const [profil, bloc] = await Promise.all([
      db.query.users.findFirst({ where: eq(users.id, userId) }),
      db.query.programmeBlocs.findFirst({
        where: and(
          eq(programmeBlocs.userId, userId),
          isNull(programmeBlocs.archiveLe),
          eq(programmeBlocs.actif, true),
        ),
      }),
    ]);

    if (!bloc) {
      return NextResponse.json(
        { error: "Aucun bloc actif. Termine ton onboarding." },
        { status: 409 },
      );
    }

    const salleId = salleDemandee ?? profil?.prefSalleParDefautId ?? null;
    if (!salleId) {
      return NextResponse.json({ error: "Aucune salle sélectionnée." }, { status: 409 });
    }
    const salle = await db.query.gyms.findFirst({
      where: and(eq(gyms.id, salleId), isNull(gyms.archiveLe)),
    });
    if (!salle) {
      return NextResponse.json({ error: "Salle introuvable ou archivée." }, { status: 404 });
    }

    // La salle est résolue avant ce court-circuit : l'écran qui appelle cette
    // route a besoin de savoir où démarrer, que les séances viennent d'être
    // créées ou qu'elles existaient déjà.
    const dejaLa = await db.query.seanceTemplates.findMany({
      where: eq(seanceTemplates.blocId, bloc.id),
      orderBy: [asc(seanceTemplates.ordreDansSemaine)],
    });
    if (dejaLa.length > 0) {
      return NextResponse.json({
        blocId: bloc.id,
        deja: true,
        salle: { id: salle.id, nom: salle.nom },
        seances: dejaLa.map((s) => ({ id: s.id, lettre: s.lettre, nom: s.nom })),
        avertissements: [],
      });
    }

    // Le parc de la salle, avec ce que le référentiel sait de chaque mouvement.
    const lignes = await db
      .select({
        instanceId: exerciseInstances.id,
        exerciceId: exercises.id,
        nom: exercises.nom,
        pilier: exercises.pilier,
        categorieRole: exercises.categorieRole,
        musclesPrincipaux: exercises.musclesPrincipaux,
      })
      .from(exerciseInstances)
      .innerJoin(exercises, eq(exercises.id, exerciseInstances.exerciseId))
      .where(
        and(
          eq(exerciseInstances.gymId, salleId),
          isNull(exerciseInstances.archiveLe),
        ),
      );

    const machines: MachineDisponible[] = lignes.map((l) => ({
      instanceId: l.instanceId,
      exerciceId: l.exerciceId,
      nom: l.nom,
      pilier: l.pilier,
      categorieRole: l.categorieRole,
      musclesPrincipaux: l.musclesPrincipaux ?? [],
    }));

    const zonesSensibles = await db.query.contraintes.findMany({
      where: and(eq(contraintes.userId, userId), isNull(contraintes.dateFin)),
    });

    const plan = planCalibration({
      machines,
      frequenceCibleParSemaine: profil?.frequenceCibleParSemaine ?? 3,
      dureeSeanceCibleMinutes: profil?.dureeSeanceCibleMinutes ?? 60,
      musclesPrioritaires: profil?.objectifMusclesPrioritaires ?? [],
      exercicesRefuses: profil?.exercicesRefuses ?? [],
      // Une contrainte sévère écarte le muscle ; une gêne légère ne justifie pas
      // de ne jamais le mesurer.
      musclesSensibles: zonesSensibles
        .filter((c) => (c.severite ?? 0) >= 6)
        .map((c) => c.muscle)
        .filter((m): m is string => Boolean(m)),
    });

    if (plan.seances.length === 0) {
      return NextResponse.json(
        { error: plan.avertissements[0] ?? "Rien à programmer dans cette salle.", avertissements: plan.avertissements },
        { status: 409 },
      );
    }

    // Une seule transaction : un bloc avec deux séances sur trois serait un
    // programme que personne n'a voulu.
    const creees = await db.transaction(async (tx) => {
      const resultat: Array<{ id: string; lettre: string; nom: string }> = [];
      for (const s of plan.seances) {
        const [template] = await tx
          .insert(seanceTemplates)
          .values({
            blocId: bloc.id,
            lettre: s.lettre,
            nom: s.nom,
            ordreDansSemaine: s.ordreDansSemaine,
          })
          .returning();
        if (!template) throw new Error("Création de la séance impossible");

        if (s.exercices.length > 0) {
          await tx.insert(exerciseInTemplate).values(
            s.exercices.map((ex) => ({
              seanceTemplateId: template.id,
              exerciseInstanceId: ex.instanceId,
              ordre: ex.ordre,
              seriesCibles: ex.seriesCibles,
              fourchetteRepsMin: ex.fourchetteRepsMin,
              fourchetteRepsMax: ex.fourchetteRepsMax,
              rpeCible: ex.rpeCible,
              reposSecondes: ex.reposSecondes,
            })),
          );
        }
        resultat.push({ id: template.id, lettre: template.lettre, nom: template.nom });
      }
      return resultat;
    });

    return NextResponse.json(
      {
        blocId: bloc.id,
        deja: false,
        salle: { id: salle.id, nom: salle.nom },
        seances: creees,
        piliersNonCouverts: plan.piliersNonCouverts,
        avertissements: plan.avertissements,
      },
      { status: 201 },
    );
  } catch (error) {
    const detail = detailErreur(error);
    console.error("[api/programme/calibration]", detail, error);
    return NextResponse.json({ error: `Préparation de la calibration : ${detail}` }, { status: 500 });
  }
}
