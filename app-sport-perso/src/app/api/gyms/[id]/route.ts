import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { gyms } from "@/db/schema";
import { MOCK_USER_ID } from "@/lib/constants";
import { eq, and } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const gym = await db.query.gyms.findFirst({
      where: and(eq(gyms.id, id), eq(gyms.userId, MOCK_USER_ID)),
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
  const { id } = await params;
  try {
    const body = await request.json();
    const [updated] = await db.update(gyms)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(gyms.id, id), eq(gyms.userId, MOCK_USER_ID)))
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
  const { id } = await params;
  try {
    // Check if gym has exercise instances
    const instances = await db.query.exerciseInstances.findMany({
      where: eq(gyms.id, id),
      limit: 1,
    });
    if (instances.length > 0) {
      return NextResponse.json(
        { error: "Impossible de supprimer : cette salle a des instances d'exercices liées" },
        { status: 400 }
      );
    }
    await db.delete(gyms).where(and(eq(gyms.id, id), eq(gyms.userId, MOCK_USER_ID)));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete gym" }, { status: 500 });
  }
}
