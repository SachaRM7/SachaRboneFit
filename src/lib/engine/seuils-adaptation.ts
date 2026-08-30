import type { NiveauFidelite } from "./adaptation-lieu";

/**
 * Ce qui décide qu'une adaptation est bonne, passable, ou insuffisante.
 *
 * Ces seuils vivaient dispersés dans le moteur d'adaptation, en constantes
 * privées et en conditions écrites à la main. Les regrouper ici a deux effets :
 * on peut les régler sans relire l'algorithme, et surtout on peut lire, en un
 * endroit, ce que l'application considère comme une séance encore fidèle.
 *
 * Trois niveaux, et rien entre les deux :
 *
 *   équivalente   — le stimulus prévu est intact. Mêmes muscles, même profil
 *                   de tension, même volume. Ce n'est pas la même séance sur
 *                   le papier, c'en est une qui produit le même effet.
 *   dégradée      — le travail est fait, mais il a bougé. Un angle différent,
 *                   un exercice du même pilier plutôt que du même profil, un
 *                   exercice perdu sur plusieurs. Acceptable, et à dire.
 *   insuffisante  — ce qui reste n'est plus la séance prévue. On ne la
 *                   présente pas comme adaptée : on propose d'en construire
 *                   une autre.
 */

export type QualiteAdaptation = "equivalente" | "degradee" | "insuffisante";

export interface SeuilsAdaptation {
  /** Part de la séance qu'on accepte de perdre avant de parler d'insuffisance. */
  partPerdueToleree: number;
  /** Perdre entièrement un pilier prévu suffit à déclarer l'insuffisance. */
  pilierPerduEstBloquant: boolean;
  /**
   * Niveaux de fidélité qui préservent le stimulus.
   * Au-delà, le travail se déplace : même muscle mais autre angle, ou même
   * pilier seulement.
   */
  niveauxEquivalents: readonly NiveauFidelite[];
  /** Part de la séance qu'on accepte de voir dégradée sans le signaler. */
  partDegradeeToleree: number;
}

export const SEUILS_ADAPTATION: SeuilsAdaptation = {
  partPerdueToleree: 1 / 3,
  pilierPerduEstBloquant: true,
  niveauxEquivalents: ["conserve", "meme_exercice", "profil_identique"],
  // Zéro : dès qu'un exercice change d'angle de travail, l'utilisateur doit le
  // savoir. Ce n'est pas un défaut, c'est une information.
  partDegradeeToleree: 0,
};

export const LIBELLES_QUALITE: Record<QualiteAdaptation, string> = {
  equivalente: "Adaptation équivalente",
  degradee: "Adaptation dégradée mais acceptable",
  insuffisante: "Adaptation insuffisante",
};

export const EXPLICATIONS_QUALITE: Record<QualiteAdaptation, string> = {
  equivalente:
    "Mêmes muscles, même profil de tension, même volume. La séance produit le stimulus prévu.",
  degradee:
    "Le travail est fait, mais il a bougé : angle différent ou exercice du même pilier. Utilisable.",
  insuffisante:
    "Ce qui reste n'est plus la séance prévue. Mieux vaut en construire une autre.",
};

export interface EntreeQualite {
  total: number;
  niveaux: NiveauFidelite[];
  retires: number;
  piliersPerdus: string[];
  seuils?: SeuilsAdaptation;
}

export interface ResultatQualite {
  qualite: QualiteAdaptation;
  motifs: string[];
}

export function qualiteAdaptation(e: EntreeQualite): ResultatQualite {
  const s = e.seuils ?? SEUILS_ADAPTATION;
  const motifs: string[] = [];

  const partPerdue = e.total > 0 ? e.retires / e.total : 0;
  if (partPerdue > s.partPerdueToleree) {
    motifs.push(`${e.retires} exercice${e.retires > 1 ? "s" : ""} sur ${e.total} sans équivalent ici.`);
  }
  if (s.pilierPerduEstBloquant && e.piliersPerdus.length > 0) {
    motifs.push(`Plus rien ne travaille : ${e.piliersPerdus.join(", ")}.`);
  }
  if (motifs.length > 0) return { qualite: "insuffisante", motifs };

  const degrades = e.niveaux.filter((n) => !s.niveauxEquivalents.includes(n));
  const partDegradee = e.total > 0 ? degrades.length / e.total : 0;
  if (partDegradee > s.partDegradeeToleree || e.retires > 0) {
    if (degrades.length > 0) {
      motifs.push(
        `${degrades.length} exercice${degrades.length > 1 ? "s" : ""} travaillé${degrades.length > 1 ? "s" : ""} sous un angle différent.`,
      );
    }
    if (e.retires > 0) {
      motifs.push(`${e.retires} exercice${e.retires > 1 ? "s" : ""} retiré${e.retires > 1 ? "s" : ""}.`);
    }
    return { qualite: "degradee", motifs };
  }

  return { qualite: "equivalente", motifs: [] };
}
