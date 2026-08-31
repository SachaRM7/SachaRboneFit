import { prochaineCharge, type ConfigurationCharge } from "./charges";

export interface LastSessionSets {
  sets: Array<{ numero: number; reps: number; charge: number; rpe?: number | null }>;
}

export interface ExerciseTarget {
  fourchetteRepsMin: number;
  fourchetteRepsMax: number;
  seriesCibles: number;
  /**
   * Ce que l'appareil sait réellement produire.
   *
   * C'était `incrementsPossibles: number[]`, et ce module en lisait le PREMIER
   * élément — l'ordre de saisie faisait donc règle métier, pendant que la
   * calibration lisait le plus petit. Une seule primitive répond désormais aux
   * deux : `prochaineCharge`.
   */
  charge: ConfigurationCharge;
  /** RPE visé pour cet exercice. Sert de repère au-delà duquel on consolide. */
  rpeCible?: number | null;
}

export interface SuggestedSets {
  /**
   * `null` quand l'appareil n'est pas assez décrit pour qu'une charge suivante
   * existe. La séance reste faisable — c'est la prescription qui se tait.
   */
  charge: number | null;
  reps: number[];
  fourchetteCompletee: boolean;
  messageProgression: string | null;
  /** Vrai quand on répète la séance précédente au lieu d'ajouter du travail. */
  consolidation: boolean;
}

/**
 * Au-delà de ce RPE, la série était déjà maximale : on ne charge pas davantage.
 * En deçà, la progression suit la double progression classique.
 */
const RPE_LIMITE = 9.5;

function rpeMoyen(sets: LastSessionSets["sets"]): number | null {
  const valeurs = sets.map((s) => s.rpe).filter((r): r is number => typeof r === "number");
  if (valeurs.length === 0) return null;
  return valeurs.reduce((n, r) => n + r, 0) / valeurs.length;
}

/**
 * Double progression : on remplit la fourchette de répétitions, puis on ajoute
 * de la charge et on redescend en bas de fourchette.
 *
 * Le RPE entre désormais dans la décision. Il était saisi à chaque série, stocké,
 * et lu par aucun module : compléter la fourchette à RPE 10 et à RPE 7
 * déclenchait exactement la même augmentation.
 *
 * Deux règles s'ajoutent :
 * - fourchette complétée à un RPE déjà maximal → on charge quand même (c'est le
 *   principe), mais le message le signale : la prochaine séance sera dure ;
 * - fourchette NON complétée à un RPE maximal → on ne demande pas une répétition
 *   de plus, on répète la même séance. Ajouter du travail sur un effort déjà
 *   maximal ne produit pas de progression, seulement de la fatigue.
 */
export function computeNextSets(
  lastSession: LastSessionSets | null,
  target: ExerciseTarget,
): SuggestedSets {
  if (!lastSession || lastSession.sets.length === 0) {
    return {
      charge: 0,
      reps: Array.from({ length: target.seriesCibles }, () => target.fourchetteRepsMin),
      fourchetteCompletee: false,
      messageProgression: null,
      consolidation: false,
    };
  }

  const sets = lastSession.sets;
  const maxReps = target.fourchetteRepsMax;
  const moyenne = rpeMoyen(sets);
  const toutesAuMax = sets.every((s) => s.reps >= maxReps);

  if (toutesAuMax) {
    const suite = prochaineCharge(target.charge, sets[0]!.charge);
    const effortMaximal = moyenne !== null && moyenne >= RPE_LIMITE;
    const assistance = target.charge.natureCharge === "assistance";
    const repsDeDepart = Array.from(
      { length: target.seriesCibles },
      () => target.fourchetteRepsMin,
    );

    // L'appareil n'a pas été mesuré : on ne fabrique pas un « +2,5 kg »
    // plausible. La fourchette est complétée, on le dit, et la charge reste à
    // décider sur place.
    if (suite.statut === "indeterminable") {
      return {
        charge: null,
        reps: sets.map((s) => s.reps),
        fourchetteCompletee: true,
        messageProgression:
          "Fourchette complétée — les sauts de charge de cet appareil ne sont pas renseignés, "
          + "à toi de choisir le cran suivant",
        consolidation: false,
      };
    }

    // Butée : la pile ne monte pas plus haut, ou il ne reste plus d'assistance
    // à retirer. Ajouter du travail ici demande de changer d'exercice, pas de
    // charge.
    if (suite.statut === "butee") {
      return {
        charge: suite.valeur,
        reps: sets.map((s) => s.reps),
        fourchetteCompletee: true,
        messageProgression: assistance
          ? "Plus aucune assistance à retirer — l'exercice se fait au poids du corps"
          : `Fourchette complétée, mais l'appareil est en butée à ${suite.valeur} — il faudra en changer`,
        consolidation: false,
      };
    }

    const pas = Math.abs(suite.delta ?? 0);

    return {
      charge: suite.valeur,
      reps: repsDeDepart,
      fourchetteCompletee: true,
      messageProgression: assistance
        ? `Fourchette complétée — assistance ${suite.valeur} au lieu de ${sets[0]!.charge}, tu portes ${pas} de plus`
        : effortMaximal
          ? `Fourchette complétée à RPE ${moyenne!.toFixed(1)} — +${pas} kg, ça va piquer`
          : `Fourchette complétée — +${pas} kg → ${suite.valeur} kg`,
      consolidation: false,
    };
  }

  // Effort déjà maximal sans avoir rempli la fourchette : on répète à l'identique.
  if (moyenne !== null && moyenne >= RPE_LIMITE) {
    return {
      charge: sets[0]!.charge,
      reps: sets.map((s) => s.reps),
      fourchetteCompletee: false,
      messageProgression: `RPE ${moyenne.toFixed(1)} la dernière fois — on refait la même, sans ajouter`,
      consolidation: true,
    };
  }

  // Sinon : une répétition de plus sur la première série qui n'est pas au maximum.
  const premiereNonMax = sets.findIndex((s) => s.reps < maxReps);
  const nouvellesReps = sets.map((s, i) =>
    i === premiereNonMax ? Math.min(s.reps + 1, maxReps) : s.reps,
  );

  return {
    charge: sets[0]!.charge,
    reps: nouvellesReps,
    fourchetteCompletee: false,
    messageProgression: null,
    consolidation: false,
  };
}
