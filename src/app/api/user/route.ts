import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { createClient } from "@/lib/supabase/server";

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
  // Cree la ligne applicative users apres inscription Supabase.
  // L'identite vient de la session authentifiee, jamais du corps de la requete :
  // avant, cette route etait ouverte et acceptait un id et un email arbitraires.
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let nom: string | undefined;
  try {
    const body = await request.json();
    nom = typeof body?.nom === "string" ? body.nom.trim() : undefined;
  } catch {
    // corps absent ou invalide : on se rabat sur les metadonnees Supabase
  }

  const existing = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, authUser.id),
  });

  if (existing) {
    return NextResponse.json({ user: existing });
  }

  const email = authUser.email;
  if (!email) {
    return NextResponse.json({ error: "Compte sans adresse email" }, { status: 400 });
  }

  const [user] = await db
    .insert(users)
    .values({
      id: authUser.id,
      email,
      nom: nom || (authUser.user_metadata?.nom as string | undefined) || email.split("@")[0],
    })
    .returning();

  return NextResponse.json({ user }, { status: 201 });
}
