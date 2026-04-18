import type { ExerciseInstanceWithExercise, SubstituteResult } from "@/lib/engine/substitutions";

export interface MachineOccupeInput {
  exercise_instance_id: string;
  gym_id: string;
  seance_template_id: string;
  daily_state_id: string | null;
}

export interface MachineOccupeResult {
  substituts: SubstituteResult[];
  message: string;
}

export async function machineOccupee(
  input: MachineOccupeInput,
  allInstances: ExerciseInstanceWithExercise[],
  templateExerciseIds: string[],
  musclesAvecCourbatures: string[] = [],
): Promise<MachineOccupeResult> {
  // Find the base exercise
  const baseInstance = allInstances.find(i => i.id === input.exercise_instance_id);
  if (!baseInstance) {
    return { substituts: [], message: "Exercice introuvable." };
  }

  const basePilier = baseInstance.categorieRole === "pilier"
    ? (baseInstance.nom.split(" ")[0] ?? baseInstance.pilier)
    : baseInstance.pilier;
  const baseProfilTension = baseInstance.profilTension;

  // Helper to check if a muscle matches a zone (courbature matching)
  const muscleMatches = (muscle: string, zones: string[]) => {
    if (zones.length === 0) return false;
    const lowerMuscle = muscle.toLowerCase();
    return zones.some(zone => lowerMuscle.includes(zone.toLowerCase()) || zone.toLowerCase().includes(lowerMuscle));
  };

  // Step 1: Full criteria (pilier + profil tension + gym + not in template + muscles OK)
  let candidates = allInstances.filter(inst => {
    if (inst.gymId !== input.gym_id) return false;
    if (templateExerciseIds.includes(inst.id)) return false;
    if (inst.pilier !== basePilier) return false;
    if (inst.profilTension !== baseProfilTension && inst.profilTension !== "mi_range") return false;
    if (musclesAvecCourbatures.length > 0 && muscleMatches(inst.musclesPrincipaux[0] ?? "", musclesAvecCourbatures)) return false;
    return true;
  });

  // Step 2: If no results, relax profil tension (but keep pilier)
  if (candidates.length === 0) {
    candidates = allInstances.filter(inst => {
      if (inst.gymId !== input.gym_id) return false;
      if (templateExerciseIds.includes(inst.id)) return false;
      if (inst.pilier !== basePilier) return false;
      if (musclesAvecCourbatures.length > 0 && muscleMatches(inst.musclesPrincipaux[0] ?? "", musclesAvecCourbatures)) return false;
      return true;
    });
  }

  // Step 3: If still no results, also relax muscle matching
  if (candidates.length === 0) {
    candidates = allInstances.filter(inst => {
      if (inst.gymId !== input.gym_id) return false;
      if (templateExerciseIds.includes(inst.id)) return false;
      if (inst.pilier !== basePilier) return false;
      return true;
    });
  }

  const substituts = candidates.slice(0, 3).map(inst => ({
    exerciseInstanceId: inst.id,
    exerciseName: inst.nom,
    machineName: inst.machineNom,
    categorieRole: inst.categorieRole,
    profilTension: inst.profilTension,
    raisonCompatibilite: inst.profilTension === baseProfilTension
      ? `Même pilier (${inst.pilier}) et même profil de tension`
      : `Même pilier (${inst.pilier})`,
  }));

  return {
    substituts,
    message: substituts.length > 0
      ? `${substituts.length} substitut(s) disponible(s)`
      : "Aucun substitut disponible dans cette salle.",
  };
}