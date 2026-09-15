import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import {
  modifierExerciceDuTemplate,
  PrescriptionInvalide,
  retirerExerciceDuTemplate,
  RessourceIntrouvable,
  type ModificationExerciceProgramme,
} from "@/services/programmes";

/**
 * Toute la configuration s'édite ici, et chaque champ est FACULTATIF.
 *
 * `null` est une valeur, pas une absence : c'est « non prescrit », et c'est le
 * seul moyen de retirer une cible, un tempo, un repos ou une charge sans
 * retirer l'exercice. Un champ absent de la requête ne touche à rien. Les
 * champs à contrainte NOT NULL (`seriesCibles`, `fourchetteReps*`) refusent
 * `null` : ils décrivent un nombre de séries à faire, pas une absence.
 */
const modificationSchema = z.object({
  seriesCibles: z.number().int().min(1).max(12).optional(),
  fourchetteRepsMin: z.number().int().min(1).max(50).optional(),
  fourchetteRepsMax: z.number().int().min(1).max(50).optional(),
  rpeCible: z.number().min(1).max(10).nullable().optional(),
  tempo: z.string().trim().max(16).nullable().optional(),
  reposSecondes: z.number().int().min(0).max(900).nullable().optional(),
  /** Charge en kg. Jamais devinée : absente ⇒ inchangée, `null` ⇒ retirée. */
  chargeCible: z.number().gt(0).max(1000).nullable().optional(),
  /** Rang visé dans la séance, à partir de 1. Réordonnancement transactionnel. */
  ordre: z.number().int().min(1).max(200).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  let corps: unknown;
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  const parsed = modificationSchema.safeParse(corps);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  }

  /*
   * La clé absente ne veut pas dire la même chose que `null` : l'une ne touche à
   * rien, l'autre efface la valeur. Zod conserve cette différence — un champ
   * optionnel omis n'apparaît pas dans l'objet analysé, un champ envoyé à
   * `null` y apparaît à `null` — et le service arbitre sur la présence de la
   * clé. Notre schéma n'est donc pas aplati en `?? null` dès la route.
   */
  const modifications: ModificationExerciceProgramme = parsed.data;

  try {
    const ligne = await modifierExerciceDuTemplate(userId, id, modifications);
    return NextResponse.json(ligne);
  } catch (error) {
    if (error instanceof PrescriptionInvalide) {
      return NextResponse.json({ error: error.raison }, { status: 400 });
    }
    if (error instanceof RessourceIntrouvable) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("[programme/exercices PATCH]", error);
    return NextResponse.json({ error: "Modification impossible" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    await retirerExerciceDuTemplate(userId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RessourceIntrouvable) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("[programme/exercices DELETE]", error);
    return NextResponse.json({ error: "Suppression impossible" }, { status: 500 });
  }
}
