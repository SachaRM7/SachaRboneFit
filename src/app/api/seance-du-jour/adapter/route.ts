import { NextResponse } from "next/server";
import { and, asc, eq, isNull, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  dailyStates,
  exerciseInstances,
  exercises,
  gyms,
  sessionLogs,
  sessionPlanItems,
} from "@/db/schema";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { detailErreur } from "@/lib/erreurs";
import { exercicesRealisables, incrementsParDefaut } from "@/lib/engine/disponibilite";
import { adapterSeance, type CandidatDisponible, type ExerciceEnPlace } from "@/lib/engine/adaptation-lieu";
import { validerSeanceComplete } from "@/services/validation";
import { MATERIEL_PORTABLE } from "@/lib/referentiels/capacites";

/**
 * Changer de lieu, ou de matériel, alors que la séance est déjà construite.
 *
 * On ne reconstruit pas. La séance porte une intention — ces muscles-là, ce
 * volume-là, à ce moment du cycle — et cette intention ne dépend pas de
 * l'endroit. Seuls les exercices devenus impossibles sont remplacés, et leur
 * remplaçant hérite de la prescription au lieu d'en recevoir une nouvelle.
 *
 * Rien n'est écrit avant que les trois contrôles soient passés : séance,
 * impact sur la semaine, alignement au cycle. Et l'appel est rejouable —
 * `apercu` calcule et montre sans rien modifier.
 */

const corpsSchema = z.object({
  sessionLogId: z.string().uuid(),
  gymId: z.string().uuid(),
  materielApporte: z.array(z.enum(MATERIEL_PORTABLE)).max(MATERIEL_PORTABLE.length).default([]),
  /** Calculer et montrer, sans rien écrire. */
  apercu: z.boolean().default(false),
});

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = corpsSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Requête invalide", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { sessionLogId, gymId, materielApporte, apercu } = parsed.data;

    const seance = await db.query.sessionLogs.findFirst({
      where: and(
        eq(sessionLogs.id, sessionLogId),
        eq(sessionLogs.userId, userId),
        isNull(sessionLogs.archiveLe),
      ),
    });
    if (!seance) return NextResponse.json({ error: "Séance introuvable" }, { status: 404 });
    if (seance.dureeMinutes !== null) {
      // Adapter une séance déjà terminée réécrirait un compte rendu.
      return NextResponse.json({ error: "Cette séance est terminée." }, { status: 409 });
    }

    const salle = await db.query.gyms.findFirst({
      where: and(eq(gyms.id, gymId), isNull(gyms.archiveLe)),
    });
    if (!salle) return NextResponse.json({ error: "Lieu introuvable ou archivé" }, { status: 404 });

    // --- La séance telle qu'elle est aujourd'hui ---
    const lignes = await db
      .select({
        planItemId: sessionPlanItems.id,
        instanceId: sessionPlanItems.exerciseInstanceId,
        origineInstanceId: sessionPlanItems.substitutionDeInstanceId,
        ordre: sessionPlanItems.ordre,
        seriesCibles: sessionPlanItems.seriesCibles,
        fourchetteRepsMin: sessionPlanItems.fourchetteRepsMin,
        fourchetteRepsMax: sessionPlanItems.fourchetteRepsMax,
        rpeCible: sessionPlanItems.rpeCible,
        reposSecondes: sessionPlanItems.reposSecondes,
        exerciceId: exercises.id,
        nom: exercises.nom,
        pilier: exercises.pilier,
        profilTension: exercises.profilTension,
        categorieRole: exercises.categorieRole,
        musclesPrincipaux: exercises.musclesPrincipaux,
      })
      .from(sessionPlanItems)
      .innerJoin(exerciseInstances, eq(exerciseInstances.id, sessionPlanItems.exerciseInstanceId))
      .innerJoin(exercises, eq(exercises.id, exerciseInstances.exerciseId))
      .where(eq(sessionPlanItems.sessionLogId, sessionLogId))
      .orderBy(asc(sessionPlanItems.ordre));

    if (lignes.length === 0) {
      return NextResponse.json({ error: "Cette séance n'a aucun exercice." }, { status: 409 });
    }

    // L'exercice d'origine d'une ligne déjà substituée, pour pouvoir le rendre
    // si le nouveau lieu le permet de nouveau.
    const idsOrigine = [...new Set(lignes.map((l) => l.origineInstanceId).filter((v): v is string => Boolean(v)))];
    const originesParInstance = new Map<string, string>(
      idsOrigine.length
        ? (
            await db.query.exerciseInstances.findMany({
              where: inArray(exerciseInstances.id, idsOrigine),
              columns: { id: true, exerciseId: true },
            })
          ).map((i) => [i.id, i.exerciseId])
        : [],
    );

    const enPlace: ExerciceEnPlace[] = lignes.map((l) => ({
      planItemId: l.planItemId,
      instanceId: l.instanceId,
      exerciceId: l.exerciceId,
      ordre: l.ordre,
      nom: l.nom,
      pilier: l.pilier,
      profilTension: l.profilTension,
      categorieRole: l.categorieRole,
      musclesPrincipaux: l.musclesPrincipaux ?? [],
      origineInstanceId: l.origineInstanceId,
      origineExerciceId: l.origineInstanceId ? originesParInstance.get(l.origineInstanceId) ?? null : null,
      seriesCibles: l.seriesCibles,
      fourchetteRepsMin: l.fourchetteRepsMin,
      fourchetteRepsMax: l.fourchetteRepsMax,
      rpeCible: l.rpeCible,
      reposSecondes: l.reposSecondes,
    }));

    // --- Ce que le lieu du jour permet, sac compris ---
    const [catalogue, instancesDuLieu] = await Promise.all([
      db.query.exercises.findMany(),
      db.query.exerciseInstances.findMany({
        where: and(eq(exerciseInstances.gymId, gymId), isNull(exerciseInstances.archiveLe)),
      }),
    ]);

    const ficheParExercice = new Map(catalogue.map((e) => [e.id, e]));
    const realisables = exercicesRealisables({
      catalogue: catalogue.map((e) => ({
        id: e.id,
        nom: e.nom,
        pilier: e.pilier,
        categorieRole: e.categorieRole,
        musclesPrincipaux: e.musclesPrincipaux ?? [],
        equipement: e.equipement,
        slug: e.slug,
      })),
      equipementsDuLieu: salle.equipementsDisponibles ?? [],
      equipementsApportes: materielApporte,
      instances: instancesDuLieu.map((i) => ({
        id: i.id,
        exerciseId: i.exerciseId,
        machineNom: i.machineNom,
        incrementsPossibles: i.incrementsPossibles ?? [],
      })),
    });

    const disponibles: CandidatDisponible[] = realisables.map((r) => {
      const fiche = ficheParExercice.get(r.exerciceId);
      return {
        exerciceId: r.exerciceId,
        instanceId: r.instanceId,
        nom: r.nom,
        pilier: r.pilier,
        profilTension: fiche?.profilTension ?? "",
        categorieRole: r.categorieRole,
        musclesPrincipaux: r.musclesPrincipaux,
        incrementsPossibles: r.incrementsPossibles,
      };
    });

    const adaptation = adapterSeance({ seance: enPlace, disponibles });

    // --- Les trois contrôles, avant toute écriture ---
    // Les entrées à créer n'ont pas encore d'identifiant : la validation lit
    // l'existant. On valide donc sur les seuls exercices déjà décrits, et on
    // signale ceux qui ne le sont pas encore plutôt que de les faire passer
    // pour validés.
    const seriesPrevues = enPlace.reduce((n, e) => n + e.seriesCibles, 0);
    const validation = await validerSeanceComplete({
      userId,
      gymId,
      exercices: adaptation.exercices
        .filter((x) => x.instanceId !== null)
        .map((x) => ({
          exerciseInstanceId: x.instanceId!,
          series: x.seriesCibles,
          repsMin: x.fourchetteRepsMin,
          repsMax: x.fourchetteRepsMax,
          reposSecondes: x.reposSecondes ?? 120,
          rirCible: x.rpeCible !== null ? 10 - x.rpeCible : null,
        })),
      seriesPrevues,
      // Le volume de la séance entière, remplaçants encore à créer compris.
      seriesApres: adaptation.exercices.reduce((n, x) => n + x.seriesCibles, 0),
    });

    const resume = {
      lieu: { id: salle.id, nom: salle.nom },
      materielApporte,
      conserves: adaptation.conserves,
      remplacements: adaptation.remplacements,
      retires: adaptation.retires,
      reconstructionConseillee: adaptation.reconstructionConseillee,
      motifReconstruction: adaptation.motifReconstruction,
      validation,
    };

    if (apercu) return NextResponse.json({ ...resume, applique: false });

    // --- Écriture ---
    const aRetirer = adaptation.retires.map((r) => r.planItemId);
    const parPlanItem = new Map(enPlace.map((e) => [e.planItemId, e]));

    await db.transaction(async (tx) => {
      const materialisees = new Map<string, string>();

      for (const x of adaptation.exercices) {
        let instanceId = x.instanceId;
        if (!instanceId) {
          // Le remplaçant est déduit du matériel : son entrée est créée au
          // moment où elle sert, pas d'avance pour tout le catalogue.
          const deja = materialisees.get(x.exerciceId);
          if (deja) {
            instanceId = deja;
          } else {
            const fiche = ficheParExercice.get(x.exerciceId);
            const [creee] = await tx
              .insert(exerciseInstances)
              .values({
                userId,
                exerciseId: x.exerciceId,
                gymId,
                machineNom: x.nom,
                conventionCharge:
                  fiche?.equipement === "machine" || fiche?.equipement === "poulie"
                    ? "pile_affichee"
                    : "poids_total",
                incrementsPossibles: incrementsParDefaut(fiche?.equipement ?? null),
                notesMachine: "Déduit du matériel disponible — à préciser sur place.",
              })
              .returning();
            if (!creee) throw new Error("Création de l'exercice de salle impossible");
            instanceId = creee.id;
            materialisees.set(x.exerciceId, instanceId);
          }
        }

        const avant = parPlanItem.get(x.planItemId)!;
        // Rendre l'exercice d'origine efface la substitution au lieu d'en
        // empiler une nouvelle : la ligne redevient ce qu'elle devait être.
        const retourALOrigine = avant.origineExerciceId === x.exerciceId;
        await tx
          .update(sessionPlanItems)
          .set({
            exerciseInstanceId: instanceId,
            // La trace du remplacement vit sur la ligne : l'écran de séance la
            // lit déjà et l'affiche, sans code supplémentaire.
            substitutionDeInstanceId:
              x.niveau === "conserve" || retourALOrigine
                ? null
                : avant.origineInstanceId ?? avant.instanceId,
            raisonSubstitution:
              x.niveau === "conserve" || retourALOrigine
                ? null
                : `${avant.nom} indisponible à ${salle.nom} — ${
                    adaptation.remplacements.find((r) => r.planItemId === x.planItemId)?.raison ?? ""
                  }`,
          })
          .where(eq(sessionPlanItems.id, x.planItemId));
      }

      if (aRetirer.length > 0) {
        await tx.delete(sessionPlanItems).where(inArray(sessionPlanItems.id, aRetirer));
      }

      await tx
        .update(sessionLogs)
        .set({ gymId, updatedAt: new Date() })
        .where(eq(sessionLogs.id, sessionLogId));

      // Le matériel du jour suit le lieu : il vaut pour cette date.
      await tx
        .update(dailyStates)
        .set({ materielApporte, gymId })
        .where(and(eq(dailyStates.userId, userId), eq(dailyStates.date, seance.date)));
    });

    return NextResponse.json({ ...resume, applique: true });
  } catch (error) {
    const detail = detailErreur(error);
    console.error("[api/seance-du-jour/adapter]", detail, error);
    return NextResponse.json({ error: `Adaptation de la séance : ${detail}` }, { status: 500 });
  }
}
