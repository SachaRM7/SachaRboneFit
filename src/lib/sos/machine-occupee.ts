import { profilCompatible } from "@/lib/engine/profils-tension";
import type { ExerciseInstanceWithExercise, SubstituteResult } from "@/lib/engine/substitutions";
import { memeMuscle } from "@/lib/referentiels/muscles";

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

  // Le pilier se lit dans le champ prevu pour ca. Pour un exercice de role
  // "pilier", l'ancienne version prenait le PREMIER MOT DU NOM de l'exercice
  // ("Lying"...) et le comparait a `inst.pilier` ("P1_poussee") : aucun candidat
  // ne pouvait correspondre, y compris dans les deux niveaux de repli.
  const basePilier = baseInstance.pilier;
  const baseProfilTension = baseInstance.profilTension;

  // Helper to check if a muscle matches a zone (courbature matching)
  const muscleMatches = (muscle: string, zones: string[]) => {
    if (zones.length === 0) return false;
    // Comparaison via le referentiel : les courbatures et les muscles des
    // instances viennent de vocabulaires differents.
    return zones.some((zone) => memeMuscle(zone, muscle));
  };

  // Step 1: Full criteria (pilier + profil tension + gym + not in template + muscles OK)
  let candidates = allInstances.filter(inst => {
    if (inst.gymId !== input.gym_id) return false;
    if (templateExerciseIds.includes(inst.id)) return false;
    if (inst.pilier !== basePilier) return false;
    // Même définition que la recherche de substituts : la règle était recopiée
    // ici, et les deux copies auraient fini par diverger.
    if (!profilCompatible(baseProfilTension, inst.profilTension)) return false;
    if (musclesAvecCourbatures.length > 0 && inst.musclesPrincipaux.some((m) => muscleMatches(m, musclesAvecCourbatures))) return false;
    return true;
  });

  // Step 2: If no results, relax profil tension (but keep pilier)
  if (candidates.length === 0) {
    candidates = allInstances.filter(inst => {
      if (inst.gymId !== input.gym_id) return false;
      if (templateExerciseIds.includes(inst.id)) return false;
      if (inst.pilier !== basePilier) return false;
      if (musclesAvecCourbatures.length > 0 && inst.musclesPrincipaux.some((m) => muscleMatches(m, musclesAvecCourbatures))) return false;
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