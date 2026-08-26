import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { gyms } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const allGyms = await db.query.gyms.findMany({
      where: eq(gyms.userId, userId),
    });
    return NextResponse.json(allGyms);
  } catch (error) {
    // Message constant auparavant : toute panne se presentait de la meme facon
    // et le client n'avait aucun moyen de dire ce qui avait casse.
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[api/gyms]", detail, error);
    return NextResponse.json({ error: `Lecture des salles : ${detail}` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { nom, horairesOuverture, est24h, notes } = body;

    const [newGym] = await db.insert(gyms).values({
      userId,
      nom,
      horairesOuverture: horairesOuverture || null,
      est24h: est24h || false,
      notes: notes || null,
    }).returning();

    return NextResponse.json(newGym, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create gym" }, { status: 500 });
  }
}
