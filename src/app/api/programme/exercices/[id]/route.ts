import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import {
  modifierExerciceDuTemplate,
  retirerExerciceDuTemplate,
  RessourceIntrouvable,
} from "@/services/programmes";

/**
 * `null` est accepté et signifie « effort non prescrit » : c'est le seul moyen
 * de retirer une cible sans retirer l'exercice.
 */
const modificationSchema = z.object({
  rpeCible: z.number().min(1).max(10).nullable().optional(),
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

  // La clé absente ne veut pas dire la même chose que `null` : l'une ne touche
  // à rien, l'autre efface la cible. Zod ne distingue pas les deux, le corps
  // reçu si.
  const modifications: { rpeCible?: number | null } = {};
  if (corps !== null && typeof corps === "object" && "rpeCible" in corps) {
    modifications.rpeCible = parsed.data.rpeCible ?? null;
  }

  try {
    const ligne = await modifierExerciceDuTemplate(userId, id, modifications);
    return NextResponse.json(ligne);
  } catch (error) {
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
