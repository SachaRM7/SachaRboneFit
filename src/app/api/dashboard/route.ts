import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { detailErreur } from "@/lib/erreurs";
import { donneesTableauDeBord } from "@/services/tableau-de-bord";

/**
 * L'accueil, en HTTP.
 *
 * La route ne contient plus que son enveloppe : les lectures vivent dans
 * `services/tableau-de-bord`, que la PAGE serveur appelle directement. L'écran
 * était un composant client qui appelait cette route après son montage — HTML,
 * puis JavaScript, puis requête, puis rendu, quatre étapes en série avant le
 * premier chiffre.
 *
 * Elle reste parce qu'elle sert encore : le rafraîchissement en arrière-plan
 * et le service worker s'en servent. Deux implémentations auraient divergé,
 * une seule les sert toutes les deux.
 */
export async function GET() {
  const depart = Date.now();
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const donnees = await donneesTableauDeBord(userId);
    return NextResponse.json(donnees, {
      // Lisible dans l'onglet réseau de n'importe quel navigateur, sans outil.
      headers: { "Server-Timing": `total;dur=${Date.now() - depart}` },
    });
  } catch (error) {
    // Le message était constant : toute panne — colonne absente, service en
    // échec, requête invalide — se présentait de la même façon, et le client
    // n'avait aucun moyen de dire ce qui avait cassé.
    const detail = detailErreur(error);
    console.error("[api/dashboard]", detail, error);
    return NextResponse.json({ error: `Chargement du tableau de bord : ${detail}` }, { status: 500 });
  }
}
