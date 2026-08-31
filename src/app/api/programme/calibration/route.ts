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
import { machinesUtilisablesAujourdhui } from "@/db/archivage";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { contraintesActives } from "@/services/contraintes";
import { musclesSousContrainte } from "@/lib/engine/contraintes";
import { detailErreur } from "@/lib/erreurs";
import { planCalibration, type MachineDisponible } from "@/lib/engine/plan-calibration";
import { exercicesRealisables } from "@/lib/engine/disponibilite";

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

    // Ce que le lieu permet de faire : les appareils décrits, et tout exercice
    // dont le besoin est couvert par le matériel déclaré sur place. Exiger une
    // ligne par exercice obligeait à saisir à la main jusqu'aux pompes.
    const [catalogue, instancesDuLieu] = await Promise.all([
      db.query.exercises.findMany(),
      db.query.exerciseInstances.findMany({
        where: and(eq(exerciseInstances.gymId, salleId), machinesUtilisablesAujourdhui()),
      }),
    ]);

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
      instances: instancesDuLieu.map((i) => ({
        id: i.id,
        exerciseId: i.exerciseId,
        machineNom: i.machineNom,
        incrementsPossibles: i.incrementsPossibles ?? [],
      })),
    });

    const machines: MachineDisponible[] = realisables.map((r) => ({
      instanceId: r.instanceId ?? `a-creer:${r.exerciceId}`,
      exerciceId: r.exerciceId,
      nom: r.nom,
      pilier: r.pilier,
      categorieRole: r.categorieRole,
      musclesPrincipaux: r.musclesPrincipaux,
      equipement: r.equipement,
    }));
    const aCreer = new Map(realisables.filter((r) => !r.instanceId).map((r) => [r.exerciceId, r]));

    const aujourdhui = new Date().toISOString().slice(0, 10);
    const zonesSensibles = await contraintesActives(userId, db, aujourdhui);

    const plan = planCalibration({
      machines,
      frequenceCibleParSemaine: profil?.frequenceCibleParSemaine ?? 3,
      dureeSeanceCibleMinutes: profil?.dureeSeanceCibleMinutes ?? 60,
      musclesPrioritaires: profil?.objectifMusclesPrioritaires ?? [],
      exercicesRefuses: profil?.exercicesRefuses ?? [],
      preferenceMateriel: profil?.preferenceMateriel ?? undefined,
      // Une contrainte sévère écarte le muscle ; une gêne légère ne justifie pas
      // de ne jamais le mesurer.
      // Le seuil vivait ici en clair, à 6, quand les deux autres lectures
      // utilisaient 7 : la calibration écartait une zone que le validateur de
      // séance acceptait. C'était une divergence, pas une règle — elle
      // contredisait même le commentaire qui l'accompagnait. Un seul seuil
      // désormais, celui du moteur.
      musclesSensibles: musclesSousContrainte(zonesSensibles, aujourdhui),
    });

    // Rien n'a encore été dit de ce lieu : construire une séance de pompes pour
    // quelqu'un debout dans une salle équipée serait pire que poser la question.
    const lieuRenseigne = salle.equipementsDisponibles !== null || instancesDuLieu.length > 0;
    if (!lieuRenseigne) {
      return NextResponse.json(
        {
          error: "Cette salle n'est pas encore décrite. Dis-moi ce qu'on y trouve.",
          avertissements: [],
        },
        { status: 409 },
      );
    }

    if (plan.seances.length === 0) {
      return NextResponse.json(
        { error: plan.avertissements[0] ?? "Rien à programmer dans cette salle.", avertissements: plan.avertissements },
        { status: 409 },
      );
    }

    // Une seule transaction : un bloc avec deux séances sur trois serait un
    // programme que personne n'a voulu.
    const creees = await db.transaction(async (tx) => {
      /**
       * Un exercice seulement déduit n'a pas encore d'appareil décrit, et
       * `exercise_in_template` en exige un. On le matérialise au moment où il
       * est réellement programmé, avec des incréments plausibles pour son type
       * de matériel — la première correction sur place les remplacera.
       *
       * Le faire à l'avance pour tout le catalogue créerait des centaines de
       * lignes que personne n'a demandées.
       */
      const materialisees = new Map<string, string>();
      const instancePour = async (reference: string): Promise<string> => {
        if (!reference.startsWith("a-creer:")) return reference;
        const exerciceId = reference.slice("a-creer:".length);
        const deja = materialisees.get(exerciceId);
        if (deja) return deja;

        const r = aCreer.get(exerciceId)!;
        const [creee] = await tx
          .insert(exerciseInstances)
          .values({
            userId,
            exerciseId: exerciceId,
            gymId: salleId,
            machineNom: r.nom,
            conventionCharge: r.equipement === "machine" || r.equipement === "poulie"
              ? "pile_affichee"
              : "poids_total",
            incrementsPossibles: r.incrementsPossibles,
            notesMachine: "Déduit du matériel de la salle — à préciser sur place.",
          })
          .returning();
        if (!creee) throw new Error("Création de l'exercice de salle impossible");
        materialisees.set(exerciceId, creee.id);
        return creee.id;
      };

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
          const lignes = [];
          for (const ex of s.exercices) {
            lignes.push({
              seanceTemplateId: template.id,
              exerciseInstanceId: await instancePour(ex.instanceId),
              ordre: ex.ordre,
              seriesCibles: ex.seriesCibles,
              fourchetteRepsMin: ex.fourchetteRepsMin,
              fourchetteRepsMax: ex.fourchetteRepsMax,
              rpeCible: ex.rpeCible,
              reposSecondes: ex.reposSecondes,
            });
          }
          await tx.insert(exerciseInTemplate).values(lignes);
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
