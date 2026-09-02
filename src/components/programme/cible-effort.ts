import { CHOIX_RESERVE, reserveVersRpe, rpeVersReserve } from "@/lib/engine/reserve";

/**
 * La cible d'effort d'un exercice programmé : ce qui se choisit, ce qui se
 * stocke, ce qui s'affiche.
 *
 * Deux problèmes se rejoignaient ici.
 *
 * Le premier : l'éditeur imposait une cible. Son menu s'ouvrait sur « RPE 8 »
 * sans option vide, donc tout exercice ajouté à la main partait avec une
 * prescription que personne n'avait formulée. Une cible non prescrite est un
 * état légitime — le Coach en produit déjà —, il lui manquait seulement de
 * pouvoir être choisi.
 *
 * Le second : le RPE ne se demande pas. Personne ne sait dire « 7,5 » de
 * lui-même ; tout le monde sait dire « je m'arrête à 2 reps de la fin ». La
 * réserve est donc ce qui s'affiche et se choisit, le RPE ce qui se stocke —
 * la base, le moteur et l'historique continuent de parler la même langue.
 *
 * La conversion est celle qui existe déjà (`reserveVersRpe`), pas une seconde
 * table de correspondance : deux conversions qui divergent d'un demi-point
 * suffiraient à faire mentir l'historique.
 */

/** Valeur du menu quand aucune cible n'est prescrite. */
export const NON_PRESCRIT = "non-prescrit";

export interface ChoixCibleEffort {
  /** Ce que porte le `<SelectItem>`. */
  valeur: string;
  libelle: string;
}

function libelleReserve(reserve: number): string {
  // Zéro et un prennent le singulier : « 0 rep en réserve », pas « 0 reps ».
  return reserve <= 1 ? `${reserve} rep en réserve` : `${reserve} reps en réserve`;
}

/**
 * Les options du menu, dans l'ordre où elles s'offrent.
 *
 * « Non prescrit » vient en premier PARCE QUE c'est le défaut : le premier
 * élément d'une liste est ce qu'on choisit sans y penser, et ne rien prescrire
 * doit être ce qu'on obtient sans y penser.
 *
 * Les réserves descendent ensuite de la plus large à la plus serrée : 5 reps
 * en réserve est l'effort le plus modeste, 0 le plus dur. L'ordre du menu suit
 * donc l'effort qui monte, pas le nombre qui monte.
 */
export const CHOIX_CIBLE_EFFORT: ChoixCibleEffort[] = [
  { valeur: NON_PRESCRIT, libelle: "Non prescrit" },
  ...[...CHOIX_RESERVE]
    .sort((a, b) => b - a)
    .map((reserve) => ({ valeur: String(reserve), libelle: libelleReserve(reserve) })),
];

/**
 * Du menu vers la base.
 *
 * Le repli est `null`, jamais 8. Une valeur inconnue veut dire qu'on ne sait
 * pas ce que la personne a voulu prescrire ; inventer une cible à sa place
 * est exactement le défaut que ce module corrige.
 */
export function cibleDepuisChoix(valeur: string | null | undefined): number | null {
  if (valeur == null || valeur === NON_PRESCRIT) return null;
  const reserve = Number(valeur);
  if (!Number.isFinite(reserve)) return null;
  return reserveVersRpe(reserve);
}

/**
 * De la base vers le menu.
 *
 * Une cible déjà enregistrée doit se retrouver sélectionnée à l'ouverture,
 * sans quoi la modifier reviendrait à la ressaisir de mémoire.
 */
export function choixDepuisCible(rpeCible: number | null | undefined): string {
  const reserve = rpeVersReserve(rpeCible);
  return reserve === null ? NON_PRESCRIT : String(reserve);
}

/**
 * Ce qui s'affiche à côté d'un exercice programmé.
 *
 * Une ligne sans cible ne portait rien du tout, ce qui se lisait comme un
 * oubli d'affichage plutôt que comme une décision. Elle le dit maintenant, en
 * une ligne discrète — l'écran de programme est déjà dense.
 */
export function libelleCibleEffort(rpeCible: number | null | undefined): string {
  const reserve = rpeVersReserve(rpeCible);
  return reserve === null ? "Effort : non prescrit" : `Effort : ${libelleReserve(reserve)}`;
}
