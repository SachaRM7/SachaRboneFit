export interface ExerciseInstanceWithExercise {
  id: string;
  gymId: string;
  exerciseId: string;
  nom: string;
  machineNom: string | null;
  categorieRole: "pilier" | "substitut" | "accessoire";
  profilTension: string;
  musclesPrincipaux: string[];
}

export interface SubstitutionCriteria {
  pilier: string;
  profilTension: string;
  gymId: string;
  excludeExerciseIds: string[];
  musclesAvecCourbatures?: string[];
}

export interface SubstituteResult {
  exerciseInstanceId: string;
  exerciseName: string;
  machineName: string | null;
  categorieRole: "pilier" | "substitut" | "accessoire";
  profilTension: string;
}

export function findSubstitutes(
  allInstances: ExerciseInstanceWithExercise[],
  criteria: SubstitutionCriteria,
): SubstituteResult[] {
  const roleOrder = { pilier: 0, substitut: 1, accessoire: 2 };

  return allInstances
    .filter((inst) => {
      if (inst.gymId !== criteria.gymId) return false;
      if (criteria.excludeExerciseIds.includes(inst.id)) return false;
      if (inst.profilTension !== criteria.profilTension && inst.profilTension !== "mi_range") return false;
      if (criteria.musclesAvecCourbatures && criteria.musclesAvecCourbatures.length > 0) {
        const hasAvoidedMuscle = inst.musclesPrincipaux.some((m) =>
          criteria.musclesAvecCourbatures!.includes(m),
        );
        if (hasAvoidedMuscle) return false;
      }
      return true;
    })
    .sort((a, b) => roleOrder[a.categorieRole] - roleOrder[b.categorieRole])
    .slice(0, 5)
    .map((inst) => ({
      exerciseInstanceId: inst.id,
      exerciseName: inst.nom,
      machineName: inst.machineNom,
      categorieRole: inst.categorieRole,
      profilTension: inst.profilTension,
    }));
}
