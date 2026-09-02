/**
 * L'ordre dans lequel l'utilisateur a voulu les choses.
 *
 * Un écran qui enregistre tout seul envoie une requête par modification. Deux
 * modifications rapprochées mettent donc deux requêtes en vol en même temps, et
 * le serveur les reçoit dans l'ordre que le réseau lui impose — pas dans celui
 * où elles ont été formées. Il faut donc dire explicitement, dans la requête,
 * QUAND l'intention a été formée ; sans quoi la base ne peut pas trancher, et
 * « la dernière arrivée » n'est pas « la plus récente ».
 *
 * L'horodatage vient du client, et c'est délibéré : le serveur ne connaît que
 * l'instant de réception, qui est précisément la valeur trompeuse. Le prix à
 * payer est l'horloge du poste — deux appareils très désynchronisés
 * résoudraient un conflit selon leurs horloges plutôt que selon le temps réel.
 * Pour une note personnelle attachée à un compte, c'est le bon compromis : les
 * seules écritures en concurrence sont celles de la même personne, presque
 * toujours depuis le même téléphone, et la sémantique voulue est bien « la plus
 * récente selon la pendule de l'utilisateur ».
 *
 * Deux propriétés sont nécessaires, et l'horloge murale n'en donne qu'une :
 *
 *   croissante          `Date.now()` avance — sauf remise à l'heure du système,
 *                       d'où le `max` ci-dessous.
 *   strictement         deux modifications dans la même milliseconde
 *                       produiraient le même nombre, et la seconde ne gagnerait
 *                       pas. Le `+ 1` l'assure.
 *
 * Repartir de l'horloge murale (et non d'un compteur à zéro) est ce qui permet
 * de survivre à un rechargement de page : un compteur redémarré à 1 serait
 * inférieur à ce qui est déjà en base, et TOUTES les écritures suivantes
 * seraient rejetées comme périmées.
 */
export interface HorlogeDIntention {
  (): number;
}

/**
 * Une horloge indépendante. Utile aux tests, qui doivent pouvoir maîtriser le
 * temps sans que deux scénarios se partagent un compteur.
 */
export function creerHorlogeDIntention(maintenant: () => number = Date.now): HorlogeDIntention {
  let dernier = 0;
  return () => {
    dernier = Math.max(maintenant(), dernier + 1);
    return dernier;
  };
}

/**
 * L'horloge de l'onglet. Partagée entre tous les champs de la page, pour que
 * deux champs différents produisent des intentions comparables entre elles.
 */
export const prochaineIntention: HorlogeDIntention = creerHorlogeDIntention();
