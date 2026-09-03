import { cache } from 'react';
import { NextResponse } from 'next/server';
import { createClient } from './server';

/**
 * L'utilisateur connecté, une seule fois par requête.
 *
 * `supabase.auth.getUser()` n'est pas une lecture de cookie : elle appelle le
 * serveur d'authentification pour valider le jeton. C'est donc un aller-retour
 * réseau — quelques dizaines de millisecondes depuis une fonction serverless.
 *
 * Et il était payé plusieurs fois par navigation. Le layout de l'application
 * le demande pour savoir si l'onboarding est terminé, puis chaque page le
 * redemande pour ses propres lectures : deux appels au minimum, davantage dès
 * qu'un composant serveur imbriqué en avait besoin. Aucun ne pouvait savoir
 * que l'autre venait de le faire.
 *
 * `cache()` de React mémoïse pour la DURÉE D'UN RENDU, et pour lui seul :
 * deux requêtes HTTP concurrentes gardent chacune la sienne, et rien n'est
 * conservé d'une requête à l'autre. Ce n'est pas un cache de données — c'est
 * la déduplication d'un appel identique dans un même arbre de rendu.
 */
export const getAuthenticatedUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  return user.id;
});

export async function requireAuthenticatedUserId(): Promise<{ userId: string; error: NextResponse | null }> {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return {
      userId: '',
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  return { userId, error: null };
}
