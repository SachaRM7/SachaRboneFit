/**
 * Ce qui mérite d'être retenu, et ce qui n'est qu'un jour comme un autre.
 *
 * La mémoire du coach acceptait n'importe quelle observation. Sa description
 * disait bien « pour une régularité constatée, pas pour un fait ponctuel »,
 * mais une consigne dans un texte n'est pas une garantie : rien n'empêchait
 * d'enregistrer « il est fatigué aujourd'hui » comme préférence durable, puis
 * de le relire trois mois plus tard comme un trait de l'athlète.
 *
 * Une mémoire qui accumule tout devient une mémoire à laquelle on ne peut plus
 * se fier. Deux garde-fous, tous deux vérifiables :
 *
 * — un marqueur de ponctualité dans la phrase la disqualifie ;
 * — une observation déjà retenue à l'identique ne se réenregistre pas.
 *
 * Ces règles sont volontairement strictes : un refus se rattrape à la
 * conversation suivante, une mémoire fausse se traîne.
 */

/**
 * Marqueurs de ponctualité.
 *
 * Ils désignent un moment, pas une régularité. « Aujourd'hui il a mal à
 * l'épaule » est une observation du jour ; « il a régulièrement mal à
 * l'épaule sur les développés » est un fait durable.
 */
const MARQUEURS_PONCTUELS = [
  "aujourd'hui",
  "aujourd hui",
  "ce matin",
  "ce midi",
  "ce soir",
  "cette nuit",
  "hier",
  "avant-hier",
  "à l'instant",
  "a l'instant",
  "en ce moment",
  "cette séance",
  "cette seance",
  "la séance du jour",
  "la seance du jour",
  "sa dernière séance",
  "sa derniere seance",
  "machine occupée",
  "machine occupee",
];

/** Normalise pour comparer : accents, casse et espaces ne doivent pas décider. */
export function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface VerdictMemoire {
  retenue: boolean;
  /** Ce qu'on répond au modèle quand c'est refusé. */
  raison?: string;
}

/**
 * Cette observation mérite-t-elle d'être retenue durablement ?
 *
 * `existantes` est la liste des observations déjà retenues et non invalidées.
 */
export function verdictMemoire(
  observation: string,
  existantes: string[] = [],
): VerdictMemoire {
  const propre = observation.trim();
  if (propre.length < 10) {
    return { retenue: false, raison: "Observation trop courte pour être utile." };
  }

  const normalisee = normaliser(propre);

  const marqueur = MARQUEURS_PONCTUELS.find((m) => normalisee.includes(normaliser(m)));
  if (marqueur) {
    return {
      retenue: false,
      raison:
        `Cette observation décrit un moment (« ${marqueur} »), pas une régularité. ` +
        "Elle est déjà dans l'historique des séances ; la mémoire ne retient que ce qui reste vrai " +
        "d'une semaine à l'autre. Reformule-la comme une régularité si c'en est une.",
    };
  }

  if (existantes.some((e) => normaliser(e) === normalisee)) {
    return { retenue: false, raison: "Cette observation est déjà retenue à l'identique." };
  }

  return { retenue: true };
}
