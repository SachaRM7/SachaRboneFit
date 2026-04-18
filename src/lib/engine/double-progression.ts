export interface LastSessionSets {
  sets: Array<{ numero: number; reps: number; charge: number }>;
}

export interface ExerciseTarget {
  fourchetteRepsMin: number;
  fourchetteRepsMax: number;
  seriesCibles: number;
  incrementsPossibles: number[];
}

export interface SuggestedSets {
  charge: number;
  reps: number[];
  fourchetteCompletee: boolean;
  messageProgression: string | null;
}

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
    };
  }

  const sets = lastSession.sets;
  const maxReps = target.fourchetteRepsMax;

  const allAtMax = sets.every((s) => s.reps >= maxReps);

  if (allAtMax) {
    const inc = target.incrementsPossibles[0] ?? 2.5;
    const newCharge = sets[0]!.charge + inc;
    return {
      charge: newCharge,
      reps: Array.from({ length: target.seriesCibles }, () => target.fourchetteRepsMin),
      fourchetteCompletee: true,
      messageProgression: `Fourchette complétée ! +${inc} kg → ${newCharge} kg`,
    };
  }

  // Trouver la première série qui n'est pas à max
  const firstNonMaxIndex = sets.findIndex((s) => s.reps < maxReps);
  const newReps = sets.map((s, i) => {
    if (i < firstNonMaxIndex) return s.reps;
    if (i === firstNonMaxIndex) return Math.min(s.reps + 1, maxReps);
    return s.reps;
  });

  return {
    charge: sets[0]!.charge,
    reps: newReps,
    fourchetteCompletee: false,
    messageProgression: null,
  };
}
