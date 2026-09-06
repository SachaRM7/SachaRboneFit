/**
 * D'où viennent les illustrations, et lesquelles on accepte de montrer.
 *
 * En ouvrant la démonstration de `Cable Crunch` pendant la séance du
 * 6 septembre, trois dessins se sont succédé qui ne racontaient pas le même
 * mouvement : deux tracés fins, et au milieu une figure entièrement ombrée,
 * dans un autre style, accompagnée d'un petit objet flottant en bas à droite.
 * L'animation faisait donc alterner deux rendus différents du même exercice.
 *
 * PROVENANCE — vérifiée, pas supposée
 *
 * Les 120 dossiers de `public/exercices/` viennent de
 * [workout-guide](https://github.com/bryllim/workout-guide) par Bryl Lim,
 * d'après [Everkinetic](https://github.com/everkinetic/data), sous licence
 * CC BY-SA 4.0. C'est écrit au README et c'est exact.
 *
 * Ce qui MANQUE, et qui explique qu'on ne puisse pas trancher tout seul : rien
 * n'associe un dossier à l'exercice source dont il provient. Le nom du dossier
 * est notre slug, pas celui de la source. Impossible, donc, de vérifier
 * mécaniquement qu'un dossier contient bien trois vues d'un seul mouvement.
 *
 * CE QUI A ÉTÉ VÉRIFIÉ, ET COMMENT
 *
 * Douze slugs ont été rendus et regardés — pas devinés. La taille des fichiers
 * a d'abord servi de piste, puis a été écartée : `hanging-leg-raise` présente
 * le même écart de poids entre ses images et reste parfaitement cohérent. Le
 * corpus contient légitimement DEUX styles de tracé, l'un fin, l'autre ombré,
 * et beaucoup d'exercices ont une image intermédiaire plus détaillée que ses
 * voisines. Ce n'est pas un défaut.
 *
 * Un seul slug MÉLANGE les deux styles à l'intérieur de sa propre séquence :
 * `cable-crunch`. C'est le défaut signalé, et le seul retrouvé.
 *
 * CE QUI N'A PAS ÉTÉ VÉRIFIÉ
 *
 * Les 108 autres slugs n'ont pas été regardés un par un. Ils ne sont donc ni
 * déclarés bons ni déclarés mauvais : ils sont non vérifiés, et ce fichier le
 * dit plutôt que de prétendre le contraire. Aucun SVG n'a été généré, retouché
 * ou remplacé — montrer un geste inventé serait pire que ne rien montrer.
 */

/** Ce qu'on sait d'un dossier d'illustrations qui s'écarte du cas normal. */
export interface AnomalieIllustration {
  /** Ce qui a été observé, en clair. */
  constat: string;
  /**
   * Les images à ne pas afficher, par numéro.
   *
   * Retirer plutôt que remplacer : les images restantes viennent de la même
   * source, sous la même licence, et décrivent le même mouvement.
   */
  imagesEcartees: number[];
}

export const ANOMALIES_ILLUSTRATIONS: Record<string, AnomalieIllustration> = {
  "cable-crunch": {
    constat:
      "L'image 2 est d'un autre style de tracé que les images 1 et 3 — figure " +
      "ombrée contre tracé fin — et porte un objet isolé sans rapport avec le " +
      "mouvement. Les images 1 et 3 forment, elles, un aller-retour cohérent.",
    imagesEcartees: [2],
  },
};

/**
 * Les images réellement affichables pour un exercice, dans l'ordre.
 *
 * Renvoie un tableau vide quand il ne reste pas de quoi montrer quelque chose
 * d'honnête : l'appelant n'affiche alors rien. Une illustration absente se
 * remarque à peine ; une illustration fausse s'imite devant la machine.
 */
export function imagesAffichables(slug: string, nbFrames = 3): number[] {
  const toutes = Array.from({ length: nbFrames }, (_, i) => i + 1);
  const ecartees = ANOMALIES_ILLUSTRATIONS[slug]?.imagesEcartees ?? [];
  return toutes.filter((n) => !ecartees.includes(n));
}

/**
 * La séquence d'animation : aller, puis retour, sans répéter les extrémités.
 *
 * Elle décrit un mouvement, pas une boucle — et elle se construit sur les
 * images RETENUES, ce qui est tout l'objet de ce module : une image écartée ne
 * doit pas revenir par l'animation.
 */
export function sequenceAnimation(images: number[]): number[] {
  if (images.length < 2) return images;
  return [...images, ...images.slice(1, -1).reverse()];
}
