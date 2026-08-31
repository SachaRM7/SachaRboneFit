import { and, eq, isNull, type SQL } from "drizzle-orm";
import { gyms, exerciseInstances, programmeBlocs, sessionLogs } from "./schema";

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
