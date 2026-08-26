import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { creerSeanceTemplate, ajouterExerciceAuTemplate, RessourceIntrouvable } from "@/services/programmes";

const seanceSchema = z.object({
  blocId: z.string().uuid(),
  lettre: z.string().trim().min(1).max(3),
  nom: z.string().trim().min(1).max(120),
});

const exerciceSchema = z.object({
  seanceTemplateId: z.string().uuid(),
  exerciseInstanceId: z.string().uuid(),
  seriesCibles: z.number().int().min(1).max(12),
  fourchetteRepsMin: z.number().int().min(1).max(50),
  fourchetteRepsMax: z.number().int().min(1).max(50),
  rpeCible: z.number().min(1).max(10).nullable().optional(),
  tempo: z.string().trim().max(10).nullable().optional(),
  reposSecondes: z.number().int().min(0).max(900).nullable().optional(),
  notes: z.string().trim().max(300).nullable().optional(),
});

/** Crée une séance, ou y ajoute un exercice selon la forme du corps reçu. */
export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const corps = await request.json();

  try {
    if ("seanceTemplateId" in corps) {
      const parsed = exerciceSchema.safeParse(corps);
      if (!parsed.success) {
        return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
      }
      if (parsed.data.fourchetteRepsMin > parsed.data.fourchetteRepsMax) {
        return NextResponse.json({ error: "Fourchette de répétitions inversée" }, { status: 400 });
      }
      const ligne = await ajouterExerciceAuTemplate({ userId, ...parsed.data });
      return NextResponse.json(ligne, { status: 201 });
    }

    const parsed = seanceSchema.safeParse(corps);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
    }
    const template = await creerSeanceTemplate({ userId, ...parsed.data });
    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    if (error instanceof RessourceIntrouvable) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("[programme/seances POST]", error);
    return NextResponse.json({ error: "Opération impossible" }, { status: 500 });
  }
}
