import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { exercises } from "@/db/schema";
import { MOCK_USER_ID } from "@/lib/constants";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const allExercises = await db.query.exercises.findMany({
      where: eq(exercises.userId, MOCK_USER_ID),
    });
    return NextResponse.json(allExercises);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch exercises" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { nom, pilier, profilTension, type, categorieRole, musclesPrincipaux } = body;

    const [newExercise] = await db.insert(exercises).values({
      userId: MOCK_USER_ID,
      nom,
      pilier,
      profilTension,
      type,
      categorieRole,
      musclesPrincipaux: musclesPrincipaux || [],
    }).returning();

    return NextResponse.json(newExercise, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create exercise" }, { status: 500 });
  }
}
