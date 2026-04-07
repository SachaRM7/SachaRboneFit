import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { exercises, exerciseInstances } from "@/db/schema";
import { MOCK_USER_ID } from "@/lib/constants";
import { eq, and } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const exercise = await db.query.exercises.findFirst({
      where: and(eq(exercises.id, id), eq(exercises.userId, MOCK_USER_ID)),
    });
    if (!exercise) return NextResponse.json({ error: "Exercise not found" }, { status: 404 });

    const instances = await db.query.exerciseInstances.findMany({
      where: eq(exerciseInstances.exerciseId, id),
      with: { gym: true },
    });

    return NextResponse.json({ ...exercise, instances });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch exercise" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const [updated] = await db.update(exercises)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(exercises.id, id), eq(exercises.userId, MOCK_USER_ID)))
      .returning();
    if (!updated) return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: "Failed to update exercise" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await db.delete(exercises).where(and(eq(exercises.id, id), eq(exercises.userId, MOCK_USER_ID)));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete exercise" }, { status: 500 });
  }
}
