/**
 * Le temps qui passe pendant une séance.
 *
 * L'onboarding demande une durée idéale et une durée maximale — 60 et 90
 * minutes par exemple — et rien n'en faisait quoi que ce soit. Pendant la
 * séance, aucun chronomètre ; à la fin, une modale annonçait « 105 min / cible
 * 60 min », puis « Temps OK après recalcul » et « Appliquer les coupes », sans
 * jamais dire ce qui serait coupé ni pourquoi.
 *
 * Ce module dit l'heure, et seulement l'heure. Il ne décide pas d'arrêter, ne
 * propose pas de coupe, et ne juge personne : dépasser sa durée idéale est une
 * décision légitime, pas une faute. Ce qui change au-delà, c'est l'information
 * dont on dispose pour choisir — et c'est l'athlète qui choisit.
 *
 * Les deux durées viennent du profil. Aucune constante n'est inventée ici : une
 * séance sans durée cible renseignée n'a pas de seuil du tout, et le chronomètre
 * se contente alors de compter.
 */

export type EtatDuree =
  /** En dessous de la cible : rien à signaler. */
  | "dans_les_temps"
  /** La cible approche. Une information, pas un avertissement. */
  | "cible_proche"
  /** Au-delà de la durée idéale. */
  | "cible_depassee"
  /** Le maximum approche. */
  | "maximum_proche"
  /** Au-delà de la durée maximale déclarée. */
  | "maximum_depasse";

export interface DureeDeLaSeance {
  ecouleeSecondes: number;
  etat: EtatDuree;
  /** Minutes restantes avant la cible. Négatif au-delà. `null` sans cible. */
  resteAvantCibleMinutes: number | null;
  resteAvantMaximumMinutes: number | null;
}

/**
 * À quelle distance d'un seuil commence-t-on à le regarder ?
 *
 * Cinq minutes. C'est le temps d'une série et de son repos : en deçà, prévenir
 * n'apporte plus rien puisqu'il n'y a plus de décision à prendre. La borne est
 * la même pour la cible et le maximum — un seul repère, pas deux à retenir.
 */
export const APPROCHE_MINUTES = 5;

export function dureeDeLaSeance(entree: {
  demarreeA: number;
  maintenant: number;
  dureeCibleMinutes?: number | null;
  dureeMaxMinutes?: number | null;
}): DureeDeLaSeance {
  const ecouleeSecondes = Math.max(0, Math.floor((entree.maintenant - entree.demarreeA) / 1000));
  const ecouleeMinutes = ecouleeSecondes / 60;

  const cible = valide(entree.dureeCibleMinutes);
  const max = valide(entree.dureeMaxMinutes);

  const resteAvantCibleMinutes = cible === null ? null : Math.round(cible - ecouleeMinutes);
  const resteAvantMaximumMinutes = max === null ? null : Math.round(max - ecouleeMinutes);

  return {
    ecouleeSecondes,
    etat: etatDe(ecouleeMinutes, cible, max),
    resteAvantCibleMinutes,
    resteAvantMaximumMinutes,
  };
}

function valide(minutes: number | null | undefined): number | null {
  return minutes != null && Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

/**
 * L'état le plus avancé qui soit vrai.
 *
 * Le maximum prime sur la cible : quand les deux sont franchis, c'est le
 * maximum qui informe. Un profil dont le maximum est mal renseigné — plus
 * petit que la cible — ne produit donc pas d'état incohérent.
 */
function etatDe(ecoulee: number, cible: number | null, max: number | null): EtatDuree {
  if (max !== null) {
    if (ecoulee >= max) return "maximum_depasse";
    if (ecoulee >= max - APPROCHE_MINUTES) return "maximum_proche";
  }
  if (cible !== null) {
    if (ecoulee >= cible) return "cible_depassee";
    if (ecoulee >= cible - APPROCHE_MINUTES) return "cible_proche";
  }
  return "dans_les_temps";
}

/**
 * Ce que l'état dit, en une phrase — sans jamais dire d'arrêter.
 *
 * « Tu dois arrêter » est exactement ce qu'une application ne peut pas savoir :
 * elle ignore si la séance d'aujourd'hui est celle qu'on a attendue toute la
 * semaine. Elle sait l'heure, elle la donne.
 */
export function messageDuree(d: DureeDeLaSeance): string | null {
  switch (d.etat) {
    case "dans_les_temps":
      return null;
    case "cible_proche":
      return `Ta durée idéale est dans ${Math.max(0, d.resteAvantCibleMinutes ?? 0)} min.`;
    case "cible_depassee":
      return `Tu es à ${Math.abs(d.resteAvantCibleMinutes ?? 0)} min au-delà de ta durée idéale.`;
    case "maximum_proche":
      return `Ta durée maximale est dans ${Math.max(0, d.resteAvantMaximumMinutes ?? 0)} min.`;
    case "maximum_depasse":
      return `Tu es à ${Math.abs(d.resteAvantMaximumMinutes ?? 0)} min au-delà de ta durée maximale.`;
  }
}

/**
 * L'intensité visuelle de l'information.
 *
 * Trois niveaux seulement, et ils suivent la même échelle que le reste du
 * carnet : rien, une note, un avertissement. La couleur du gain n'apparaît
 * jamais ici — le temps qui passe n'est pas un progrès.
 */
export type TonDuree = "neutre" | "note" | "avertissement";

export function tonDuree(etat: EtatDuree): TonDuree {
  switch (etat) {
    case "dans_les_temps":
      return "neutre";
    case "cible_proche":
    case "cible_depassee":
      return "note";
    case "maximum_proche":
    case "maximum_depasse":
      return "avertissement";
  }
}

/** « 1 h 05 » au-delà de l'heure, « 47 min » en deçà. */
export function formaterEcoulee(secondes: number): string {
  const minutes = Math.floor(secondes / 60);
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.floor(minutes / 60);
  const reste = minutes % 60;
  return `${heures} h ${reste.toString().padStart(2, "0")}`;
}
