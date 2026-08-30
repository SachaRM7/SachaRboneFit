/**
 * Saisie de nombres dans un formulaire.
 *
 * Le champ garde le TEXTE tapé, y compris vide. Stocker un nombre rendait le
 * zéro ineffaçable : vider le champ donnait `Number("") || 0`, donc 0, que
 * React réaffichait aussitôt — et taper 4 par-dessus produisait « 04 ».
 *
 * La conversion attend l'envoi, et un champ vide retombe sur une valeur par
 * défaut plausible plutôt que sur zéro, qui se ferait refuser par le serveur.
 */

/** Ne laisse passer que des chiffres, longueur bornée. */
export function chiffresSeulement(valeur: string, maxCaracteres = 3): string {
  return valeur.replace(/[^0-9]/g, "").slice(0, maxCaracteres);
}

/** Un champ vide vaut le défaut, jamais zéro. */
export function nombre(valeur: string, defaut: number): number {
  const propre = valeur.trim();
  if (propre === "") return defaut;
  const n = Number(propre);
  return Number.isFinite(n) ? n : defaut;
}

/**
 * Une fourchette de fréquence cohérente : minimum ≤ objectif ≤ maximum.
 * Le serveur le refuse déjà ; le dire ici évite d'aller jusqu'au bout d'un
 * formulaire pour se voir opposer une erreur à la dernière étape.
 */
export function fourchetteCoherente(min: number, cible: number, max: number): boolean {
  return min <= cible && cible <= max;
}
