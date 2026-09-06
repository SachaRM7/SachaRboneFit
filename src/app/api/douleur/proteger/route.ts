import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { protegerZones, ZoneInconnue } from "@/services/douleur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Le « Oui, ménage cette zone » de l'athlète.
 *
 * C'EST LE SEUL ENDROIT DE L'APPLICATION où une gêne signalée devient une
 * contrainte. Il n'y a pas de chemin automatique, pas de tâche de fond, pas de
 * branche du signalement qui écrirait « pendant qu'on y est » : cette route
 * n'existe que pour être appelée par un geste, et le geste est un bouton qui
 * dit ce qu'il fait.
 *
 * Le corps ne porte QUE la zone et la sévérité proposée. Pas de `userId` — il
 * vient du cookie vérifié —, pas de muscle — le référentiel le déduit —, pas de
 * date de fin ni d'échéance : le moteur les pose.
 */

const schema = z.object({
  zones: z.array(z.object({
    /** Une `ZoneDouleur` du référentiel. Le service refuse tout le reste. */
    zone: z.string().min(1).max(64),
    severite: z.number().int().min(1).max(10),
  })).min(1).max(6),
  note: z.string().max(300).nullable().optional(),
});

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Demande invalide" }, { status: 400 });
  }

  try {
    const protections = await protegerZones({
      userId,
      zones: parsed.data.zones,
      note: parsed.data.note ?? null,
    });
    return NextResponse.json({ protections }, { status: 201 });
  } catch (erreur) {
    // 422 : la requête est bien formée, mais cette zone n'existe pas dans le
    // référentiel — donc rien de ce qu'elle demande n'est traduisible.
    if (erreur instanceof ZoneInconnue) {
      return NextResponse.json({ error: erreur.message, zone: erreur.zone }, { status: 422 });
    }
    console.error("[douleur proteger POST]", erreur);
    return NextResponse.json({ error: "Protection impossible" }, { status: 500 });
  }
}
