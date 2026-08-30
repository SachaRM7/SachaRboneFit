import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { gyms, exerciseInstances } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { peutGererLaSalle, REFUS_GESTION_SALLE } from "@/lib/autorisations";
import { majSalleSchema } from "@/lib/validators/salle";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const gym = await db.query.gyms.findFirst({
      where: eq(gyms.id, id),
    });
    if (!gym) return NextResponse.json({ error: "Gym not found" }, { status: 404 });
    return NextResponse.json(gym);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch gym" }, { status: 500 });
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
    // `.set({ ...body })` acceptait n'importe quelle colonne depuis le client,
    // `userId` compris : n'importe qui pouvait se réattribuer une salle.
    const parsed = majSalleSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const champs = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined),
    );
    if (Object.keys(champs).length === 0) {
      return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
    }

    const salle = await db.query.gyms.findFirst({ where: eq(gyms.id, id) });
    if (!salle) return NextResponse.json({ error: "Gym not found" }, { status: 404 });
    if (!peutGererLaSalle(salle, userId)) {
      return NextResponse.json({ error: REFUS_GESTION_SALLE }, { status: 403 });
    }

    const [updated] = await db.update(gyms)
      .set({ ...champs, updatedAt: new Date() })
      .where(eq(gyms.id, id))
      .returning();
    if (!updated) return NextResponse.json({ error: "Gym not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: "Failed to update gym" }, { status: 500 });
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
    const salle = await db.query.gyms.findFirst({ where: eq(gyms.id, id) });
    if (!salle) return NextResponse.json({ error: "Gym not found" }, { status: 404 });
    if (!peutGererLaSalle(salle, userId)) {
      return NextResponse.json({ error: REFUS_GESTION_SALLE }, { status: 403 });
    }

    // Le filtre portait sur `gyms.id` dans une requête sur `exercise_instances` :
    // il ne désignait pas la colonne attendue, et le garde ne gardait rien.
    const instances = await db.query.exerciseInstances.findMany({
      where: eq(exerciseInstances.gymId, id),
      limit: 1,
    });
    if (instances.length > 0) {
      return NextResponse.json(
        { error: "Impossible de supprimer : cette salle a des instances d'exercices liées" },
        { status: 400 }
      );
    }
    await db.delete(gyms).where(eq(gyms.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete gym" }, { status: 500 });
  }
}
