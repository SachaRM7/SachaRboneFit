/**
 * Les nombres et les unités, écrits en français.
 *
 * `toString()` produit « 24180 » et « 25.4 » : ce sont des sorties de machine.
 * En français le millier se sépare, la décimale est une virgule, et une unité
 * se détache du nombre par une espace insécable — « 82 kg », jamais « 82kg »,
 * et jamais une coupure de ligne entre les deux.
 *
 * Cette fonction vivait en double, dans l'écran Progression et nulle part
 * ailleurs : les autres écrans affichaient les nombres bruts.
 */

/**
 * Espace insécable étroite (U+202F).
 *
 * Écrite en échappement plutôt qu'en caractère : les deux espaces insécables
 * sont invisibles et indiscernables dans un éditeur, et le fichier en mêlait
 * deux — U+00A0 devant les unités, U+202F dans les milliers produits par
 * `Intl`. Deux espaces différentes dans la même phrase se voient au rendu.
 */
const INSECABLE = "\u202f";

export function nombre(valeur: number, decimales = 0): string {
  return valeur.toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimales,
  });
}

/**
 * Un nombre suivi de son unité, liés par une espace insécable.
 *
 * `kg`, `min`, `%` : l'unité ne doit jamais se retrouver seule en début de
 * ligne.
 */
export function avecUnite(valeur: number, unite: string, decimales = 0): string {
  return `${nombre(valeur, decimales)}${INSECABLE}${unite}`;
}

/** Un pourcentage signé, tel qu'on l'écrit dans une progression. */
export function pourcentage(valeur: number, decimales = 1, signe = false): string {
  const prefixe = signe && valeur > 0 ? "+" : "";
  return `${prefixe}${nombre(valeur, decimales)}${INSECABLE}%`;
}

/**
 * Accorde un nom au pluriel.
 *
 * Le pluriel se décide sur la valeur affichée : « 1 séance », « 2 séances »,
 * et « 0 séance » — en français, zéro reste au singulier.
 */
export function pluriel(n: number, singulier: string, pluriel_ = `${singulier}s`): string {
  return Math.abs(n) > 1 ? pluriel_ : singulier;
}

/**
 * « 3 séances », accordé et formaté d'un coup.
 *
 * Espace ordinaire ici : l'insécable étroite sert à coller une unité à son
 * nombre, pas à souder un nom au chiffre qui le compte.
 */
export function compte(n: number, singulier: string, pluriel_ = `${singulier}s`): string {
  return `${nombre(n)} ${pluriel(n, singulier, pluriel_)}`;
}
