import { and, eq, getTableName, isNull, sql, type SQL } from "drizzle-orm";
import { gyms, exerciseInstances, programmeBlocs, sessionLogs, setLogs } from "./schema";

/**
 * Filtres d'archivage.
 *
 * Archiver n'a de valeur que si le critère est appliqué partout : une seule
 * lecture qui l'oublie et les anciennes charges reviennent fausser une
 * suggestion. Le critère est donc écrit ici une fois, et les appelants
 * composent avec.
 *
 * Le choix de l'archivage plutôt que de la suppression tient à ce que les deux
 * questions sont distinctes : « qu'est-ce qui doit entrer dans le calcul
 * d'aujourd'hui » n'est pas « qu'est-ce qui a été fait ». Une reprise après
 * plusieurs mois répond non à la première et oui à la seconde.
 */

/** Séances de l'utilisateur qui comptent encore pour le moteur. */
export function seancesActives(userId: string): SQL | undefined {
  return and(eq(sessionLogs.userId, userId), isNull(sessionLogs.archiveLe));
}

/**
 * Une séance a-t-elle réellement eu lieu ?
 *
 * La ligne `session_logs` naît au DÉMARRAGE, pas à la fin. C'est délibéré : elle
 * porte le contexte du jour — feu biologique, ajustement de volume, état — et
 * elle permet de reprendre une séance après un rafraîchissement, une navigation
 * ou une reconnexion. Elle existe donc bien avant que quoi que ce soit ait été
 * soulevé.
 *
 * Le défaut tenait à ce que la moitié de l'application lisait cette ligne comme
 * la preuve d'une séance faite. Ouvrir l'écran de séance puis refermer le
 * téléphone suffisait : le tableau de bord annonçait « c'est fait pour
 * aujourd'hui », la semaine comptait une séance de plus, la rotation avançait
 * d'une lettre, la calibration croyait avoir de la matière. L'écran Progression,
 * lui, restait vide — parce qu'il partait des `set_logs`. Deux moitiés de
 * l'application ne racontaient pas le même entraînement.
 *
 * Le signal durable est la SÉRIE. Dans le runtime actuel, un `set_log` n'existe
 * qu'après une validation explicite : c'est la seule trace qui prouve que
 * quelque chose a été soulevé.
 *
 * `duree_minutes` ne convient pas comme preuve, malgré l'apparence. Elle dit que
 * la clôture a été demandée, pas qu'un effort a eu lieu — et la clôture pouvait
 * jusqu'ici être demandée sans une seule série.
 *
 *     réalisée <=> non archivée ET il existe au moins une série
 *
 * Ce prédicat ne remplace pas `seancesActives` : une séance ouverte et vide
 * reste ACTIVE — c'est ce qui permet de la reprendre — mais elle n'est pas
 * RÉALISÉE. Les deux notions sont distinctes et le restent.
 */
export function estUneSeanceRealisee(): SQL {
  return sql`${sessionLogs.archiveLe} is null and exists (
    select 1 from ${sql.identifier(getTableName(setLogs))} ${SERIE}
    where ${SERIE}.${colonne(setLogs.sessionLogId)} = ${sessionLogs.id}
  )`;
}

/**
 * Les séances d'un utilisateur qui comptent comme faites.
 *
 * L'isolation par compte s'ajoute au prédicat plutôt que d'être laissée à
 * l'appelant : c'est le couple des deux qui répond à « qu'est-ce que CETTE
 * personne a réellement fait », et les séparer, c'est offrir la possibilité de
 * n'en écrire qu'une moitié.
 */
export function seancesRealisees(userId: string): SQL {
  return sql`${sessionLogs.userId} = ${userId} and ${estUneSeanceRealisee()}`;
}

/**
 * Salles encore fréquentées.
 *
 * Une salle décrit un lieu, pas une personne : elle est commune à tous les
 * comptes. Le `user_id` qu'elle porte n'est qu'une trace de qui l'a saisie.
 */
export function sallesActives(): SQL | undefined {
  return isNull(gyms.archiveLe);
}

/**
 * Machines d'un parc encore d'actualité.
 *
 * Même raison que les salles : une machine est un objet physique posé dans un
 * lieu partagé. Filtrer par propriétaire obligeait le deuxième compte à
 * re-saisir un parc déjà renseigné, alors même que le constructeur de séance,
 * lui, lisait déjà tout le parc sans filtre.
 */
export function machinesActives(): SQL | undefined {
  return isNull(exerciseInstances.archiveLe);
}

/**
 * Machines sur lesquelles on peut s'entraîner AUJOURD'HUI.
 *
 * Deux retraits différents, deux durées. `archiveLe` retire durablement : la
 * salle a fermé, on a déménagé, l'appareil est parti. `etat` retire pour un
 * temps : le Glute Trainer est hors service, il reviendra. Confondre les deux
 * obligeait à archiver une machine en panne, puis à la recréer au retour — et
 * son historique se retrouvait coupé en deux entrées qui ne se parlent pas.
 *
 * L'entrée survit, son historique aussi, elle disparaît seulement du parc du
 * jour. Réactiver ne demande rien d'autre que de remettre `disponible`.
 */
export function machinesUtilisablesAujourdhui(): SQL | undefined {
  return and(
    isNull(exerciseInstances.archiveLe),
    eq(exerciseInstances.etat, "disponible"),
  );
}

/** Blocs de programme encore en vigueur. */
export function blocsActifs(userId: string): SQL | undefined {
  return and(eq(programmeBlocs.userId, userId), isNull(programmeBlocs.archiveLe));
}

/**
 * Séries qui comptent encore, quand la lecture PART des séries.
 *
 * `set_logs` n'a pas d'archivage à lui, et c'est volontaire : une série n'existe
 * pas hors de sa séance, alors elle suit le sort de sa séance. La règle est
 * donc :
 *
 *     une série est active <=> sa séance existe, appartient au bon compte,
 *                              et n'est pas archivée
 *
 * Tant qu'on lit dans le sens naturel — les séances, puis leurs séries — la
 * règle s'applique toute seule : `seancesActives` filtre en amont. Le piège est
 * la lecture inverse, celle qui part d'une INSTANCE pour retrouver son
 * historique : là, `set_logs` est la table de tête, la séance n'est plus dans la
 * requête, et il n'y a rien pour rappeler qu'elle devrait y être.
 *
 * C'est exactement par là que la séance de test a fui. Trois lectures partaient
 * de `set_logs` sans jamais nommer `session_logs` : l'historique servi au Coach,
 * la proposition de charge suivante, et la garde d'immutabilité des instances.
 * Aucune n'avait « oublié un filtre » au sens habituel — la table à filtrer
 * n'était pas là.
 *
 * D'où cette forme, un EXISTS plutôt qu'une jointure : elle se pose dans le
 * `where` d'une requête sur `set_logs` seule, sans rien changer aux colonnes
 * lues ni à la forme du résultat, et elle fonctionne aussi bien dans l'API
 * relationnelle (`db.query.setLogs.findMany`) que dans le constructeur de
 * `select`. Une jointure obligerait chaque appelant à la réécrire — c'est-à-dire
 * à pouvoir l'oublier.
 *
 * Quand la requête a DÉJÀ `session_logs` dans ses jointures — parce qu'elle a
 * besoin de la date, du feu, ou qu'elle part des séances —, on ne s'en sert pas :
 * `seancesActives(userId)` dans le `where` dit la même chose sans sous-requête.
 */
/**
 * La sous-requête corrélée, montée à la main plutôt qu'avec `${table}`.
 *
 * Drizzle réécrit les références de colonnes d'un fragment `sql` selon l'alias
 * de la requête qui l'accueille : dans `db.query.setLogs.findMany`, la table de
 * tête s'appelle `"setLogs"`, et `${sessionLogs.userId}` en ressortait comme
 * `"setLogs"."user_id"` — une colonne qui n'existe pas. La sous-requête porte
 * donc son propre alias, écrit explicitement, et seule la corrélation vers la
 * table de tête passe par une référence que Drizzle a le droit de résoudre.
 *
 * Les noms viennent du schéma et non de littéraux : renommer une colonne dans
 * `schema.ts` continue de se propager ici.
 */
const SEANCE = sql.identifier("seance_de_la_serie");
/** Même précaution d'alias, dans l'autre sens : la série vue depuis la séance. */
const SERIE = sql.identifier("serie_de_la_seance");
const colonne = (c: { name: string }) => sql.identifier(c.name);

function seanceDeLaSerie(): SQL {
  return sql`select 1 from ${sql.identifier(getTableName(sessionLogs))} ${SEANCE}
    where ${SEANCE}.${colonne(sessionLogs.id)} = ${setLogs.sessionLogId}
      and ${SEANCE}.${colonne(sessionLogs.archiveLe)} is null`;
}

export function seriesActives(userId: string): SQL {
  return sql`exists (${seanceDeLaSerie()} and ${SEANCE}.${colonne(sessionLogs.userId)} = ${userId})`;
}

/**
 * Séries encore vivantes, quel que soit le compte à qui elles appartiennent.
 *
 * Une seule question a besoin de cette variante : « des nombres ont-ils déjà été
 * enregistrés sur cet appareil ? ». Le parc est partagé entre les comptes d'un
 * même lieu, donc les séries d'un autre utilisateur figent la sémantique de
 * l'instance tout autant que les nôtres — relire une pile affichée comme un
 * poids total fausserait sa courbe à lui aussi.
 *
 * Partout ailleurs, cette fonction est le mauvais choix : un calcul sportif qui
 * ne borne pas le compte lit l'entraînement de quelqu'un d'autre.
 */
export function seriesNonArchivees(): SQL {
  return sql`exists (${seanceDeLaSerie()})`;
}
