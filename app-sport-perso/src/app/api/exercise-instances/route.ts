import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { exerciseInstances } from "@/db/schema";
import { MOCK_USER_ID } from "@/lib/constants";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const allInstances = await db.query.exerciseInstances.findMany({
      where: eq(exerciseInstances.userId, MOCK_USER_ID),
      with: { exercise: true, gym: true },
    });
    return NextResponse.json(allInstances);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch instances" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      exerciseId, gymId, machineNom, typePoulie, conventionCharge,
      incrementsPossibles, poidsNonCompte, notesMachine
    } = body;

    const [newInstance] = await db.insert(exerciseInstances).values({
      userId: MOCK_USER_ID,
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
