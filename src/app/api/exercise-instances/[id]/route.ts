import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { exerciseInstances } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { majMachineSchema } from "@/lib/validators/exercise-instance";

/**
 * Une machine décrit un objet physique posé dans une salle commune, pas la
 * propriété de quelqu'un. Les salles se comportent déjà ainsi : n'importe quel
 * compte authentifié peut les lire, les corriger et les retirer. Exiger ici la
 * propriété rendait le parc invisible au deuxième compte, qui devait re-saisir
 * des machines déjà renseignées — alors que le constructeur de séance, lui,
 * lisait déjà tout le parc sans filtre.
 *
 * Ce qui reste protégé est ce qui appartient réellement à une personne : ses
 * séances, ses séries, ses charges, ses conversations.
 */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const instance = await db.query.exerciseInstances.findFirst({
      where: eq(exerciseInstances.id, id),
      with: { exercise: true, gym: true },
    });
    if (!instance) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(instance);
  } catch (error) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
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
    // Auparavant `.set({ ...body })` : n'importe quelle colonne etait modifiable
    // depuis le client, y compris userId, gymId et id.
    const parsed = majMachineSchema.safeParse(await request.json());
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

    const [updated] = await db.update(exerciseInstances)
      .set({ ...champs, updatedAt: new Date() })
      .where(eq(exerciseInstances.id, id))
      .returning();
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[exercise-instances PATCH] error:", error);
    return NextResponse.json({ error: "Mise à jour impossible" }, { status: 500 });
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
    await db.delete(exerciseInstances).where(eq(exerciseInstances.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
