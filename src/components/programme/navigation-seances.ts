/**
 * Passer d'une séance à l'autre, au doigt.
 *
 * L'édition avancée dépliait TOUT : quatre séances, chacune avec ses exercices,
 * chacun avec ses séries, ses répétitions, son effort, son tempo et son repos.
 * Sur un téléphone, ça donne un ruban de plusieurs écrans où l'on ne sait plus
 * quelle séance on modifie — et où corriger la séance D suppose de faire défiler
 * A, B et C à chaque fois.
 *
 * Une séance à la fois, donc, et deux façons d'en changer : les onglets, ou le
 * glissement. Ce module ne porte que la seconde, parce que c'est la seule partie
 * où l'on peut se tromper sans le voir.
 *
 * Le piège tient en une phrase : la page défile verticalement. Un geste destiné
 * au défilement ne doit jamais changer d'onglet, sinon on perd sa place en
 * lisant. D'où deux conditions cumulatives — une distance minimale, et une
 * dominante horizontale franche — plutôt qu'une comparaison `|dx| > |dy|` qui
 * déclencherait sur le moindre biais du pouce.
 */

/** En dessous, c'est une hésitation ou un appui, pas un geste. */
export const DISTANCE_MINIMALE = 48;

/**
 * Combien le geste doit être plus horizontal que vertical.
 *
 * À 1, un glissement en diagonale à 46° changerait d'onglet. Un pouce qui
 * remonte la page décrit rarement une verticale parfaite : la marge est là
 * pour que le défilement reste du défilement.
 */
export const DOMINANCE_HORIZONTALE = 1.5;

export type Direction = "precedente" | "suivante";

/** Le geste, ou rien. `null` veut dire « laisse la page tranquille ». */
export function directionDuGeste(dx: number, dy: number): Direction | null {
  if (Math.abs(dx) < DISTANCE_MINIMALE) return null;
  if (Math.abs(dx) < Math.abs(dy) * DOMINANCE_HORIZONTALE) return null;
  // Glisser vers la GAUCHE fait avancer : le contenu suit le doigt.
  return dx < 0 ? "suivante" : "precedente";
}

/**
 * L'index après le geste. Il bute aux extrémités, il ne boucle pas.
 *
 * Boucler de la dernière séance à la première ferait passer de D à A par un
 * geste « suivante », ce qui ressemble à un retour en arrière. Aux extrémités,
 * ne rien faire est l'information : il n'y a rien de plus dans cette direction.
 */
export function indexApresGeste(index: number, direction: Direction, total: number): number {
  if (total <= 0) return 0;
  const vise = direction === "suivante" ? index + 1 : index - 1;
  return Math.min(total - 1, Math.max(0, vise));
}

/**
 * L'index à retenir quand la liste change sous les pieds.
 *
 * Supprimer la dernière séance, ou en ajouter une, laisse un index qui peut
 * désigner le vide. Sans ce recadrage, l'écran affiche « aucune séance » alors
 * qu'il en reste trois.
 */
export function indexValide(index: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(total - 1, Math.max(0, index));
}
