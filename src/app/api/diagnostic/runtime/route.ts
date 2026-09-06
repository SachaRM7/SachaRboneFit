import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Pourquoi le serveur refuse de servir, quand plus rien ne répond.
 *
 * La Preview rend « A server error occurred » sur toutes les pages, y compris
 * `/login`. Dans cet état, aucun diagnostic ordinaire n'est utilisable : la
 * route `/api/diagnostic/perf` exige une session, et une session exige un
 * client Supabase — c'est-à-dire exactement ce qui est cassé.
 *
 * Cette route-ci est faite pour cet état-là, et pour lui seul.
 *
 * TROIS RÈGLES, et chacune répond à une contrainte précise :
 *
 *   1. AUCUN import statique de ce qui peut échouer. `@/db/client` construit
 *      son client au chargement du module, et `@/lib/supabase/server` lève dès
 *      qu'une variable manque. Les importer en tête ferait échouer cette route
 *      pour la raison même qu'elle cherche à identifier. Tout passe donc par
 *      des imports dynamiques, un par vérification, chacun dans son `try`.
 *
 *   2. AUCUNE authentification. Elle dépendrait de ce qu'on diagnostique.
 *
 *   3. AUCUNE valeur. Ni clé, ni URL complète, ni longueur, ni préfixe, ni
 *      extrait. Seulement : présent ou absent, et une forme reconnue ou non.
 *      Une longueur de clé est déjà une information ; un préfixe l'est
 *      davantage. Les messages d'erreur eux-mêmes sont nettoyés — un pilote de
 *      base de données recopie volontiers la chaîne de connexion dans son
 *      message.
 *
 * Elle n'est pas destinée à rester : c'est un instrument de panne, à retirer
 * une fois la cause établie.
 */

/** Ce qu'on dit d'une variable : sa présence, et la forme reconnue. */
interface EtatVariable {
  present: boolean;
  format?: string | null;
}

/**
 * Reconnaître une forme sans rien en révéler.
 *
 * Le format est le seul renseignement utile au-delà de la présence : une
 * variable présente mais mal formée produit exactement le même écran qu'une
 * variable absente, et se corrige tout autrement.
 */
function formeUrlBase(valeur: string | undefined): EtatVariable {
  if (!valeur) return { present: false, format: null };
  try {
    const url = new URL(valeur);
    const attendu = url.protocol === "postgres:" || url.protocol === "postgresql:";
    return { present: true, format: attendu ? "postgres" : "invalid" };
  } catch {
    // `postgres()` lève au CHARGEMENT du module sur une URL illisible : toute
    // route qui touche la base échoue alors, y compris celles qui n'en ont pas
    // besoin pour répondre.
    return { present: true, format: "invalid" };
  }
}

function formeUrlSupabase(valeur: string | undefined): EtatVariable {
  if (!valeur) return { present: false, format: null };
  try {
    const url = new URL(valeur);
    const httpS = url.protocol === "https:" || url.protocol === "http:";
    return { present: true, format: httpS ? "https-supabase" : "invalid" };
  } catch {
    return { present: true, format: "invalid" };
  }
}

/**
 * Un message d'erreur débarrassé de ce qu'il ne doit pas transporter.
 *
 * Les pilotes de base de données recopient la chaîne de connexion dans leurs
 * messages, et les URL d'un projet Supabase identifient ce projet. On garde le
 * nom de l'erreur et sa première ligne, amputée de toute adresse.
 */
function messageSur(cause: unknown): string {
  const brut = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
  return brut
    .split("\n")[0]!
    .replace(/[a-z]+:\/\/[^\s]*/gi, "[adresse retirée]")
    .slice(0, 200);
}

/** Une vérification qui ne doit jamais faire tomber la route. */
async function verifier(quoi: string, travail: () => Promise<void> | void) {
  try {
    await travail();
    return { [quoi]: { ok: true } as const };
  } catch (cause) {
    return { [quoi]: { ok: false, erreur: messageSur(cause) } };
  }
}

export async function GET() {
  const variables = {
    /*
     * Runtime seulement : lue à l'ouverture de la connexion, jamais figée
     * dans le paquet construit.
     */
    DATABASE_URL: formeUrlBase(process.env.DATABASE_URL),
    /*
     * BUILD, et c'est le piège.
     *
     * Next remplace `process.env.NEXT_PUBLIC_*` par sa valeur AU MOMENT DE LA
     * CONSTRUCTION, y compris dans le code serveur. Absente ce jour-là, elle
     * vaut `undefined` dans l'artefact construit — et la renseigner ensuite
     * dans les réglages ne change rien tant qu'on n'a pas RECONSTRUIT.
     *
     * Ce que cet endpoint rapporte est donc la valeur telle que le build l'a
     * figée, ce qui est précisément ce qu'on veut savoir.
     */
    NEXT_PUBLIC_SUPABASE_URL: formeUrlSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: {
      present: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    },
    /* Runtime, et facultative : aucun chemin d'écran ne s'en sert aujourd'hui. */
    SUPABASE_SERVICE_ROLE_KEY: {
      present: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
    /* Facultatives, hors des écrans : le coach et les tâches planifiées. */
    LLM_CHAINE_COURANTE: { present: Boolean(process.env.LLM_CHAINE_COURANTE) },
    CRON_SECRET: { present: Boolean(process.env.CRON_SECRET) },
  };

  /*
   * Les initialisations, séparément, et sans le moindre appel réseau.
   *
   * L'ordre suit la chaîne réelle d'une requête : le garde d'entrée construit
   * son client, puis le rendu construit le sien, puis la base s'ouvre. La
   * PREMIÈRE qui échoue est la cause ; les suivantes n'apprennent rien de
   * plus, mais elles sont tentées quand même — deux variables peuvent manquer
   * ensemble, et ne le dire qu'à moitié ferait perdre un aller-retour.
   */
  const initialisations = Object.assign(
    {},
    await verifier("client_supabase_navigateur", async () => {
      /*
       * Le constructeur, pas le module.
       *
       * `@/lib/supabase/client` porte la directive « use client » : l'appeler
       * depuis le serveur lève une erreur de Next qui n'a rien à voir avec la
       * panne cherchée, et masquerait la vraie. On construit donc le client
       * navigateur avec le MÊME constructeur et les MÊMES variables — c'est
       * ce couple-là qu'on vérifie, et il est identique.
       */
      const { createBrowserClient } = await import("@supabase/ssr");
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
    }),
    await verifier("client_supabase_serveur", async () => {
      const { createClient } = await import("@/lib/supabase/server");
      await createClient();
    }),
    await verifier("parsing_database_url", () => {
      const brut = process.env.DATABASE_URL;
      if (!brut) throw new Error("DATABASE_URL absente");
      // Lève sur une URL illisible, exactement comme le pilote au chargement.
      new URL(brut);
    }),
    await verifier("client_base_de_donnees", async () => {
      // L'import LUI-MÊME est la vérification : `postgres()` est appelé au
      // chargement du module. Aucune requête n'est envoyée.
      await import("@/db/client");
    }),
  );

  return NextResponse.json({
    environment: process.env.VERCEL_ENV ?? "local",
    region: process.env.VERCEL_REGION ?? null,
    variables,
    initialisations,
  });
}
