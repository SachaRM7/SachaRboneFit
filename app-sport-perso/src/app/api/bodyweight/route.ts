import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { bodyWeights } from "@/db/schema";
import { MOCK_USER_ID } from "@/lib/constants";
import { eq, and } from "drizzle-orm";

export async function GET() {
  try {
    const weights = await db.query.bodyWeights.findMany({
      where: eq(bodyWeights.userId, MOCK_USER_ID),
      orderBy: (bw, { desc }) => [desc(bw.date)],
    });
    return NextResponse.json(weights);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch weights" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { date, poids, notes } = body;

    // Upsert on (userId, date)
    const existing = await db.query.bodyWeights.findFirst({
      where: and(eq(bodyWeights.userId, MOCK_USER_ID), eq(bodyWeights.date, date)),
    });

    if (existing) {
      const [updated] = await db.update(bodyWeights)
        .set({ poids, notes: notes || null, updatedAt: new Date() })
        .where(eq(bodyWeights.id, existing.id))
        .returning();
      return NextResponse.json(updated);
    }

    const [newWeight] = await db.insert(bodyWeights).values({
      userId: MOCK_USER_ID,
      date,
      poids,
      notes: notes || null,
    }).returning();

    return NextResponse.json(newWeight, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to save weight" }, { status: 500 });
  }
}
