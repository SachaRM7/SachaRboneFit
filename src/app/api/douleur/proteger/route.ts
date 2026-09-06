import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { deciderProtection, IncidentIntrouvable } from "@/services/douleur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Le « Oui, ménage cette zone » — ou le « Pas maintenant » — de l'athlète.
 *
 * C'EST LE SEUL ENDROIT DE L'APPLICATION où une gêne signalée devient une
 * contrainte. Il n'y a pas de chemin automatique, pas de tâche de fond, pas de
 * branche du signalement qui écrirait « pendant qu'on y est » : cette route
 * n'existe que pour être appelée par un geste, et le geste est un bouton qui
 * dit ce qu'il fait.
 *
 * LE CORPS NE PORTE AUCUNE AUTORITÉ. Un identifiant d'incident et un verbe,
 * rien d'autre : ni zone, ni muscle, ni sévérité, ni compte. Ce que la
 * confirmation crée est lu dans le cliché persisté avec l'incident au moment du
 * signalement, et l'incident n'est relu qu'à travers une jointure sur la séance
 * du compte authentifié.
 *
 * C'est ce qui corrige un défaut concret : la version précédente recevait
 * `{ zone, severite }` du client et recalculait `musclesDeLaZone(zone)`. Sur
 * « Épaule » dont seul `epaules` avait été proposé — `deltoide_posterieur`
 * étant déjà couvert —, confirmer recréait une contrainte sur les deux.
 */

const schema = z.object({
  incident_id: z.string().uuid(),
  decision: z.enum(["appliquer", "refuser"]),
});

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Demande invalide" }, { status: 400 });
  }

  try {
    const resultat = await deciderProtection({
      userId,
      incidentId: parsed.data.incident_id,
      decision: parsed.data.decision,
    });
    // 200 et non 201 : un renvoi réseau retombe ici sans rien créer, et
    // annoncer « créé » une seconde fois serait faux.
    return NextResponse.json(resultat);
  } catch (erreur) {
    // 404 aussi bien pour un incident absent que pour celui d'un autre compte :
    // distinguer les deux dirait à un inconnu que l'identifiant existe.
    if (erreur instanceof IncidentIntrouvable) {
      return NextResponse.json({ error: erreur.message }, { status: 404 });
    }
    console.error("[douleur proteger POST]", erreur);
    return NextResponse.json({ error: "Protection impossible" }, { status: 500 });
  }
}
