import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { exerciseInstances } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";

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

    const body = await request.json();
    const {
      exerciseId, gymId, machineNom, typePoulie, conventionCharge,
      incrementsPossibles, poidsNonCompte, notesMachine
    } = body;

    const [newInstance] = await db.insert(exerciseInstances).values({
      userId,
      exerciseId,
      gymId,
      machineNom,
      typePoulie: typePoulie || "na",
      conventionCharge,
      incrementsPossibles,
      poidsNonCompte: poidsNonCompte || null,
      notesMachine: notesMachine || null,
    }).returning();

    return NextResponse.json(newInstance, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create instance" }, { status: 500 });
  }
}
