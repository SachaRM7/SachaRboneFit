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
 * Le pooler Supavisor en mode transaction n'accepte pas de façon fiable les
 * requêtes pipelinées : une navigation interrompue peut laisser une réponse
 * en attente côté client et retenir la connexion jusqu'au timeout Vercel.
 * `max_pipeline: 0` désactive le pipeline au niveau du protocole, ce qui est
 * la seule garantie utile quand plusieurs arbres RSC lisent en même temps.
 *
 * postgres.js 3.4 a toutefois un détail surprenant : son `sql.begin` récupère
 * la connexion dans le callback `onexecute`, lequel n'est jamais appelé quand
 * le pipeline vaut zéro. Le client de lecture utilise donc une transaction
 * manuelle sur un second client réservé (lui aussi sans pipeline) ; cela
 * conserve le comportement transactionnel de Drizzle sans réintroduire de
 * requêtes simultanées sur la connexion de lecture.
 *
 * `fetch_types: false` évite en plus la requête automatique de postgres.js
 * vers `pg_catalog.pg_type` à chaque nouvelle connexion. Le schéma de
 * l'application ne renvoie pas de tableaux PostgreSQL natifs : ses listes
 * sont des colonnes `jsonb`, déjà décodées par le parseur intégré. Il n'y a
 * donc aucune information métier à perdre en supprimant cette introspection.
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

type ClientSql = ReturnType<typeof postgres>;
type ReservedSql = Awaited<ReturnType<ClientSql["reserve"]>>;
type ScopeSql = ReservedSql & {
  savepoint: (...args:
    | [((sql: ScopeSql) => unknown)]
    | [string, (sql: ScopeSql) => unknown]
  ) => Promise<unknown>;
  prepare: (name: string) => Promise<ScopeSql>;
};

function optionsAvecPipeline(maxPipeline: number): OptionsAvecPipeline {
  return {
    prepare: false,
    max: 1,
    max_pipeline: maxPipeline,
    fetch_types: false,
    idle_timeout: 20,
    connect_timeout: 10,
    debug: debugPostgres,
    // Une connexion vient de se fermer : la suivante repaiera l'ouverture. C'est
    // le seul signal qui permette de compter les réouvertures plutôt que de les
    // supposer.
    onclose: () => { connexionOuverte = false; },
  };
}

const url = process.env.DATABASE_URL!;

/**
 * Client principal : toutes les lectures passent par une connexion sans
 * pipeline. Le client transactionnel reste paresseux et ne s'ouvre qu'au
 * premier `db.transaction`, puis réserve sa connexion pendant tout le bloc.
 */
const client = postgres(url, optionsAvecPipeline(0));
const clientTransaction = postgres(url, optionsAvecPipeline(0));

let reveilTransaction: Promise<void> | null = null;

async function reserverTransaction(): Promise<ReservedSql> {
  // `reserve()` ne réveille pas une connexion fraîche avec max_pipeline=0 dans
  // postgres.js 3.4. Une requête de chauffe fait passer le client dans l'état
  // `open`; elle n'est exécutée qu'une fois par instance et ne touche aucune
  // table métier.
  if (!reveilTransaction) {
    reveilTransaction = clientTransaction.unsafe("select 1").then(() => undefined).catch((error) => {
      reveilTransaction = null;
      throw error;
    });
  }
  await reveilTransaction;
  return clientTransaction.reserve();
}

function nomDePointDeSauvegarde(nom: string): string {
  return `"${nom.replace(/"/g, '""')}"`;
}

function creerScope(
  connexion: ReservedSql,
  compteur: { valeur: number },
  preparation: { nom: string | null },
): ScopeSql {
  const scope = connexion as ScopeSql;
  scope.prepare = async (nom: string) => {
    preparation.nom = nom.replace(/[^a-z0-9$-_. ]/gi, "");
    return scope;
  };
  scope.savepoint = async (...args) => {
    const nom = typeof args[0] === "function" ? `s${compteur.valeur++}` : args[0];
    const callback = typeof args[0] === "function" ? args[0] : args[1];
    if (!callback) throw new Error("Une fonction est requise pour ouvrir un savepoint.");
    const identifiant = nomDePointDeSauvegarde(nom);

    await connexion.unsafe(`savepoint ${identifiant}`);
    try {
      const resultat = await callback(scope);
      return Array.isArray(resultat) ? Promise.all(resultat) : resultat;
    } catch (error) {
      await connexion.unsafe(`rollback to savepoint ${identifiant}`);
      throw error;
    }
  };
  return scope;
}

type FonctionTransaction = (scope: ScopeSql) => unknown | Promise<unknown>;

/**
 * Équivalent minimal de `sql.begin` pour un client dont le pipeline est nul.
 * Le contrat attendu par Drizzle est conservé : callback, options facultatives,
 * rollback automatique, savepoints imbriqués et libération de la connexion.
 */
async function beginSansPipeline(
  optionsOuFonction: string | FonctionTransaction,
  fonctionEventuelle?: FonctionTransaction,
): Promise<unknown> {
  const options = typeof optionsOuFonction === "string" ? optionsOuFonction : "";
  const fonction = typeof optionsOuFonction === "function" ? optionsOuFonction : fonctionEventuelle;
  if (!fonction) throw new Error("Une fonction est requise pour ouvrir une transaction.");

  const connexion = await reserverTransaction();
  const preparation = { nom: null as string | null };
  const scope = creerScope(connexion, { valeur: 0 }, preparation);
  let validee = false;

  try {
    const optionsNettoyees = options.replace(/[^a-z ]/gi, "");
    await connexion.unsafe(`begin ${optionsNettoyees}`);
    const resultat = await fonction(scope);
    const resultatResolu = Array.isArray(resultat) ? await Promise.all(resultat) : await resultat;
    if (preparation.nom) {
      await connexion.unsafe(`prepare transaction '${preparation.nom.replace(/'/g, "''")}'`);
    } else {
      await connexion.unsafe("commit");
    }
    validee = true;
    return resultatResolu;
  } catch (error) {
    if (!validee) {
      try {
        await connexion.unsafe("rollback");
      } catch {
        // La connexion peut déjà avoir été fermée par le pooler : l'erreur
        // d'origine est plus utile au service appelant.
      }
    }
    throw error;
  } finally {
    connexion.release();
  }
}

// Drizzle appelle `client.begin`; on lui donne le même contrat public que
// postgres.js, avec l'implémentation sans pipeline ci-dessus.
client.begin = beginSansPipeline as ClientSql["begin"];

export const db = drizzle(client, { schema });
