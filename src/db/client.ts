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
 * `max_pipeline: 1` est distinct de `max`. Les services lancent parfois des
 * lectures avec `Promise.all` ; postgres.js les écrivait alors en pipeline
 * sur la même socket. Supavisor en mode transaction peut libérer le backend
 * avant d'avoir renvoyé toutes les réponses d'un pipeline, ce qui laisse le
 * client en attente avec une session PostgreSQL idle (`ClientRead`) jusqu'au
 * timeout. Un seul échange à la fois garde les mêmes lectures et supprime ce
 * protocole ambigu, sans ouvrir une deuxième connexion.
 *
 * `idle_timeout` NON PLUS, et c'est un revirement qu'il faut écrire.
 *
 * Il était passé de 20 à 120 secondes, au motif qu'« une instance ne garde
 * toujours qu'une connexion ». Le motif est vrai et la conclusion fausse. Ce
 * qui sature un pooler, ce n'est pas le nombre de connexions par instance :
 * c'est le nombre de connexions OUVERTES EN MÊME TEMPS, c'est-à-dire durée de
 * vie × nombre d'instances. En exécution serverless le second facteur n'est
 * pas borné, et six fois la durée, c'est jusqu'à six fois plus d'instances qui
 * tiennent encore la leur. Cette même PR rend en outre le préchargement de
 * Next actif — donc multiplie les instances concurrentes. Les deux facteurs
 * augmentaient ensemble, et l'`EMAXCONNSESSION` d'origine venait exactement de
 * là.
 *
 * La réouverture coûte réellement quelque chose — poignée de main TLS,
 * authentification, `search_path`, avant la première requête utile. Mais on ne
 * sait pas encore combien, ni à quelle fréquence elle arrive. La valeur reste
 * donc à 20, et l'instrumentation ci-dessous compte les réouvertures : c'est
 * elle qui dira si le jeu en vaut la chandelle, et à quel prix pour le pooler.
 */

/**
 * Y a-t-il une connexion ouverte à cet instant, dans cette instance.
 *
 * Faux au démarrage, et remis à faux à chaque fermeture par `idle_timeout`.
 * La requête qui le retrouve à faux est celle qui paie la réouverture.
 */
let connexionOuverte = false;

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
 * Instrumentation sans modifier les requêtes.
 *
 * `postgres.js` expose `debug` au moment où une requête est construite et
 * envoyée. C'est le point de comptage dont les tests ont besoin, sans
 * remplacer `sql.unsafe()` ni toucher à la Query paresseuse qu'elle renvoie.
 *
 * Une Query est une sous-classe de Promise avec ses propres méthodes
 * (`values()`, `execute()`, `cancel()`) et son propre protocole de démarrage.
 * Remplacer `.then` sur chaque instance pouvait intercepter l'assimilation
 * native d'une Promise, laisser une réponse non consommée et garder une
 * connexion Supavisor active. Le hook supporté ci-dessous ne reçoit que des
 * métadonnées d'envoi ; le texte et les paramètres sont délibérément ignorés.
 * La durée de la requête reste mesurée par les phases de service, pas par un
 * décorateur qui changerait le protocole de la Query.
 */
function debugPostgres(
  _connexion: number,
  _requete: string,
  _parametres: unknown[],
  _types: unknown[],
): void {
  // Les métadonnées sont reçues pour respecter la signature de postgres.js,
  // mais ne doivent jamais entrer dans les traces.
  void _connexion;
  void _requete;
  void _parametres;
  void _types;
  if (observateur) observateur.requetes += 1;
  if (!traceActive()) return;

  if (!connexionOuverte) {
    connexionOuverte = true;
    noter("db_connexion", "ouverture de connexion");
  }
  // Comptage au dispatch, sans SQL, paramètres ou identifiant de connexion.
  noter("db", "requete_envoyee");
}

/**
 * postgres.js 3.4 exposes `max_pipeline` at runtime but its published
 * TypeScript options omit it. Keep the cast local so the rest of the client
 * remains fully typed while retaining the upstream runtime option.
 */
type OptionsAvecPipeline = Parameters<typeof postgres>[1] & { max_pipeline: number };

const client = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  max: 1,
  max_pipeline: 1,
  idle_timeout: 20,
  connect_timeout: 10,
  debug: debugPostgres,
  // Une connexion vient de se fermer : la suivante repaiera l'ouverture. C'est
  // le seul signal qui permette de compter les réouvertures plutôt que de les
  // supposer.
  onclose: () => { connexionOuverte = false; },
} as OptionsAvecPipeline);

export const db = drizzle(client, { schema });
