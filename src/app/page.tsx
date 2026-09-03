import { redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";

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
  const userId = await getAuthenticatedUserId();
  redirect(userId ? "/dashboard" : "/login");
}
