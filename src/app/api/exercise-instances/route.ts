import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { exerciseInstances, exercises } from "@/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { creationMachineSchema } from "@/lib/validators/exercise-instance";
import { peutGererLaSalle, REFUS_GESTION_SALLE } from "@/lib/autorisations";

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const gymId = searchParams.get("gymId");

    /**
     * Recherche par identifiants, avec le nom de l'exercice.
     *
     * L'écran de fin de séance n'a que des identifiants d'instances, et le
     * seul moyen d'obtenir leurs noms était deux requêtes PAR exercice depuis
     * le navigateur — qui retombaient sur le littéral « Exercice » au moindre
     * échec. Une requête suffit pour tout le lot.
     */
    const ids = searchParams.get("ids");
    if (ids !== null) {
      const demandes = [...new Set(ids.split(",").map((s) => s.trim()).filter(Boolean))];
      if (demandes.length === 0) return NextResponse.json([]);

      const lignes = await db
        .select({
          id: exerciseInstances.id,
          exerciseId: exerciseInstances.exerciseId,
          gymId: exerciseInstances.gymId,
          machineNom: exerciseInstances.machineNom,
          nom: exercises.nom,
          pilier: exercises.pilier,
        })
        .from(exerciseInstances)
        .innerJoin(exercises, eq(exercises.id, exerciseInstances.exerciseId))
        .where(and(inArray(exerciseInstances.id, demandes), isNull(exerciseInstances.archiveLe)));

      return NextResponse.json(lignes);
    }

    /*
     * Le parc d'une salle, AVEC ce qui décrit le mouvement.
     *
     * La lecture ne rendait que les colonnes d'`exercise_instances` : ni nom,
     * ni pilier, ni profil de tension — ceux-là vivent sur `exercises`. Or
     * c'est exactement ce que lit le moteur de substitution, qui compare
     * `inst.pilier` au pilier demandé. Sur des lignes où `pilier` valait
     * `undefined`, le filtre écartait TOUT : « machine occupée » ne pouvait
     * proposer aucun remplaçant, quelle que soit la salle.
     *
     * Le parc reste commun à tous les comptes, comme la salle elle-même :
     * filtrer par propriétaire obligeait un deuxième compte à re-saisir des
     * machines déjà renseignées. Les machines archivées restent écartées.
     */
    const allInstances = await db
      .select({
        id: exerciseInstances.id,
        gymId: exerciseInstances.gymId,
        exerciseId: exerciseInstances.exerciseId,
        machineNom: exerciseInstances.machineNom,
        etat: exerciseInstances.etat,
        conventionCharge: exerciseInstances.conventionCharge,
        natureCharge: exerciseInstances.natureCharge,
        incrementsPossibles: exerciseInstances.incrementsPossibles,
        poidsNonCompte: exerciseInstances.poidsNonCompte,
        nom: exercises.nom,
        slug: exercises.slug,
        pilier: exercises.pilier,
        profilTension: exercises.profilTension,
        categorieRole: exercises.categorieRole,
        type: exercises.type,
        musclesPrincipaux: exercises.musclesPrincipaux,
      })
      .from(exerciseInstances)
      .innerJoin(exercises, eq(exercises.id, exerciseInstances.exerciseId))
      .where(
        gymId
          ? and(eq(exerciseInstances.gymId, gymId), isNull(exerciseInstances.archiveLe))
          : isNull(exerciseInstances.archiveLe),
      );

    return NextResponse.json(
      allInstances.map((i) => ({ ...i, musclesPrincipaux: i.musclesPrincipaux ?? [] })),
    );
  } catch (error) {
    console.error("[exercise-instances GET] error:", error);
    return NextResponse.json({ error: "Failed to fetch instances", details: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = creationMachineSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // La bibliotheque et les salles sont communes : exiger qu'elles
    // appartiennent a l'appelant aurait rendu toute creation impossible, le
    // catalogue partage n'ayant plus de proprietaire. Ce qui doit etre verifie
    // est qu'elles existent, et qu'une salle quittee ne recoive plus de
    // machines.
    const [exercice, salle] = await Promise.all([
      db.query.exercises.findFirst({
        where: (e, { eq }) => eq(e.id, parsed.data.exerciseId),
      }),
      db.query.gyms.findFirst({
        where: (g, { and, eq, isNull }) => and(eq(g.id, parsed.data.gymId), isNull(g.archiveLe)),
      }),
    ]);
    if (!exercice) return NextResponse.json({ error: "Exercice introuvable" }, { status: 404 });
    if (!salle) return NextResponse.json({ error: "Salle introuvable ou archivée" }, { status: 404 });
    if (!peutGererLaSalle(salle, userId)) {
      return NextResponse.json({ error: REFUS_GESTION_SALLE }, { status: 403 });
    }

    const [instance] = await db.insert(exerciseInstances).values({
      userId,
      exerciseId: parsed.data.exerciseId,
      gymId: parsed.data.gymId,
      // Sans nom sur place — une barre, une barre de traction —, celui de
      // l'exercice suffit a s'y retrouver en salle.
      machineNom: parsed.data.machineNom?.trim() || exercice.nom,
      typePoulie: parsed.data.typePoulie,
      conventionCharge: parsed.data.conventionCharge,
      incrementsPossibles: parsed.data.incrementsPossibles,
      poidsNonCompte: parsed.data.poidsNonCompte ?? null,
      chargeMax: parsed.data.chargeMax ?? null,
      notesMachine: parsed.data.notesMachine ?? null,
    }).returning();

    return NextResponse.json(instance, { status: 201 });
  } catch (error) {
    console.error("[exercise-instances POST] error:", error);
    return NextResponse.json({ error: "Création impossible" }, { status: 500 });
  }
}
