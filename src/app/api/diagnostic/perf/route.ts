import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db, compterRequetes } from "@/db/client";
import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { essentielTableauDeBord, complementTableauDeBord } from "@/services/tableau-de-bord";
import { instantane, traceCourante, traceActive } from "@/lib/mesure/trace";

export const dynamic = "force-dynamic";

/**
 * Les chiffres, servis dans une page — sans dépendre des journaux.
 *
 * La première instrumentation ne journalisait rien d'exploitable sur Vercel :
 * `after()` publie après l'envoi de la réponse, et le proxy s'exécute dans une
 * invocation séparée de la page. L'onglet Logs d'une requête `/dashboard`
 * affichait « No logs found for this request », et il avait raison.
 *
 * Les lignes de journal sont réparées par ailleurs — elles sortent maintenant
 * PENDANT la requête. Mais dépendre d'un seul canal était l'erreur de fond :
 * celui-ci n'a besoin d'aucun journal, d'aucun accès à un tableau de bord,
 * d'aucun outil. On l'ouvre depuis le téléphone et on lit.
 *
 * Ce qu'il mesure est ce qui compose réellement une navigation :
 *
 *   - la région où la fonction tourne, et celle de la base ;
 *   - le temps d'un aller-retour vers la base, mesuré trois fois ;
 *   - le coût d'ouverture d'une connexion, séparé du reste ;
 *   - une vérification d'identité, et les appels RÉSEAU qu'elle provoque
 *     vraiment — c'est la seule façon de savoir si la signature est vérifiée
 *     sur place ou si le repli réseau s'applique ;
 *   - le chemin critique de l'accueil et son complément, séparément, en durée
 *     ET en nombre de requêtes.
 *
 * Aucune donnée personnelle n'en sort : ni identifiant, ni courriel, ni
 * contenu d'entraînement. Les tailles renvoyées sont des DÉCOMPTES, jamais des
 * valeurs. La route exige une session — un diagnostic n'a pas à être public.
 */

/** La médiane de trois mesures : une valeur aberrante ne l'emporte pas. */
function mediane(valeurs: number[]): number {
  const triees = [...valeurs].sort((a, b) => a - b);
  return Math.round((triees[Math.floor(triees.length / 2)] ?? 0) * 10) / 10;
}

const arrondi = (ms: number) => Math.round(ms * 10) / 10;

/**
 * Où vit la base, d'après l'adresse à laquelle on s'y connecte.
 *
 * Le pooler Supabase porte sa région dans son nom d'hôte
 * (`aws-0-eu-west-3.pooler.supabase.com`) : c'est une information de
 * configuration, pas un secret, et elle répond directement à la question. La
 * connexion directe (`db.<ref>.supabase.co`) ne la porte pas — dans ce cas on
 * le dit, et c'est le temps d'aller-retour mesuré plus bas qui tranche.
 *
 * Ni identifiant ni mot de passe ne sont lus : seul l'hôte, et la référence de
 * projet y est masquée.
 */
function ouVitLaBase(): { hote: string | null; region: string | null } {
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    const hote = url.hostname;
    const region = hote.match(/aws-\d+-([a-z]{2}-[a-z]+-\d)\./)?.[1] ?? null;
    return { hote: hote.replace(/^db\.[a-z0-9]+\./, "db.[projet]."), region };
  } catch {
    return { hote: null, region: null };
  }
}

export async function GET() {
  const { error } = await requireAuthenticatedUserId();
  if (error) return error;
  const { userId } = await requireAuthenticatedUserId();

  if (!traceActive()) {
    return NextResponse.json({ erreur: "PERF_TRACE=off" }, { status: 503 });
  }

  const trace = traceCourante();
  const appelsAvant = trace?.appelsSupabase.length ?? 0;

  /*
   * Une vérification neuve, sur un client neuf.
   *
   * `getAuthenticatedUserId` est mémoïsée pour le rendu : la rappeler ne
   * mesurerait qu'une lecture de mémoire. Ce client-ci est créé pour
   * l'occasion, comme le proxy crée le sien à chaque passage — c'est donc le
   * coût réel d'une validation, et la sonde compte les appels réseau qu'elle
   * déclenche.
   */
  const debutAuth = performance.now();
  const supabase = await createClient();
  await supabase.auth.getClaims();
  const msAuth = arrondi(performance.now() - debutAuth);
  const appelsAuth = (trace?.appelsSupabase ?? []).slice(appelsAvant);

  /*
   * Le coût d'un aller-retour vers la base, sans rien calculer.
   *
   * `select 1` ne lit aucune table : ce qu'il mesure est la distance, pas le
   * travail. La première prend en plus l'ouverture de la connexion quand
   * l'instance vient de démarrer — d'où les trois, et la médiane.
   */
  const pings: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    const debut = performance.now();
    await db.execute(sql`select 1`);
    pings.push(performance.now() - debut);
  }

  const debutEssentiel = performance.now();
  const mesureEssentiel = await compterRequetes(() => essentielTableauDeBord(userId));
  const msEssentiel = arrondi(performance.now() - debutEssentiel);

  const debutComplement = performance.now();
  const mesureComplement = await compterRequetes(() => complementTableauDeBord(userId));
  const msComplement = arrondi(performance.now() - debutComplement);

  return NextResponse.json({
    region: {
      fonction: process.env.VERCEL_REGION ?? null,
      base: ouVitLaBase(),
      /*
       * La conclusion se lit ici, pas dans les noms de région : un aller-retour
       * de quelques millisecondes veut dire « à côté », de plusieurs dizaines
       * « sur un autre continent ». Avec `max: 1`, chaque requête de l'écran
       * paie cette somme, l'une après l'autre.
       */
      allerRetourBaseMs: mediane(pings),
      premierAllerRetourMs: arrondi(pings[0] ?? 0),
    },
    instance: {
      froide: trace?.froid ?? null,
      environnement: process.env.VERCEL_ENV ?? "local",
    },
    auth: {
      ms: msAuth,
      /*
       * Le chiffre décisif. ZÉRO appel = la signature est vérifiée sur place,
       * par WebCrypto. UN appel vers `/auth/v1/.well-known/jwks.json` = le
       * trousseau public est téléchargé, ce qui n'arrive qu'une fois par
       * instance. UN appel vers `/auth/v1/user` = le projet signe encore avec
       * le secret symétrique, `getClaims()` est reparti sur le réseau, et le
       * correctif est dans le tableau de bord Supabase, pas dans ce dépôt.
       */
      appelsReseau: appelsAuth,
    },
    accueil: {
      essentiel: { ms: msEssentiel, requetes: mesureEssentiel.requetes },
      complement: { ms: msComplement, requetes: mesureComplement.requetes },
    },
    // La trace de CETTE requête, dans le même format que les lignes `[perf]`.
    trace: trace ? instantane(trace, "diagnostic") : null,
  });
}
