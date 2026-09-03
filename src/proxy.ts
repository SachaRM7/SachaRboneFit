import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { formeDuChemin } from '@/lib/mesure/trace';

/**
 * Le garde d'entrée, et ce qu'il coûtait.
 *
 * Il appelait `supabase.auth.getUser()` DEUX FOIS de suite — une fois « pour
 * rafraîchir la session », une seconde pour lire l'utilisateur. C'étaient deux
 * allers-retours réseau vers le serveur d'authentification, sur CHAQUE
 * navigation protégée, pour obtenir exactement la même réponse. Le premier
 * appel ne faisait rien que le second n'aurait fait : c'est la lecture des
 * cookies par le client SSR qui déclenche le rafraîchissement, pas la
 * répétition de l'appel.
 *
 * Il n'en reste qu'un, et ce n'est plus `getUser()`.
 *
 * `getClaims()` vérifie la signature du jeton localement, par WebCrypto, quand
 * le projet utilise une clé asymétrique. La vérification est réelle — un jeton
 * forgé, modifié ou expiré échoue — mais elle ne quitte pas la machine. Le
 * rafraîchissement des cookies est préservé : `createServerClient` renouvelle
 * la session si le jeton est sur le point d'expirer, et `setAll` reporte les
 * cookies renouvelés sur la requête ET sur la réponse, comme avant.
 *
 * Ce que le proxy NE fait pas : transmettre l'identité au rendu par un
 * en-tête. Un en-tête peut être forgé par le client, et il faudrait l'effacer
 * systématiquement pour que le procédé tienne — une garantie qui repose sur un
 * effacement qu'on peut oublier. Le rendu revalide donc, de son côté, avec la
 * même vérification locale : deux vérifications qui ne coûtent plus rien
 * valent mieux qu'une seule qui repose sur la confiance.
 */

/**
 * Les préfixes qui exigent une session. Une seule source, réutilisée plus bas.
 *
 * Exporté pour que le test puisse confronter cette liste au `matcher` : un
 * chemin déclaré protégé ici mais absent du matcher n'est jamais gardé, et
 * rien dans le code ne le signale. C'est le genre d'écart qu'on ne voit qu'en
 * comparant deux listes à la main — donc qu'on ne voit pas.
 */
export const PROTEGES = [
  '/dashboard', '/sessions', '/exercises', '/progression', '/gyms',
  '/bodyweight', '/settings', '/daily-state', '/profil', '/historique',
  '/programme', '/session', '/bienvenue', '/contraintes',
] as const;

export async function proxy(request: NextRequest) {
  const debut = performance.now();

  /*
   * Le rendu ne sait pas quel chemin a été demandé — il ne voit qu'un arbre de
   * composants. Le proxy, lui, le sait. Il transmet la FORME du chemin, jamais
   * le chemin lui-même : un identifiant de séance n'a rien à faire dans un
   * en-tête recopié dans un journal.
   */
  const enTetes = new Headers(request.headers);
  enTetes.set('x-route-forme', formeDuChemin(request.nextUrl.pathname));

  const response = NextResponse.next({
    request: { headers: enTetes },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  /**
   * UNE seule validation. Elle rafraîchit la session si nécessaire — c'est le
   * client SSR qui s'en charge en lisant les cookies — et rend les
   * revendications du jeton une fois sa signature vérifiée.
   */
  const debutAuth = performance.now();
  const { data, error } = await supabase.auth.getClaims();
  const msAuth = performance.now() - debutAuth;

  const connecte = !error && typeof data?.claims?.sub === 'string';

  const url = request.nextUrl.clone();
  const chemin = url.pathname;

  let redirection: NextResponse | null = null;

  if (PROTEGES.some((prefixe) => chemin.startsWith(prefixe)) && !connecte) {
    url.pathname = '/login';
    redirection = NextResponse.redirect(url);
  } else if ((chemin === '/login' || chemin === '/register') && connecte) {
    url.pathname = '/dashboard';
    redirection = NextResponse.redirect(url);
  }

  /*
   * Une ligne par passage, sans identité.
   *
   * Le proxy s'exécute dans un runtime distinct du rendu : il ne partage ni la
   * trace ni le stockage asynchrone du reste de l'application, et mesure donc
   * son propre temps. C'est aussi ce qui explique qu'il ne PUISSE pas
   * déduplifier sa validation avec celle du rendu.
   *
   * `authMs` proche de zéro = vérification locale. Plusieurs dizaines de
   * millisecondes = le projet signe encore en symétrique, et `getClaims()` est
   * reparti sur le réseau.
   */
  if (process.env.PERF_TRACE !== 'off') {
    console.log(
      '[perf-proxy] ' +
        JSON.stringify({
          route: formeDuChemin(chemin),
          // Le proxy s'exécute en périphérie, souvent loin du rendu : comparer
          // les deux régions dit si la latence vient de la géographie.
          region: process.env.VERCEL_REGION ?? null,
          total: Math.round((performance.now() - debut) * 10) / 10,
          authMs: Math.round(msAuth * 10) / 10,
          validations: 1,
          redirige: redirection !== null,
        }),
    );
  }

  return redirection ?? response;
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/sessions/:path*',
    '/exercises/:path*',
    '/progression/:path*',
    '/gyms/:path*',
    '/bodyweight/:path*',
    '/settings/:path*',
    '/profil/:path*',
    '/historique/:path*',
    '/programme/:path*',
    '/contraintes/:path*',
    '/daily-state/:path*',
    '/session/:path*',
    '/bienvenue/:path*',
    '/login',
    '/register',
  ],
};
