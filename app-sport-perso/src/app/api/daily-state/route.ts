// @ts-nocheck
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { dailyStates } from "@/db/schema";
import { MOCK_USER_ID } from "@/lib/constants";
import { eq, and } from "drizzle-orm";
import { dailyStateSchema } from "@/lib/validators/daily-state";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");

  if (!date) {
    return NextResponse.json({ error: "date required" }, { status: 400 });
  }

  const state = await db.query.dailyStates.findFirst({
    where: and(
      eq(dailyStates.userId, MOCK_USER_ID),
      eq(dailyStates.date, date),
    ),
  });

  return NextResponse.json(state || null);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = dailyStateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid data", details: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;

    // Upsert on (userId, date) unique constraint
    const existing = await db.query.dailyStates.findFirst({
      where: and(
        eq(dailyStates.userId, MOCK_USER_ID),
        eq(dailyStates.date, data.date),
      ),
    });

    if (existing) {
      const [updated] = await db.update(dailyStates)
        .set({
          sommeilHeures: data.sommeilHeures,
          jeuneBool: data.jeuneBool,
          shiftRecentBool: data.shiftRecentBool,
          shiftType: data.shiftType,
          energieDepart: data.energieDepart,
          courbatures: data.courbatures,
          dernierRepasHeure: data.dernierRepasHeure ?? null,
          horaireSeancePrevu: data.horaireSeancePrevu ?? null,
          updatedAt: new Date(),
        })
        .where(eq(dailyStates.id, existing.id))
        .returning();
      return NextResponse.json(updated);
    } else {
      const [created] = await db.insert(dailyStates).values({
        userId: MOCK_USER_ID,
        date: data.date,
        sommeilHeures: data.sommeilHeures,
        jeuneBool: data.jeuneBool,
        shiftRecentBool: data.shiftRecentBool,
        shiftType: data.shiftType,
        energieDepart: data.energieDepart,
        courbatures: data.courbatures,
        dernierRepasHeure: data.dernierRepasHeure ?? null,
        horaireSeancePrevu: data.horaireSeancePrevu ?? null,
      }).returning();
      return NextResponse.json(created, { status: 201 });
    }
  } catch (error) {
    return NextResponse.json({ error: "Failed to save daily state" }, { status: 500 });
  }
}
