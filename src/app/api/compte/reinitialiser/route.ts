import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { detailErreur } from "@/lib/erreurs";
import { reinitialiserCompte } from "@/services/reinitialisation";

/**
 * Remise à zéro du compte, pour rejouer le parcours depuis l'onboarding.
 *
 * L'identifiant vient de la session, jamais du corps de la requête : personne
 * ne doit pouvoir réinitialiser le compte d'un autre en changeant un champ.
 *
 * `confirmation` n'est pas de la cérémonie : cette route efface un historique
 * sans corbeille. Une faute de frappe dans une URL ne doit pas suffire.
 */
const corpsSchema = z.object({
  confirmation: z.literal("REINITIALISER"),
  supprimerMesLieux: z.boolean().default(false),
});

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = corpsSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Confirmation manquante ou invalide." },
        { status: 400 },
      );
    }

    const resume = await reinitialiserCompte(userId, {
      supprimerMesLieux: parsed.data.supprimerMesLieux,
    });

    return NextResponse.json({ resume });
  } catch (error) {
    const detail = detailErreur(error);
    console.error("[api/compte/reinitialiser]", detail, error);
    return NextResponse.json({ error: `Réinitialisation : ${detail}` }, { status: 500 });
  }
}
