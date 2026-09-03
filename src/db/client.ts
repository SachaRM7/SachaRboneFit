import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { noter, traceActive } from "@/lib/mesure/trace";

/**
 * Connexion à la base.
 *
 * `postgres.js` ouvre par défaut dix connexions par processus. En exécution
 * serverless, chaque instance a le sien : deux instances concurrentes
 * suffisaient à épuiser le pooler Supabase, limité à quinze clients en mode
 * session. Le tableau de bord tombait alors sur un `EMAXCONNSESSION`, avec un
 * message qui ne disait rien de cette cause.
 *
 * Une seule connexion par instance est le réglage qui convient ici : la
 * concurrence vient de la multiplication des instances, pas du parallélisme à
 * l'intérieur de l'une d'elles. Les requêtes d'une même requête HTTP se
 * sérialisent, ce qui coûte quelques millisecondes et supprime la saturation.
 *
 * `max: 1` n'est pas touché : la mesure doit précéder la décision, et rien
 * n'indique encore que le pooler tolérerait davantage.
 *
 * `idle_timeout` passe de 20 à 120 secondes. Ce n'est PAS la même chose
 * qu'élargir le pool : le nombre de connexions simultanées reste un. Ce qui
 * change, c'est la durée pendant laquelle une instance déjà chaude garde la
 * sienne. À 20 secondes, une instance servie toutes les trente secondes
 * rouvrait une connexion à chaque fois — poignée de main TLS et
 * authentification comprises, avant la première requête utile. Une instance
 * inactive plus de deux minutes rend toujours sa place.
 */
const client = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  max: 1,
  idle_timeout: 120,
  connect_timeout: 10,
});

/**
 * Un compteur que les tests peuvent allumer.
 *
 * « L'accueil fait moins de requêtes qu'avant » est une affirmation qu'on peut
 * écrire dans un commentaire et qui redevient fausse au commit suivant, sans
 * que rien ne le signale. Le seul moyen de la tenir est de compter — à
 * l'endroit exact où les requêtes partent, pas en relisant du code.
 *
 * Nul en production : la variable reste `null`, et le test seul l'arme.
 */
let observateur: { requetes: number } | null = null;

export async function compterRequetes<T>(
  travail: () => Promise<T>,
): Promise<{ resultat: T; requetes: number }> {
  // Une seule observation à la fois : la suite d'intégration s'exécute sans
  // parallélisme de fichiers, et deux compteurs imbriqués mentiraient tous les
  // deux. Mieux vaut le dire que le laisser deviner.
  if (observateur) throw new Error("Un comptage est déjà en cours.");
  const compteur = { requetes: 0 };
  observateur = compteur;
  try {
    const resultat = await travail();
    return { resultat, requetes: compteur.requetes };
  } finally {
    observateur = null;
  }
}

/**
 * Le compteur s'intercale entre Drizzle et postgres.js.
 *
 * Le logger de Drizzle se fixe à la construction et ne donne pas de durée ;
 * `pg_stat_database` est alimenté de façon différée. Drizzle appelle
 * `unsafe()` sur le client sous-jacent pour chaque requête : c'est le point de
 * passage obligé, et le seul qui compte exactement ce qui part sur le réseau.
 *
 * Ce qu'il ne faut SURTOUT pas faire ici — et qui a été fait, puis attrapé par
 * le test de coût : renvoyer une autre promesse à la place de la requête. Ce
 * que `unsafe()` rend n'est pas une promesse mais une requête PARESSEUSE, que
 * Drizzle configure ensuite (`.values()`, `.execute()`) et qui ne part qu'une
 * fois attendue. L'envelopper la remplace par un objet privé de ces méthodes,
 * et toute lecture échoue — en production comme ailleurs.
 *
 * On décore donc son `then`, et on rend la requête elle-même. Elle garde ses
 * méthodes, sa paresse, son type ; la mesure se déclenche quand elle se
 * résout, c'est-à-dire exactement quand la réponse revient du réseau.
 *
 * La requête n'est jamais journalisée — ni son texte, ni ses paramètres. Seule
 * sa DURÉE compte. Un `WHERE user_id = …` dans un journal, c'est une donnée
 * personnelle.
 */
function brancherCompteur(sql: postgres.Sql): void {
  const original = sql.unsafe.bind(sql);
  let premiere = true;

  // @ts-expect-error — on remplace volontairement la méthode par un décorateur
  // de même signature ; postgres.js ne l'expose pas autrement.
  sql.unsafe = (...args: Parameters<typeof original>) => {
    if (observateur) observateur.requetes += 1;

    const requete = original(...args);
    if (!traceActive()) return requete;

    if (premiere) {
      premiere = false;
      // La première requête d'une instance porte le coût d'ouverture de la
      // connexion : poignée de main TLS, authentification, `search_path`.
      // Les suivantes le trouvent déjà payé.
      noter("db_connexion", "première requête de l'instance");
    }

    const debut = performance.now();
    let mesuree = false;
    const finir = () => {
      if (mesuree) return;
      mesuree = true;
      noter("db", "requete", performance.now() - debut);
    };

    const attendre = requete.then.bind(requete);
    requete.then = ((ok?: never, ko?: never) =>
      attendre(
        (valeur) => { finir(); return ok ? (ok as (v: unknown) => unknown)(valeur) : valeur; },
        (erreur) => { finir(); if (ko) return (ko as (e: unknown) => unknown)(erreur); throw erreur; },
      )) as typeof requete.then;

    return requete;
  };
}

brancherCompteur(client);

export const db = drizzle(client, { schema });
