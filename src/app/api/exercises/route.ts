import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { exercises } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const allExercises = await db.query.exercises.findMany({
    });
    return NextResponse.json(allExercises);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch exercises" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { nom, pilier, profilTension, type, categorieRole, musclesPrincipaux } = body;

    const [newExercise] = await db.insert(exercises).values({
      userId,
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
