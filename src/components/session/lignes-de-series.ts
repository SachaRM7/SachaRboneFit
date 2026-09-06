/**
 * Combien de lignes le tableau de séries affiche, et lesquelles s'enlèvent.
 *
 * Un appui de trop sur « Ajouter une série hors prescription » faisait
 * apparaître une troisième ligne vide que RIEN ne pouvait retirer. Elle est
 * restée toute la séance du 6 septembre.
 *
 * Le calcul vivait au milieu du rendu, en une expression ; le geste inverse
 * n'existait pas. Les deux sont ici, ensemble, parce qu'ils décrivent la même
 * chose et doivent rester d'accord : la ligne qu'on propose de retirer doit
 * être exactement celle que le calcul fera disparaître.
 */

export interface EtatDesLignes {
  /** Ce que le moteur a décidé. Une suppression n'y touche JAMAIS. */
  seriesCibles: number;
  /** Les lignes ajoutées à la main, au-delà de la prescription. */
  seriesEnPlus: number;
  /** Les numéros déjà validés — ils tiennent la ligne même sans compteur. */
  numerosSaisis: number[];
}

export function nombreDeLignes({ seriesCibles, seriesEnPlus, numerosSaisis }: EtatDesLignes): number {
  return Math.max(seriesCibles + seriesEnPlus, ...numerosSaisis, 1);
}

/**
 * La dernière ligne ajoutée à la main, ou `null` s'il n'y en a aucune.
 *
 * Seule la dernière s'enlève, et c'est un choix : retirer une ligne du milieu
 * laisserait un trou dans la numérotation des séries — la série 3 succédant à
 * la série 1 — ou obligerait à renuméroter des séries déjà enregistrées, ce
 * qui réécrirait l'historique pour corriger une faute de frappe.
 */
export function derniereLigneRetirable(etat: EtatDesLignes): number | null {
  const total = nombreDeLignes(etat);
  return total > etat.seriesCibles ? total : null;
}
