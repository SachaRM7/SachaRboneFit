/**
 * Ce qui a été prescrit, et ce qui a réellement été fait.
 *
 * Trois signaux existaient à moitié dans la base : l'effort visé et l'effort
 * déclaré, le tempo prescrit et son respect, le repos prescrit et le repos
 * observé. Aucun n'était rapproché de son pendant. Deux séances de 3×8 à 50 kg
 * y étaient donc rigoureusement identiques, qu'elles aient été menées au RPE
 * prévu ou à l'échec, tempo tenu ou expédié, repos prévu ou doublé.
 *
 * Ce module rapproche, et s'arrête là.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE FAIT PAS, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Pas de verdict « respecté / non respecté ». Un écart de RPE non nul ne dit
 * pas qu'une consigne a été trahie : à partir de quel écart ? Aucune donnée du
 * dépôt ne fonde ce seuil, et l'inventer donnerait à une convention l'autorité
 * d'une mesure.
 *
 * Pas de score, pas d'agrégat, pas de « équivalente / dégradée / insuffisante ».
 * Trois de ces quatre faits n'ont pas de seuil justifiable ; les combiner
 * fabriquerait une précision qui n'existe pas.
 *
 * Pas de conséquence sur la progression. `computeNextSets` n'appelle rien
 * d'ici, et la règle de complétion de volume — une montée de charge exige
 * toutes les séries attendues — reste seule à décider. Ce module la CITE pour
 * l'exposer au Coach ; il ne la rejoue pas.
 *
 * L'inconnu est un état de plein droit. `null` ne devient jamais une valeur par
 * défaut, jamais un zéro, jamais un « oui ». Un signal absent ne change rien —
 * ni la charge, ni les records, ni la progression.
 */

/** Trois états, et le troisième n'est pas une absence de réponse : c'en est une. */
export type Complet = "complete" | "incomplete" | "inconnu";

/**
 * Le volume prescrit a-t-il été fait ?
 *
 * Même sémantique que la double progression : `series_cibles` de la séance de
 * référence, donc le nombre APRÈS les adaptations déterministes de volume. Une
 * réduction décidée par le moteur est une prescription légitime.
 */
export interface FaitVolume {
  attendues: number | null;
  realisees: number;
  etat: Complet;
}

/**
 * L'effort visé et l'effort déclaré, et l'écart entre les deux.
 *
 * Tout est en RPE : `session_plan_items.rpe_cible` et `set_logs.rpe_effectif`
 * sont dans la même unité, donc l'écart est une soustraction. L'écran demande
 * une RÉSERVE et convertit à la saisie — c'est une ergonomie, pas une seconde
 * unité.
 *
 * Le signe est conservé : `+1` (plus dur que prévu) et `−1` (plus facile) sont
 * deux informations différentes, et les confondre dans une valeur absolue
 * perdrait exactement ce qui intéresse.
 */
export interface FaitEffort {
  rpeCible: number | null;
  rpeReel: number | null;
  /** `rpeReel − rpeCible`. `null` dès que l'un des deux manque. */
  ecartRpe: number | null;
}

/**
 * Le tempo prescrit a-t-il été tenu ?
 *
 * `false` seulement si l'athlète l'a signalé lui-même. `true` est accepté quand
 * la base en porte un — la colonne existe depuis l'origine — mais rien ne le
 * produit aujourd'hui, et surtout rien ne l'infère : un tempo non commenté
 * reste inconnu, jamais respecté.
 */
export interface FaitTempo {
  prescrit: string | null;
  /** `null` = rien n'a été dit. C'est le cas courant, et il est légitime. */
  respecte: boolean | null;
}

/**
 * Le repos prescrit et le repos observé.
 *
 * L'observation est mesurée entre la validation de la série précédente et celle
 * de la série courante. Elle contient donc le repos ET l'exécution de la série :
 * c'est un INTERVALLE ENTRE SÉRIES, pas un repos au sens strict. La colonne
 * historique s'appelle `repos_reel_secondes` et garde son nom — la renommer
 * coûterait une migration pour un gain nul —, mais ce qu'elle mesure est écrit
 * ici plutôt que supposé ailleurs.
 *
 * La première série d'un exercice n'a rien avant elle : son observation est
 * `null`, et c'est juste.
 */
export interface FaitRepos {
  prescritSecondes: number | null;
  observeSecondes: number | null;
  ecartSecondes: number | null;
  /** Écart relatif au prescrit, en pourcentage, arrondi à l'unité. */
  ecartPourcent: number | null;
}

export interface ExecutionReelle {
  volume: FaitVolume;
  effort: FaitEffort;
  tempo: FaitTempo;
  repos: FaitRepos;
}

/** Une valeur exploitable, par opposition à un trou ou à un nombre absurde. */
function nombre(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Moyenne des valeurs renseignées. `null` si aucune ne l'est. */
function moyenne(valeurs: Array<number | null | undefined>): number | null {
  const utiles = valeurs.map(nombre).filter((v): v is number => v !== null);
  if (utiles.length === 0) return null;
  return utiles.reduce((t, v) => t + v, 0) / utiles.length;
}

/** Deux décimales : au-delà, on afficherait une précision que la saisie n'a pas. */
function arrondi(v: number, decimales = 2): number {
  const f = 10 ** decimales;
  return Math.round(v * f) / f;
}

export function faitVolume(entrees: {
  attendues: number | null | undefined;
  realisees: number;
}): FaitVolume {
  const attendues = nombre(entrees.attendues);
  // Un nombre attendu nul ou négatif ne décrit rien : c'est de l'inconnu, pas
  // une exigence satisfaite d'avance.
  if (attendues === null || attendues <= 0) {
    return { attendues: null, realisees: entrees.realisees, etat: "inconnu" };
  }
  return {
    attendues,
    realisees: entrees.realisees,
    etat: entrees.realisees >= attendues ? "complete" : "incomplete",
  };
}

export function faitEffort(entrees: {
  rpeCible: number | null | undefined;
  /** Les RPE des séries de cet exercice. La moyenne des valeurs renseignées. */
  rpeReels: Array<number | null | undefined>;
}): FaitEffort {
  const cible = nombre(entrees.rpeCible);
  const reel = moyenne(entrees.rpeReels);
  return {
    rpeCible: cible,
    rpeReel: reel === null ? null : arrondi(reel),
    ecartRpe: cible === null || reel === null ? null : arrondi(reel - cible),
  };
}

export function faitTempo(entrees: {
  prescrit: string | null | undefined;
  /** Ce que portent les séries. `true` n'est jamais déduit, seulement lu. */
  respects: Array<boolean | null | undefined>;
}): FaitTempo {
  const prescrit = entrees.prescrit?.trim() || null;
  const dits = entrees.respects.filter((r): r is boolean => typeof r === "boolean");

  // Un seul signalement suffit : on ne moyenne pas des booléens, et « une série
  // hors tempo » est l'information, pas « la majorité l'était ».
  let respecte: boolean | null = null;
  if (dits.length > 0) respecte = dits.every((r) => r);

  return { prescrit, respecte };
}

export function faitRepos(entrees: {
  prescritSecondes: number | null | undefined;
  /** Une entrée par série. La première d'un exercice vaut `null` par nature. */
  observations: Array<number | null | undefined>;
}): FaitRepos {
  const prescrit = nombre(entrees.prescritSecondes);
  const observe = moyenne(entrees.observations);

  const prescritUtile = prescrit !== null && prescrit > 0 ? prescrit : null;
  const ecart = prescritUtile === null || observe === null ? null : observe - prescritUtile;

  return {
    prescritSecondes: prescrit,
    observeSecondes: observe === null ? null : Math.round(observe),
    ecartSecondes: ecart === null ? null : Math.round(ecart),
    // Rapporté au prescrit. Un prescrit nul ne donne pas un écart infini : il
    // donne un écart inconnu.
    ecartPourcent: ecart === null ? null : Math.round((ecart / prescritUtile!) * 100),
  };
}

/**
 * Les quatre faits d'un exercice dans une séance donnée.
 *
 * Volontairement sans agrégat : l'appelant reçoit quatre réponses distinctes et
 * en fait ce qu'il veut. Aucune n'est dérivée d'une autre.
 */
export function executionReelle(entrees: {
  seriesAttendues: number | null | undefined;
  rpeCible: number | null | undefined;
  tempoPrescrit: string | null | undefined;
  reposPrescritSecondes: number | null | undefined;
  series: Array<{
    rpe?: number | null;
    tempoRespecte?: boolean | null;
    reposReelSecondes?: number | null;
  }>;
}): ExecutionReelle {
  return {
    volume: faitVolume({ attendues: entrees.seriesAttendues, realisees: entrees.series.length }),
    effort: faitEffort({ rpeCible: entrees.rpeCible, rpeReels: entrees.series.map((s) => s.rpe) }),
    tempo: faitTempo({
      prescrit: entrees.tempoPrescrit,
      respects: entrees.series.map((s) => s.tempoRespecte),
    }),
    repos: faitRepos({
      prescritSecondes: entrees.reposPrescritSecondes,
      observations: entrees.series.map((s) => s.reposReelSecondes),
    }),
  };
}
