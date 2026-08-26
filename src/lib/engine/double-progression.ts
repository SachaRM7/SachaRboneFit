export interface LastSessionSets {
  sets: Array<{ numero: number; reps: number; charge: number; rpe?: number | null }>;
}

export interface ExerciseTarget {
  fourchetteRepsMin: number;
  fourchetteRepsMax: number;
  seriesCibles: number;
  incrementsPossibles: number[];
  /** RPE visé pour cet exercice. Sert de repère au-delà duquel on consolide. */
  rpeCible?: number | null;
}

export interface SuggestedSets {
  charge: number;
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
    const increment = target.incrementsPossibles[0] ?? 2.5;
    const nouvelleCharge = sets[0]!.charge + increment;
    const effortMaximal = moyenne !== null && moyenne >= RPE_LIMITE;

    return {
      charge: nouvelleCharge,
      reps: Array.from({ length: target.seriesCibles }, () => target.fourchetteRepsMin),
      fourchetteCompletee: true,
      messageProgression: effortMaximal
        ? `Fourchette complétée à RPE ${moyenne!.toFixed(1)} — +${increment} kg, ça va piquer`
        : `Fourchette complétée — +${increment} kg → ${nouvelleCharge} kg`,
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
