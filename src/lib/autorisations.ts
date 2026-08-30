/**
 * Qui a le droit de modifier quoi.
 *
 * Une salle et les exercices qu'on y trouve sont des faits communs : tous les
 * comptes les lisent, et personne ne doit re-saisir un parc déjà renseigné.
 * Mais les tenir à jour est un travail — aller voir sur place, relever les
 * incréments d'une pile, constater qu'un appareil a disparu. Ce travail a un
 * responsable : celui qui a créé la salle.
 *
 * D'où la règle, volontairement simple : **lecture commune, écriture au
 * créateur de la salle**. Elle ne code aucun identifiant en dur et vaut aussi
 * pour une salle qu'un autre compte créerait demain — il en serait le
 * responsable à son tour.
 *
 * L'appartenance d'un exercice de salle se lit sur la SALLE, jamais sur la
 * ligne elle-même : sinon le premier à corriger un réglage s'approprierait
 * l'entrée, et le responsable changerait à chaque modification.
 */

export interface SalleAvecProprietaire {
  userId: string | null;
}

export function peutGererLaSalle(
  salle: SalleAvecProprietaire | null | undefined,
  userId: string,
): boolean {
  if (!salle) return false;
  // Une salle sans créateur connu — il en existe d'anciennes — reste modifiable :
  // la verrouiller pour tout le monde n'aurait aucun bénéfice.
  if (salle.userId === null) return true;
  return salle.userId === userId;
}

/** Message unique : deux formulations différentes se seraient contredites. */
export const REFUS_GESTION_SALLE =
  "Cette salle est tenue à jour par le compte qui l'a créée. Tu peux la consulter et t'y entraîner.";
