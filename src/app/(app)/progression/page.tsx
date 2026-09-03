import { redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { bilanDeProgression } from "@/services/bilan";
import { ContenuProgression } from "@/components/progression/ContenuProgression";

/**
 * Progression, rendue par le serveur.
 *
 * L'écran s'ouvrait sur un spinner plein écran : composant client, `fetch`
 * après montage, et rien à lire avant que la requête revienne — la même chaîne
 * en quatre temps que l'accueil.
 *
 * Le bilan est calculé ici et rendu avec le HTML. Les vues détaillées — par
 * exercice, par pilier, records, poids — gardent leur chargement à la demande :
 * personne ne les ouvre toutes, et les précharger ferait payer à l'ouverture ce
 * dont on ne se sert pas.
 */
export default async function ProgressionPage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const bilan = await bilanDeProgression(userId);
  return <ContenuProgression bilan={bilan} />;
}
