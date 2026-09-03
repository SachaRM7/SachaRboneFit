import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { noter, phase, traceActive } from "@/lib/mesure/trace";

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
 * Le compteur s'intercale entre Drizzle et postgres.js.
 *
 * Le logger de Drizzle se fixe à la construction et ne donne pas de durée ;
 * `pg_stat_database` est alimenté de façon différée. Drizzle appelle
 * `unsafe()` sur le client sous-jacent pour chaque requête : c'est le point de
 * passage obligé, et le seul qui compte exactement ce qui part sur le réseau.
 *
 * La requête elle-même n'est jamais journalisée — ni son texte, ni ses
 * paramètres. Seule sa DURÉE compte, avec le nom de l'appelant quand il est
 * connu. Un `WHERE user_id = …` dans un journal, c'est une donnée personnelle.
 */
function brancherCompteur(sql: postgres.Sql): void {
  if (!traceActive()) return;

  const original = sql.unsafe.bind(sql);
  let premiere = true;

  // @ts-expect-error — on remplace volontairement la méthode par un décorateur
  // de même signature ; postgres.js ne l'expose pas autrement.
  sql.unsafe = (...args: Parameters<typeof original>) => {
    const promesse = original(...args);
    if (premiere) {
      premiere = false;
      // La première requête d'une instance porte le coût d'ouverture de la
      // connexion : poignée de main TLS, authentification, `search_path`.
      // Les suivantes le trouvent déjà payé.
      noter("db_connexion", "première requête de l'instance");
    }
    return phase("db", "requete", () => promesse) as typeof promesse;
  };
}

brancherCompteur(client);

export const db = drizzle(client, { schema });
