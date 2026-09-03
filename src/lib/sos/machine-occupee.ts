import { profilCompatible } from "@/lib/engine/profils-tension";
import type { ExerciseInstanceWithExercise, SubstituteResult } from "@/lib/engine/substitutions";
import { memeMuscle } from "@/lib/referentiels/muscles";
import { libellePilier } from "@/lib/referentiels/libelles";

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

function raisonDe(pilier: string | null | undefined, memeProfil: boolean): string {
  const geste = pilier ? libellePilier(pilier) : null;
  if (!geste) return memeProfil ? "Même profil de tension" : "Même famille de mouvement";
  return memeProfil ? `Même geste (${geste}) et même profil de tension` : `Même geste (${geste})`;
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

  /**
   * Ce qui distingue deux propositions.
   *
   * Trois sorties de poulie réglable portent le même nom d'exercice ET le même
   * nom de machine : la liste en affichait trois lignes rigoureusement
   * identiques, impossibles à départager. Quand le couple se répète, le rang
   * de l'appareil le lève — c'est la seule chose qui les différencie sur
   * place.
   */
  const retenus = candidates.slice(0, 3);
  const occurrences = new Map<string, number>();
  const rangDe = (inst: ExerciseInstanceWithExercise) => {
    const cle = `${inst.nom}|${inst.machineNom ?? ""}`;
    const rang = (occurrences.get(cle) ?? 0) + 1;
    occurrences.set(cle, rang);
    return rang;
  };
  const homonymes = new Set(
    retenus
      .map((i) => `${i.nom}|${i.machineNom ?? ""}`)
      .filter((cle, index, tous) => tous.indexOf(cle) !== index),
  );

  const substituts = retenus.map(inst => {
    const cle = `${inst.nom}|${inst.machineNom ?? ""}`;
    const rang = rangDe(inst);
    return {
      exerciseInstanceId: inst.id,
      exerciseName: inst.nom,
      machineName: homonymes.has(cle) ? `${inst.machineNom ?? inst.nom} — poste ${rang}` : inst.machineNom,
      categorieRole: inst.categorieRole,
      profilTension: inst.profilTension,
      /**
       * La raison se lit, elle ne se décode pas.
       *
       * Elle interpolait `inst.pilier` brut : « Même pilier (P1_poussee) », et
       * « Même pilier (undefined) » dès que le champ manquait — ce que l'écran
       * affichait tel quel. Le libellé humain existe déjà pour ça, et une
       * valeur absente ne se raconte pas.
       */
      raisonCompatibilite: raisonDe(inst.pilier, inst.profilTension === baseProfilTension),
    };
  });

  return {
    substituts,
    message: substituts.length > 0
      ? `${substituts.length} substitut(s) disponible(s)`
      : "Aucun substitut disponible dans cette salle.",
  };
}