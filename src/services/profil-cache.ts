import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";

/**
 * Le garde d'onboarding, une seule fois par rendu.
 *
 * Le layout pose cette question à CHAQUE navigation, et l'écran Programme la
 * repose juste après pour la même raison. Deux requêtes identiques dans le
 * même rendu, sur une connexion unique — elles se sérialisent donc, et la
 * seconde attend la première pour apprendre ce qu'elle savait déjà.
 *
 * `cache()` déduplique pour la durée d'un rendu seulement : rien n'est
 * conservé d'une requête HTTP à l'autre, et deux visiteurs n'échangent jamais
 * leur réponse. Un compte qui termine son onboarding le voit donc au
 * rafraîchissement suivant, sans délai de péremption à régler.
 */
export const onboardingTermine = cache(async (userId: string): Promise<boolean> => {
  const profil = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { onboardingTermineLe: true },
  });
  return Boolean(profil?.onboardingTermineLe);
});
