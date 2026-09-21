import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import {
  archiverSeanceTemplate,
  copierSeanceTemplate,
  modifierSeanceTemplate,
  ProgrammeManagementError,
} from "@/services/programme-management";

/**
 * Renommer, déplacer et réordonner, dans un seul PATCH.
 *
 * Chaque champ est facultatif, et `destinationBlocId` garde exactement le sens
 * qu'il avait : sans lui, la séance reste dans son programme. Un corps qui ne
 * demande rien est refusé plutôt qu'accepté en silence — un PATCH vide qui rend
 * 200 laisse croire que quelque chose a été enregistré.
 */
const schema = z.object({
  destinationBlocId: z.string().uuid().optional(),
  nom: z.string().trim().min(1).max(120).optional(),
  lettre: z.string().trim().min(1).max(8).optional(),
  /** Rang visé dans la rotation, à partir de 1. Réordonnancement transactionnel. */
  ordre: z.number().int().min(1).max(200).optional(),
}).refine(
  (modifications) => Object.keys(modifications).length > 0,
  { message: "Aucune modification demandée" },
);

const copieSchema = z.object({
  destinationBlocId: z.string().uuid(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = copieSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Destination invalide" }, { status: 400 });
  }

  const { id } = await params;
  try {
    const copie = await copierSeanceTemplate(userId, id, parsed.data.destinationBlocId);
    return NextResponse.json(copie, { status: 201 });
  } catch (error) {
    if (error instanceof ProgrammeManagementError) {
      return NextResponse.json({ error: error.reason }, { status: error.status });
    }
    console.error("[programme/seances/:id POST]", error);
    return NextResponse.json({ error: "Copie impossible" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Modification invalide", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id } = await params;
  try {
    const template = await modifierSeanceTemplate(userId, id, parsed.data);
    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof ProgrammeManagementError) {
      return NextResponse.json({ error: error.reason }, { status: error.status });
    }
    console.error("[programme/seances/:id PATCH]", error);
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
    const template = await archiverSeanceTemplate(userId, id);
    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof ProgrammeManagementError) {
      return NextResponse.json({ error: error.reason }, { status: error.status });
    }
    console.error("[programme/seances/:id DELETE]", error);
    return NextResponse.json({ error: "Suppression impossible" }, { status: 500 });
  }
}
