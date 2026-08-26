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

/** Ordre dans lequel on sacrifie des series : les accessoires d'abord, en finissant par la fin de seance. */
const PRIORITE_COUPE: Record<ExerciseInTemplateWithDetails["categorieRole"], number> = {
  accessoire: 0,
  substitut: 1,
  pilier: 2,
};

/**
 * Applique une reduction de volume a une seance.
 *
 * L'implementation precedente se contentait de `ceil(series * facteur)` sur les
 * seuls accessoires, en laissant les piliers intacts. Sur une seance type, un
 * ajustement annonce a -40 % ne retirait qu'une serie par accessoire, soit une
 * baisse reelle d'environ -20 %. L'intention et l'effet divergeaient.
 *
 * On raisonne desormais sur le VOLUME TOTAL en series : on retire des series une
 * par une, en commencant par les accessoires (et par la fin de seance a role egal),
 * jusqu'a atteindre la cible. Les piliers restent protegees tant que la cible peut
 * etre atteinte sans eux, et aucun exercice ne descend sous une serie.
 */
export function applyVolumeAdjustment(
  templateExercises: ExerciseInTemplateWithDetails[],
  adjustment: VolumeAdjustment,
): AdjustedExercise[] {
  const resultat: AdjustedExercise[] = templateExercises.map((ex) => ({
    ...ex,
    seriesAjustees: ex.seriesCibles,
  }));

  if (adjustment.totalPct >= 0 || resultat.length === 0) return resultat;

  const volumeInitial = resultat.reduce((n, e) => n + e.seriesCibles, 0);
  const volumeCible = Math.round(volumeInitial * (1 + adjustment.totalPct / 100));
  let volumeActuel = volumeInitial;

  // Candidats au retrait, du plus sacrifiable au moins sacrifiable.
  const ordreDeCoupe = resultat
    .map((ex, index) => ({ ex, index }))
    .sort((a, b) =>
      PRIORITE_COUPE[a.ex.categorieRole] - PRIORITE_COUPE[b.ex.categorieRole] ||
      b.index - a.index,
    );

  // Plusieurs passes : on retire une serie a chaque exercice a tour de role, pour
  // repartir la reduction plutot que de vider le premier accessoire.
  let progression = true;
  while (volumeActuel > volumeCible && progression) {
    progression = false;
    for (const { ex } of ordreDeCoupe) {
      if (volumeActuel <= volumeCible) break;
      if (ex.seriesAjustees <= 1) continue;
      // Un pilier n'est entame que si les autres sont deja au minimum.
      if (ex.categorieRole === "pilier" && ordreDeCoupe.some(
        (c) => c.ex.categorieRole !== "pilier" && c.ex.seriesAjustees > 1,
      )) continue;
      ex.seriesAjustees -= 1;
      volumeActuel -= 1;
      progression = true;
    }
  }

  return resultat;
}
