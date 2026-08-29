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

/** Salles encore fréquentées. */
export function sallesActives(userId: string): SQL | undefined {
  return and(eq(gyms.userId, userId), isNull(gyms.archiveLe));
}

/** Machines d'un parc encore d'actualité. */
export function machinesActives(userId: string): SQL | undefined {
  return and(eq(exerciseInstances.userId, userId), isNull(exerciseInstances.archiveLe));
}

/** Blocs de programme encore en vigueur. */
export function blocsActifs(userId: string): SQL | undefined {
  return and(eq(programmeBlocs.userId, userId), isNull(programmeBlocs.archiveLe));
}
