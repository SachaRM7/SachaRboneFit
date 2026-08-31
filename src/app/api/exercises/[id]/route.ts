import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { exercises, exerciseInstances } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";

/**
 * Une fiche d'exercice.
 *
 * `exercises.user_id` vaut `null` pour la bibliothèque commune et porte un
 * identifiant pour les entrées créées à la main. Cette route ignorait
 * complètement la distinction : authentifiée, elle laissait n'importe quel
 * compte modifier ou supprimer n'importe quelle fiche — y compris celles de la
 * bibliothèque partagée, et celles d'un autre athlète.
 *
 * La règle appliquée est celle que le reste de l'application énonce déjà
 * (`nommerEntite`, dans le contexte du coach) : une fiche commune se lit par
 * tous, une fiche personnelle par son auteur, et l'écriture n'appartient qu'à
 * l'auteur. La bibliothèque commune ne s'édite pas depuis l'application : elle
 * est partagée, et une correction faite par un compte s'imposerait à tous.
 */

const REFUS = "Cette fiche ne t'appartient pas.";

type Fiche = { userId: string | null } | undefined;

/** Lisible par son auteur, et par tous si elle est commune. */
function peutLire(fiche: Fiche, userId: string): boolean {
  return fiche !== undefined && (fiche.userId === null || fiche.userId === userId);
}

/** Modifiable par son seul auteur : la bibliothèque commune n'a pas d'auteur. */
function peutEcrire(fiche: Fiche, userId: string): boolean {
  return fiche !== undefined && fiche.userId === userId;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const exercise = await db.query.exercises.findFirst({
      where: eq(exercises.id, id),
    });
    // Une fiche d'autrui répond comme une fiche absente : dire « elle existe
    // mais elle n'est pas à toi » révélerait déjà quelque chose.
    if (!peutLire(exercise, userId)) {
      return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
    }

    const instances = await db.query.exerciseInstances.findMany({
      where: eq(exerciseInstances.exerciseId, id),
      with: { gym: true },
    });

    return NextResponse.json({ ...exercise, instances });
  } catch (error) {
    console.error("[exercises GET]", error);
    return NextResponse.json({ error: "Failed to fetch exercise" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const fiche = await db.query.exercises.findFirst({ where: eq(exercises.id, id) });
    if (!peutLire(fiche, userId)) {
      return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
    }
    if (!peutEcrire(fiche, userId)) {
      return NextResponse.json({ error: REFUS }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;

    // Le corps était recopié tel quel : `user_id`, `id` et `slug` compris. Se
    // réattribuer la fiche de quelqu'un d'autre tenait dans un champ.
    const champs = {
      nom: typeof body.nom === "string" ? body.nom : undefined,
      pilier: typeof body.pilier === "string" ? body.pilier : undefined,
      profilTension: typeof body.profilTension === "string" ? body.profilTension : undefined,
      type: typeof body.type === "string" ? body.type : undefined,
      categorieRole: typeof body.categorieRole === "string" ? body.categorieRole : undefined,
      equipement: typeof body.equipement === "string" ? body.equipement : undefined,
      musclesPrincipaux: Array.isArray(body.musclesPrincipaux)
        ? body.musclesPrincipaux.filter((m): m is string => typeof m === "string")
        : undefined,
      musclesSecondaires: Array.isArray(body.musclesSecondaires)
        ? body.musclesSecondaires.filter((m): m is string => typeof m === "string")
        : undefined,
    };
    const aEcrire = Object.fromEntries(
      Object.entries(champs).filter(([, v]) => v !== undefined),
    );
    if (Object.keys(aEcrire).length === 0) {
      return NextResponse.json({ error: "Aucun champ modifiable fourni" }, { status: 400 });
    }

    const [updated] = await db.update(exercises)
      .set({ ...aEcrire, updatedAt: new Date() })
      .where(eq(exercises.id, id))
      .returning();
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[exercises PATCH]", error);
    return NextResponse.json({ error: "Failed to update exercise" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const fiche = await db.query.exercises.findFirst({ where: eq(exercises.id, id) });
    if (!peutLire(fiche, userId)) {
      return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
    }
    if (!peutEcrire(fiche, userId)) {
      return NextResponse.json({ error: REFUS }, { status: 403 });
    }

    // Une fiche équipée quelque part est citée par des instances, qui le sont
    // elles-mêmes par des séances : la clé étrangère refuserait, en 500. On le
    // dit plutôt que de le subir.
    const equipee = await db.query.exerciseInstances.findMany({
      where: eq(exerciseInstances.exerciseId, id),
      limit: 1,
    });
    if (equipee.length > 0) {
      return NextResponse.json(
        { error: "Cet exercice est installé sur au moins une machine. Retire-la d'abord." },
        { status: 409 },
      );
    }

    await db.delete(exercises).where(eq(exercises.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[exercises DELETE]", error);
    return NextResponse.json({ error: "Failed to delete exercise" }, { status: 500 });
  }
}
