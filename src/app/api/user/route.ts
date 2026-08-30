import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { MUSCLES } from "@/lib/referentiels/muscles";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { OBJECTIFS } from "@/lib/validators/onboarding";
import { MATERIEL_PORTABLE } from "@/lib/referentiels/capacites";
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

const profilSchema = z.object({
  nom: z.string().trim().min(1).max(80).nullable().optional(),
  dateNaissance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  taille: z.number().int().min(100).max(250).nullable().optional(),
  phaseNutritionnelle: z.enum(["seche", "prise_de_masse", "maintien"]).nullable().optional(),
  objectifType: z.enum(OBJECTIFS).nullable().optional(),
  objectifMusclesPrioritaires: z.array(z.enum(MUSCLES)).max(4).nullable().optional(),
  objectifChiffre: z.string().trim().max(200).nullable().optional(),
  dateCible: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  frequenceCibleParSemaine: z.number().int().min(1).max(14).nullable().optional(),
  dureeSeanceCibleMinutes: z.number().int().min(15).max(240).nullable().optional(),
  materielPersonnelHabituel: z.array(z.enum(MATERIEL_PORTABLE)).max(MATERIEL_PORTABLE.length).nullable().optional(),
});

/**
 * Met a jour le profil. Cette route n'existait pas : le profil etait pose par le
 * script de seed et aucun ecran ne permettait de le modifier.
 */
export async function PATCH(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = profilSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Seules les cles reellement transmises sont ecrites : un champ absent du corps
  // ne doit pas effacer la valeur existante.
  const champs = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined),
  );

  if (Object.keys(champs).length === 0) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
  }

  const [user] = await db
    .update(users)
    .set({ ...champs, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();

  if (!user) return NextResponse.json({ error: "Profil introuvable" }, { status: 404 });
  return NextResponse.json({ user });
}
