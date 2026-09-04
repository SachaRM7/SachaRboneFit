import { redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { nommerTrace, publier } from "@/lib/mesure/trace";

/**
 * La porte d'entrée, et elle est empruntée à chaque lancement.
 *
 * `start_url` du manifeste vaut `/` : ouvrir l'application depuis l'écran
 * d'accueil passe TOUJOURS par ici, avant même la première vraie page. Cette
 * redirection appelait `getUser()`, c'est-à-dire un aller-retour réseau vers le
 * serveur d'authentification, uniquement pour savoir s'il y avait quelqu'un —
 * puis `/dashboard` en refaisait un.
 *
 * Le helper commun fait la même vérification, localement, et la mémoïse pour
 * le rendu. La garantie est inchangée : un jeton absent, forgé ou expiré
 * envoie sur `/login`.
 */
export default async function Home() {
  nommerTrace("/");
  const userId = await getAuthenticatedUserId();

  // Ce redirect est franchi à chaque lancement : sa durée fait partie du temps
  // d'ouverture ressenti, et elle se mesure ici comme ailleurs.
  publier("racine");

  redirect(userId ? "/dashboard" : "/login");
}
