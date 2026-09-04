import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { formeDuChemin, phase, traceActive, tracerHorsRendu } from '@/lib/mesure/trace';

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
  return tracerHorsRendu(request.nextUrl.pathname, async (trace) => {
    const debut = performance.now();

    /*
     * Le rendu ne sait pas quel chemin a été demandé — il ne voit qu'un arbre
     * de composants. Le proxy, lui, le sait. Il transmet la FORME du chemin,
     * jamais le chemin lui-même : un identifiant de séance n'a rien à faire
     * dans un en-tête recopié dans un journal.
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
     *
     * UNE validation ne veut pas dire UN aller-retour : elle peut n'en
     * provoquer aucun, ou plusieurs. La sonde réseau les compte, et ce sont eux
     * qui apparaissent dans les requêtes sortantes de Vercel.
     */
    const { data, error } = await phase('auth', 'getClaims', () =>
      supabase.auth.getClaims(),
    );

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

    const sortie = redirection ?? response;

    /*
     * Deux canaux, parce que le premier n'a rien donné.
     *
     * Le proxy s'exécute dans une INVOCATION SÉPARÉE de la fonction de page :
     * ses lignes de journal n'apparaîtront jamais sous la requête `/dashboard`,
     * quoi qu'on écrive. C'est ce qui a fait croire que l'instrumentation ne
     * fonctionnait pas.
     *
     * Elles sortent donc aussi par des en-têtes de réponse, qui n'ont besoin
     * d'aucun journal : ils se lisent dans l'inspecteur du navigateur ou avec
     * un `curl -I`. `Server-Timing` est le format standard pour ça, et les
     * outils de développement l'affichent tels quels.
     *
     * Rien d'identifiant n'y passe : une durée, un compte, et le CHEMIN des
     * appels réseau — jamais leur requête complète, qui porte des jetons.
     */
    if (traceActive()) {
      const total = Math.round((performance.now() - debut) * 10) / 10;
      const msAuth = trace.mesures.find((m) => m.phase === 'auth')?.ms ?? 0;
      const appels = trace.appelsSupabase;

      sortie.headers.set(
        'Server-Timing',
        [
          `proxy;dur=${total}`,
          `auth;dur=${msAuth}`,
          `supabase;dur=${Math.round(appels.reduce((s, a) => s + a.ms, 0) * 10) / 10};desc="${appels.length} appel(s)"`,
        ].join(', '),
      );
      // Le détail, pour savoir CE QUE sont ces appels : un trousseau public,
      // un repli de validation, un rafraîchissement de session.
      sortie.headers.set(
        'x-perf-supabase',
        appels.map((a) => `${a.chemin}=${a.ms}`).join(' ') || 'aucun',
      );
      sortie.headers.set('x-perf-region', process.env.VERCEL_REGION ?? 'inconnue');
      sortie.headers.set('x-perf-froid', String(trace.froid));

      console.log(
        '[perf-proxy] ' +
          JSON.stringify({
            route: formeDuChemin(chemin),
            region: process.env.VERCEL_REGION ?? null,
            froid: trace.froid,
            total,
            authMs: msAuth,
            validations: 1,
            reseauSupabase: appels,
            redirige: redirection !== null,
          }),
      );
    }

    return sortie;
  });
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
