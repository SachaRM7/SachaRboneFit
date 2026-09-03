import { redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { donneesTableauDeBord } from "@/services/tableau-de-bord";
import { ContenuTableauDeBord } from "@/components/dashboard/ContenuTableauDeBord";

/**
 * L'accueil, rendu par le serveur.
 *
 * C'était un composant client qui appelait `/api/dashboard` après son montage.
 * La chaîne complète tenait en quatre étapes strictement en série : le
 * navigateur reçoit le HTML, télécharge et exécute le JavaScript, lance la
 * requête, puis rend enfin les chiffres. Chacune paie sa latence, et l'écran
 * montrait un squelette pendant tout ce temps — d'où les six à sept secondes
 * mesurées sur téléphone.
 *
 * Les données arrivent maintenant avec le HTML. Ce qui a besoin du navigateur
 * — le store de séance, la feuille d'abandon — reste dans un composant client,
 * qui les reçoit en `props` au lieu d'aller les chercher.
 */
export default async function DashboardPage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const donnees = await donneesTableauDeBord(userId);
  return <ContenuTableauDeBord data={donnees} />;
}
