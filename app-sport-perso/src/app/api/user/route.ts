import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, userId),
  });

  return NextResponse.json({ user });
}

export async function POST(request: Request) {
  const { id, email, nom } = await request.json();

  if (!id || !email) {
    return NextResponse.json({ error: "id and email are required" }, { status: 400 });
  }

  // Check if user already exists
  const existing = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, id),
  });

  if (existing) {
    return NextResponse.json({ user: existing });
  }

  const [user] = await db
    .insert(users)
    .values({
      id,
      email,
      nom: nom || email.split("@")[0],
    })
    .returning();

  return NextResponse.json({ user }, { status: 201 });
}
