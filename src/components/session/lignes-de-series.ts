import { slotsARemplir, type LigneeSlot, type SerieSaisie } from "@/lib/live/vue-live";

/**
 * Quelles lignes le tableau de séries affiche, et lesquelles s'enlèvent.
 *
 * DEUX QUESTIONS QU'IL NE FAUT PAS CONFONDRE
 *
 *   « que reste-t-il à faire ? »  →  `slotsARemplir`, dans `lib/live/vue-live`
 *   « qu'est-ce que j'affiche ? » →  `lignesAAfficher`, ici
 *
 * Les confondre a coûté une série. Le Live passait le résultat de
 * `slotsARemplir` au tableau comme s'il s'agissait de la liste des lignes à
 * rendre. Or ce résultat rétrécit à chaque validation — c'est sa raison d'être.
 * Sur un Deadlift à deux séries, valider S1 la retirait des slots libres, donc
 * du rendu : le compteur affichait bien 1/2, mais la ligne S1 avait disparu de
 * la carte, et avec elle tout moyen de relire ou corriger ce qu'on venait
 * d'enregistrer. Constaté sur iPhone, en séance.
 *
 * Une série validée ne devient jamais inaccessible. Elle peut se compacter,
 * perdre ses champs de saisie, céder la vedette à la série en cours — elle
 * reste visible et modifiable.
 *
 * CE QUE `lignesAAfficher` RÉUNIT
 *
 *   1. les numéros déjà saisis SUR L'ENTRÉE COURANTE — ce qu'on a fait ici ;
 *   2. les slots que la lignée doit encore remplir — ce qu'il reste à faire ;
 *   3. les lignes ajoutées à la main au-delà de la prescription.
 *
 * Le point 1 se limite volontairement à l'entrée courante. Après une
 * substitution A → B, la série 1 faite sur A occupe bien le slot 1 — B ne la
 * redemande donc pas — mais elle n'est pas une série de B : l'afficher sur la
 * carte de B en ferait une performance de la machine B, que personne n'y a
 * réalisée. L'historique de A dit la vérité, et il la garde.
 *
 * Le geste inverse — retirer une ligne ajoutée en trop — vit dans le même
 * fichier parce qu'il décrit la même chose : la ligne qu'on propose de retirer
 * doit être exactement celle que le calcul fera disparaître.
 */

export interface EtatDesLignes {
  /** Ce que le moteur a décidé. Une suppression n'y touche JAMAIS. */
  seriesCibles: number;
  /** Les lignes ajoutées à la main, au-delà de la prescription. */
  seriesEnPlus: number;
  /** L'entrée affichée. Seules ses séries à elle deviennent des lignes. */
  instanceCourante: string;
  /** Le slot de prescription et les entrées qui l'ont occupé. */
  lignee: LigneeSlot;
  /** Le brouillon de la séance — toutes entrées confondues. */
  series: SerieSaisie[];
}

/**
 * Les numéros de série que la carte rend, dans l'ordre croissant.
 *
 * L'ordre est numérique et non lexicographique : la série 10 vient après la 9,
 * ce que `Array.prototype.sort` sans comparateur ne fait pas.
 */
export function lignesAAfficher({
  seriesCibles,
  seriesEnPlus,
  instanceCourante,
  lignee,
  series,
}: EtatDesLignes): number[] {
  const rendues = new Set<number>();

  // 1. Ce qui a été saisi ici. Y compris au-delà de la prescription : une
  //    quatrième série réalisée reste une série réalisée.
  for (const s of series) {
    if (s.exerciseInstanceId === instanceCourante) rendues.add(s.numeroSerie);
  }

  // 2. Ce que la lignée doit encore remplir, numéros d'origine conservés.
  for (const n of slotsARemplir(lignee, series, seriesCibles)) rendues.add(n);

  // 3. Les lignes ouvertes à la main, encore vides.
  for (let i = 1; i <= seriesEnPlus; i += 1) rendues.add(seriesCibles + i);

  /*
   * Le plancher d'une ligne, et pourquoi il est conditionnel.
   *
   * Un exercice sans aucune série prescrite doit tout de même offrir une ligne,
   * sinon rien ne s'y saisit. Mais un exercice DONT LE SLOT EST PLEIN doit
   * pouvoir rendre zéro ligne : c'est ainsi que la carte d'une machine
   * substituée après trois séries sur trois n'invente pas une quatrième
   * demande, et que l'écran peut afficher « exercice terminé » au lieu d'un
   * formulaire vide.
   */
  if (rendues.size === 0 && seriesCibles <= 0) rendues.add(1);

  return [...rendues].sort((a, b) => a - b);
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
  const lignes = lignesAAfficher(etat);
  const derniere = lignes[lignes.length - 1];
  return derniere !== undefined && derniere > etat.seriesCibles
    ? derniere
    : null;
}
