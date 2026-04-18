export interface ExerciseInTemplateWithDetails {
  exerciseInstanceId: string;
  exerciseInTemplateId: string;
  exerciseName: string;
  machineNom: string | null;
  categorieRole: "pilier" | "substitut" | "accessoire";
  seriesCibles: number;
  fourchetteRepsMin: number;
  fourchetteRepsMax: number;
  rpeCible: number;
  tempo: string;
  reposSecondes: number;
  incrementsPossibles: number[];
  musclesPrincipaux: string[];
}

export interface AdjustedExercise extends ExerciseInTemplateWithDetails {
  seriesAjustees: number;
}

export interface VolumeAdjustment {
  totalPct: number;
  raisons: string[];
  proposeDeloadImprovise: boolean;
  proposeReport: boolean;
  musclesAReporter: string[];
}

export function applyVolumeAdjustment(
  templateExercises: ExerciseInTemplateWithDetails[],
  adjustment: VolumeAdjustment,
): AdjustedExercise[] {
  const factor = 1 + adjustment.totalPct / 100;

  return templateExercises.map((ex) => {
    if (ex.categorieRole === "pilier") {
      return { ...ex, seriesAjustees: ex.seriesCibles };
    }
    const reduced = Math.ceil(ex.seriesCibles * factor);
    return { ...ex, seriesAjustees: Math.max(1, reduced) };
  });
}
