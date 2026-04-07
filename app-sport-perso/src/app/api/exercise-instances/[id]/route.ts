import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { exerciseInstances } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const instance = await db.query.exerciseInstances.findFirst({
      where: and(eq(exerciseInstances.id, id)),
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
  const { id } = await params;
  try {
    const body = await request.json();
    const [updated] = await db.update(exerciseInstances)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(exerciseInstances.id, id))
      .returning();
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await db.delete(exerciseInstances).where(eq(exerciseInstances.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
