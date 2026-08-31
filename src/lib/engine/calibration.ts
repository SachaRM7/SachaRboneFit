import { estimer1RM as estimer1RMReference, REPS_EFFECTIVES_MAXIMALES } from "./records";
import { chargeAtteignable, type ConfigurationCharge } from "./charges";

/**
 * Calibration d'une reprise.
 *
 * Après plusieurs mois d'arrêt, l'ancien niveau ne dit plus rien d'utile : ni
 * les charges, ni surtout le volume tolérable. Chercher un maximum n'aurait pas
 * de sens non plus — on ne teste pas les limites d'un corps déconditionné pour
 * apprendre ce que quelques séries prudentes révèlent aussi bien.
 *
 * Ce module ne cherche donc pas une performance. Il déduit une charge de
 * travail à partir de séries menées loin de l'échec, et il dit à quel point il
 * y croit. Une estimation issue d'un seul essai à cinq répétitions en réserve
 * ne vaut pas une estimation issue de trois essais convergents.
 */

export interface EssaiCalibration {
  charge: number;
  reps: number;
  /** « Combien aurais-tu pu en faire de plus ? » — 0 à 5, 5 signifiant « au moins cinq ». */
  rirRapporte: number;
}

export interface CibleTravail {
  reps: number;
  rir: number;
}

export type Confiance = "faible" | "correcte" | "bonne";

export interface EstimationCharge {
  /**
   * `null` quand l'appareil n'a pas été assez décrit pour qu'une charge soit
   * atteignable. On ne renvoie pas un chiffre par défaut : une donnée
   * manquante empêche une prescription précise, elle ne s'invente pas.
   */
  charge: number | null;
  confiance: Confiance;
  motif: string;
}

/**
 * Au-delà, l'estimation de la réserve n'est plus fiable : personne ne distingue
 * correctement « il m'en restait cinq » de « il m'en restait huit ».
 */
const RIR_PLAFOND_FIABLE = 4;

/**
 * Maximum théorique estimé à partir d'une série menée en réserve.
 *
 * Les répétitions effectives sont celles réalisées augmentées de celles qui
 * restaient : une série de 10 à RIR 3 informe autant qu'une série de 13 menée
 * à l'échec, sans en payer le prix.
 *
 * Le calcul n'est plus refait ici : c'est la définition de référence, appelée
 * sur le type d'entrée propre à la calibration. Les deux implémentations
 * étaient identiques au caractère près — deux copies exactes finissent
 * toujours par cesser de l'être.
 */
export function estimer1RM(essai: EssaiCalibration): number {
  return estimer1RMReference({
    date: "",
    charge: essai.charge,
    reps: essai.reps,
    rir: essai.rirRapporte,
  });
}

/** Charge théorique pour une cible donnée, à partir d'un maximum estimé. */
function chargePourCible(unRM: number, cible: CibleTravail): number {
  const effectives = Math.min(cible.reps + cible.rir, REPS_EFFECTIVES_MAXIMALES);
  return unRM / (1 + effectives / 30);
}

/**
 * Arrondi à ce que la machine sait réellement produire.
 *
 * Le calcul vivait ici, en `Math.min(...increments)`, quand la double
 * progression lisait `incrementsPossibles[0]` : deux lectures du même tableau,
 * deux charges différentes sur la même machine. La résolution est désormais
 * unique — `chargeAtteignable` — et elle connaît les paliers, le plancher et le
 * plafond que ce module ignorait.
 *
 * Le repli à 2,5 kg disparaît : sans incréments mesurés, on ne propose rien
 * plutôt qu'un chiffre supposé. L'appelant reçoit `null` et le dit.
 */
export function arrondirAIncrement(
  charge: number,
  config: ConfigurationCharge,
): number | null {
  return chargeAtteignable(config, charge).valeur;
}

/**
 * Charge à proposer pour la série suivante d'une calibration.
 *
 * Tant qu'on est loin de la cible, on avance franchement ; en approchant, par
 * petits pas. Monter trop vite ferait rater la fenêtre, monter trop lentement
 * userait la séance en essais.
 */
export function chargeSuivante(
  essai: EssaiCalibration,
  cible: CibleTravail,
  config: ConfigurationCharge,
): number | null {
  const ecart = essai.rirRapporte - cible.rir;

  // Le rapport de charge découle de la différence de répétitions effectives :
  // c'est la même formule que l'estimation, appliquée à l'écart constaté.
  const facteur = ecart === 0
    ? 1
    : chargePourCible(estimer1RM(essai), cible) / essai.charge;

  // On borne la progression : au-delà, on quitterait la zone observée pour
  // extrapoler, ce qui est précisément ce qu'une calibration doit éviter.
  const borne = Math.min(Math.max(facteur, 0.8), 1.2);
  return arrondirAIncrement(essai.charge * borne, config);
}

/**
 * Charge de travail retenue à l'issue d'une calibration.
 *
 * On ne moyenne pas les essais : les premiers sont volontairement trop légers
 * et fausseraient le résultat. On retient l'estimation médiane des essais
 * exploitables, plus robuste qu'une moyenne à un essai aberrant près.
 */
export function chargeDeTravail(
  essais: EssaiCalibration[],
  cible: CibleTravail,
  config: ConfigurationCharge,
): EstimationCharge {
  const exploitables = essais.filter(
    (e) => e.charge > 0 && e.reps > 0 && e.rirRapporte <= RIR_PLAFOND_FIABLE,
  );

  if (exploitables.length === 0) {
    const echauffement = essais.filter((e) => e.charge > 0);
    if (echauffement.length === 0) {
      return { charge: 0, confiance: "faible", motif: "aucun essai exploitable" };
    }
    // Tous les essais étaient trop légers pour informer : on repart de la
    // charge la plus lourde vue, franchement majorée.
    const plusLourde = Math.max(...echauffement.map((e) => e.charge));
    const majoree = arrondirAIncrement(plusLourde * 1.15, config);
    return {
      charge: majoree,
      confiance: "faible",
      motif: majoree === null
        ? "incréments inconnus sur cet appareil : aucune charge à proposer"
        : "toutes les séries étaient loin de l'échec",
    };
  }

  const estimations = exploitables.map(estimer1RM).sort((a, b) => a - b);
  const milieu = Math.floor(estimations.length / 2);
  const median = estimations.length % 2 === 0
    ? (estimations[milieu - 1]! + estimations[milieu]!) / 2
    : estimations[milieu]!;

  const charge = arrondirAIncrement(chargePourCible(median, cible), config);

  // La confiance tient au nombre d'essais et à leur accord. Deux estimations
  // qui divergent de 15 % ne fondent pas une certitude.
  const dispersion = estimations.length > 1
    ? (estimations[estimations.length - 1]! - estimations[0]!) / median
    : 1;

  let confiance: Confiance = "faible";
  let motif = "un seul essai exploitable";
  if (exploitables.length >= 3 && dispersion < 0.12) {
    confiance = "bonne";
    motif = `${exploitables.length} essais concordants`;
  } else if (exploitables.length >= 2 && dispersion < 0.2) {
    confiance = "correcte";
    motif = `${exploitables.length} essais, dispersion mesurée`;
  } else if (exploitables.length >= 2) {
    motif = `${exploitables.length} essais divergents`;
  }

  if (charge === null) {
    return {
      charge: null,
      confiance: "faible",
      motif: "incréments inconnus sur cet appareil : aucune charge à proposer",
    };
  }

  return { charge, confiance, motif };
}

// ---------------------------------------------------------------------------
// Tolérance au volume
// ---------------------------------------------------------------------------

export interface ExpositionObservee {
  /** Séries réalisées sur le muscle lors de cette exposition. */
  series: number;
  /** Courbature signalée le lendemain, 0-10. */
  courbatureLendemain: number;
  /** La séance suivante sur ce muscle a-t-elle vu les performances tenir ? */
  performanceSuivanteTenue: boolean | null;
}

export interface ToleranceMuscle {
  /** 1 à 5, comme les pastilles affichées à l'utilisateur. */
  niveau: 1 | 2 | 3 | 4 | 5;
  /** Séries hebdomadaires que le muscle absorbe actuellement. */
  seriesRecommandees: number;
  observations: number;
  motif: string;
}

/** En deçà, on n'a pas vu assez d'expositions pour conclure quoi que ce soit. */
const OBSERVATIONS_MINIMALES = 2;

/** Courbature au-delà de laquelle l'exposition a manifestement trop coûté. */
const COURBATURE_EXCESSIVE = 6;

/** Courbature en deçà de laquelle le muscle en redemande. */
const COURBATURE_LEGERE = 3;

/**
 * Ce qu'un muscle absorbe réellement, observé plutôt que supposé.
 *
 * C'est le renseignement que la calibration apporte et que l'ancien niveau ne
 * donne pas : savoir qu'on presse tel poids est moins utile que savoir combien
 * de séries de quadriceps on encaisse sans se traîner trois jours.
 */
export function toleranceVolume(expositions: ExpositionObservee[]): ToleranceMuscle {
  const valides = expositions.filter((e) => e.series > 0);

  if (valides.length < OBSERVATIONS_MINIMALES) {
    return {
      niveau: 3,
      // Repère prudent tant que rien n'est observé : il sera remplacé, pas
      // défendu.
      seriesRecommandees: 10,
      observations: valides.length,
      motif: "pas encore assez d'expositions pour conclure",
    };
  }

  const moyenneSeries = valides.reduce((t, e) => t + e.series, 0) / valides.length;
  const moyenneCourbature =
    valides.reduce((t, e) => t + e.courbatureLendemain, 0) / valides.length;
  const chutes = valides.filter((e) => e.performanceSuivanteTenue === false).length;

  // Le volume observé est le point de départ ; les signaux le corrigent.
  let recommandees = moyenneSeries;
  const motifs: string[] = [];

  if (moyenneCourbature >= COURBATURE_EXCESSIVE || chutes > valides.length / 2) {
    recommandees = moyenneSeries * 0.75;
    motifs.push(
      moyenneCourbature >= COURBATURE_EXCESSIVE
        ? `courbatures moyennes ${moyenneCourbature.toFixed(1)}/10`
        : "performances en recul après exposition",
    );
  } else if (moyenneCourbature <= COURBATURE_LEGERE && chutes === 0) {
    recommandees = moyenneSeries * 1.25;
    motifs.push("récupération franche entre les expositions");
  } else {
    motifs.push("volume absorbé sans signal négatif");
  }

  const arrondi = Math.max(4, Math.round(recommandees));
  const niveau = Math.min(5, Math.max(1, Math.ceil(arrondi / 5))) as 1 | 2 | 3 | 4 | 5;

  return {
    niveau,
    seriesRecommandees: arrondi,
    observations: valides.length,
    motif: motifs.join(", "),
  };
}

// ---------------------------------------------------------------------------

export type NiveauReprise =
  | "debutant"
  | "intermediaire_deconditionne"
  | "intermediaire"
  | "avance";

/**
 * Niveau de reprise, tel qu'il sert à choisir un point de départ.
 *
 * Une longue interruption ne ramène pas un pratiquant expérimenté au niveau
 * d'un débutant : ses schémas moteurs reviennent vite, sa tolérance au volume
 * beaucoup moins. C'est cette dissociation que la catégorie
 * « intermédiaire déconditionné » nomme, et elle appelle une progression rapide
 * sur les charges, prudente sur le volume.
 */
export function niveauDeReprise(entrees: {
  moisDInterruption: number;
  anneesDePratique: number;
}): NiveauReprise {
  const { moisDInterruption, anneesDePratique } = entrees;

  if (anneesDePratique < 1) return "debutant";
  if (moisDInterruption >= 2) {
    return anneesDePratique >= 3 ? "intermediaire_deconditionne" : "debutant";
  }
  return anneesDePratique >= 5 ? "avance" : "intermediaire";
}
