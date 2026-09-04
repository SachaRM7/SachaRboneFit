import { cache } from 'react';
import { NextResponse } from 'next/server';
import { createClient } from './server';
import { phase } from '@/lib/mesure/trace';

/**
 * L'utilisateur connecté, une seule fois par rendu, sans aller-retour réseau.
 *
 * `supabase.auth.getUser()` n'est pas une lecture de cookie : elle appelle le
 * serveur d'authentification pour valider le jeton. Depuis une fonction
 * serverless, c'est un aller-retour complet — et il était payé au moins trois
 * fois par navigation : deux fois dans le proxy, une fois au rendu.
 *
 * `getClaims()` fait le même travail de vérification, mais localement.
 * Le jeton est signé ; quand le projet utilise une clé asymétrique (ECC/RSA),
 * la signature se vérifie par WebCrypto contre la clé publique du projet,
 * récupérée une fois puis mise en cache. Ce n'est PAS lire un cookie et le
 * croire : c'est une vérification cryptographique, qui échoue sur un jeton
 * forgé, modifié ou expiré exactement comme le ferait le serveur.
 *
 * Une réserve à connaître, et elle est décisive : si le projet Supabase signe
 * encore ses jetons avec le secret symétrique historique (HS256), `getClaims()`
 * ne peut pas vérifier localement et repart en réseau — le comportement reste
 * correct, le gain disparaît. La bascule vers une clé asymétrique se fait dans
 * le tableau de bord Supabase, et c'est elle qui transforme trois allers-retours
 * en zéro. L'instrumentation le dira : une phase `auth` à ~0 ms signale la
 * vérification locale, à plusieurs dizaines de millisecondes le repli réseau.
 *
 * `cache()` de React mémoïse pour la DURÉE D'UN RENDU, et pour lui seul : deux
 * requêtes HTTP concurrentes gardent chacune la sienne, et rien n'est conservé
 * d'une requête à l'autre. Ce n'est pas un cache de données — c'est la
 * déduplication d'un appel identique dans un même arbre de rendu. Elle ne
 * franchit ni la frontière du proxy, ni celle d'une route API : ces
 * chemins-là comptent leurs propres validations.
 */
export const getAuthenticatedUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();

  const { data, error } = await phase('auth', 'getClaims', () =>
    supabase.auth.getClaims(),
  );

  if (error || !data?.claims) return null;

  // `sub` est l'identifiant du compte dans un JWT. Il vient d'un jeton dont la
  // signature vient d'être vérifiée — pas d'un en-tête ni d'un paramètre.
  const sub = data.claims.sub;
  return typeof sub === 'string' && sub.length > 0 ? sub : null;
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
