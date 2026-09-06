import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { signalerDouleur, SeanceIntrouvable } from "@/services/douleur";
import { MOMENTS_DOULEUR } from "@/lib/engine/incident-douleur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Signaler une gêne pendant la séance.
 *
 * Elle fait deux choses et s'arrête là : elle consigne l'incident au format
 * canonique, et elle rend ce que la règle existante dit de chaque zone. Elle ne
 * crée AUCUNE contrainte — c'est `/api/douleur/proteger` qui le fait, et
 * seulement sur un « Oui » explicite. La séparation en deux routes est ce qui
 * garantit qu'aucun chemin ne peut modifier la programmation sans qu'une
 * personne l'ait demandé : il n'existe pas de branche de celle-ci qui écrive
 * dans `contraintes`.
 *
 * `/api/incidents` reste la route générique des trois autres SOS. Celle-ci lui
 * est préférée pour la douleur parce que la douleur, seule, a une suite.
 */

const schema = z.object({
  session_log_id: z.string().uuid(),
  /**
   * Identifiants de régions du mannequin. Le serveur les retraduit lui-même en
   * zones du référentiel : ce que le client envoie ne décide de rien, et un
   * identifiant inconnu est ignoré plutôt que cru.
   */
  regions: z.array(z.string().max(64)).min(1).max(12),
  niveau: z.number().int().min(1).max(10),
  type_douleur: z.enum(["sourde", "raideur", "aiguë", "irradiation"]),
  moment: z.enum(MOMENTS_DOULEUR.map((m) => m.valeur) as [string, ...string[]]).nullable().optional(),
  arret_conseille: z.boolean(),
  a_retirer: z.array(z.string().uuid()).max(40).default([]),
  a_alleger: z.array(z.string().uuid()).max(40).default([]),
  decision: z.string().min(1).max(300),
});

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Signalement invalide", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  try {
    const resultat = await signalerDouleur({
      // Jamais depuis le corps de la requête : le compte vient du cookie vérifié.
      userId,
      sessionLogId: d.session_log_id,
      regions: d.regions,
      niveau: d.niveau,
      typeDouleur: d.type_douleur,
      moment: (d.moment ?? null) as Parameters<typeof signalerDouleur>[0]["moment"],
      arretConseille: d.arret_conseille,
      aRetirer: d.a_retirer,
      aAlleger: d.a_alleger,
      decision: d.decision,
    });
    return NextResponse.json(resultat, { status: 201 });
  } catch (erreur) {
    // 403 plutôt que 404 : la séance existe peut-être, elle n'est pas à toi.
    if (erreur instanceof SeanceIntrouvable) {
      return NextResponse.json({ error: erreur.message }, { status: 403 });
    }
    console.error("[douleur POST]", erreur);
    return NextResponse.json({ error: "Signalement non enregistré" }, { status: 500 });
  }
}
