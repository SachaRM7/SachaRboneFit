import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { exerciseInstances } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { creationMachineSchema } from "@/lib/validators/exercise-instance";

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const gymId = searchParams.get("gymId");

    let allInstances;
    if (gymId) {
      allInstances = await db.query.exerciseInstances.findMany({
        where: (ei, { and, eq }) => and(eq(ei.userId, userId), eq(ei.gymId, gymId)),
      });
    } else {
      allInstances = await db.query.exerciseInstances.findMany({
        where: (ei, { eq }) => eq(ei.userId, userId),
      });
    }
    return NextResponse.json(allInstances);
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

    // L'exercice et la salle doivent appartenir a l'utilisateur : sans ces
    // verifications, on pouvait rattacher une machine au parc d'un autre compte.
    const [exercice, salle] = await Promise.all([
      db.query.exercises.findFirst({
        where: (e, { and, eq }) => and(eq(e.id, parsed.data.exerciseId), eq(e.userId, userId)),
      }),
      db.query.gyms.findFirst({
        where: (g, { and, eq }) => and(eq(g.id, parsed.data.gymId), eq(g.userId, userId)),
      }),
    ]);
    if (!exercice) return NextResponse.json({ error: "Exercice introuvable" }, { status: 404 });
    if (!salle) return NextResponse.json({ error: "Salle introuvable" }, { status: 404 });

    const [instance] = await db.insert(exerciseInstances).values({
      userId,
      exerciseId: parsed.data.exerciseId,
      gymId: parsed.data.gymId,
      machineNom: parsed.data.machineNom,
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
