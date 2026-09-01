import { distanceProfil, profilCompatible } from "./profils-tension";
import { memeMuscle } from "@/lib/referentiels/muscles";

export interface ExerciseInstanceWithExercise {
  id: string;
  gymId: string;
  exerciseId: string;
  nom: string;
  machineNom: string | null;
  categorieRole: "pilier" | "substitut" | "accessoire";
  profilTension: string;
  /** polyarticulaire | isolation. Nature du mouvement, distincte du rôle. */
  type?: string;
  musclesPrincipaux: string[];
  pilier: string;
}

export interface SubstitutionCriteria {
  pilier: string;
  profilTension: string;
  /** Nature du mouvement remplacé : à profil égal, on préfère la même. */
  type?: string;
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
  type?: string;
  raisonCompatibilite?: string;
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
      // Le pilier etait accepte en critere mais jamais applique : le moteur pouvait
      // proposer un developpe couche pour remplacer un rowing.
      if (inst.pilier !== criteria.pilier) return false;
      // La règle vivait ici en clair, recopiée à l'identique dans le dépannage
      // « machine occupée », et elle rendait un mi_range plus difficile à
      // remplacer qu'un stretch. Une seule définition désormais : voisins sur
      // l'axe stretch — mi_range — contract.
      if (!profilCompatible(criteria.profilTension, inst.profilTension)) return false;
      if (criteria.musclesAvecCourbatures && criteria.musclesAvecCourbatures.length > 0) {
        // Comparaison via le referentiel : les deux listes viennent de vocabulaires
        // differents (saisie utilisateur vs base), une inclusion stricte echouait toujours.
        const hasAvoidedMuscle = inst.musclesPrincipaux.some((m) =>
          criteria.musclesAvecCourbatures!.some((c) => memeMuscle(c, m)),
        );
        if (hasAvoidedMuscle) return false;
      }
      return true;
    })
    // Le tri ne regardait que le rôle : un profil voisin pouvait passer devant
    // un profil identique. On classe d'abord par fidélité — même profil, puis
    // même nature de mouvement — et le rôle départage ensuite.
    .sort((a, b) =>
      (distanceProfil(criteria.profilTension, a.profilTension) ?? 9)
        - (distanceProfil(criteria.profilTension, b.profilTension) ?? 9)
      || (a.type === criteria.type ? 0 : 1) - (b.type === criteria.type ? 0 : 1)
      || roleOrder[a.categorieRole] - roleOrder[b.categorieRole])
    .slice(0, 5)
    .map((inst) => ({
      exerciseInstanceId: inst.id,
      exerciseName: inst.nom,
      machineName: inst.machineNom,
      categorieRole: inst.categorieRole,
      profilTension: inst.profilTension,
      type: inst.type,
    }));
}
