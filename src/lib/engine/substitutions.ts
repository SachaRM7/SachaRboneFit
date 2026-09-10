import { distanceProfil, profilCompatible } from "./profils-tension";
import { memeMuscle } from "@/lib/referentiels/muscles";
import { FICHES_TECHNIQUES } from "@/lib/referentiels/fiches-techniques";
import { CATALOGUE_PAR_SLUG } from "@/lib/referentiels/catalogue";
import { imagesAffichables } from "@/lib/referentiels/illustrations";

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
  /*
   * Ce qu'il faut pour qu'une carte devienne réellement l'autre exercice.
   *
   * Le moteur de substitution ne s'en sert pas — il compare des mouvements.
   * L'écran, lui, en a besoin au moment d'appliquer le remplacement : sans la
   * convention de charge, la carte remplaçante demanderait de saisir un nombre
   * sans dire ce qu'il représente.
   */
  slug?: string | null;
  conventionCharge?: string | null;
  natureCharge?: string | null;
  incrementsPossibles?: number[] | null;
  poidsNonCompte?: number | null;
  equipement?: string | null;
}

export interface SubstitutionCriteria {
  pilier: string;
  profilTension: string;
  /** Nature du mouvement remplacé : à profil égal, on préfère la même. */
  type?: string;
  gymId: string;
  excludeExerciseIds: string[];
  musclesAvecCourbatures?: string[];
  raison?: string;
  /** En première prise en main, une recommandation doit pouvoir s'expliquer. */
  exigerDocumentation?: boolean;
  equipementActuel?: string | null;
}

export interface SubstituteResult {
  exerciseInstanceId: string;
  exerciseName: string;
  machineName: string | null;
  categorieRole: "pilier" | "substitut" | "accessoire";
  profilTension: string;
  type?: string;
  raisonCompatibilite?: string;
  exerciseId?: string;
  slug?: string | null;
  documentationSuffisante?: boolean;
}

export function documentationSuffisante(inst: ExerciseInstanceWithExercise): boolean {
  if (!inst.slug) return false;
  const fiche = FICHES_TECHNIQUES[inst.slug];
  const catalogue = CATALOGUE_PAR_SLUG.get(inst.slug);
  return Boolean(
    fiche?.installation
      && fiche.execution
      && catalogue
      // Les anomalies écartées comptent réellement : un dossier présent mais
      // entièrement masqué ne constitue pas une démonstration exploitable.
      && imagesAffichables(inst.slug, catalogue.nbFrames).length >= 2,
  );
}

function complexite(equipement: string | null | undefined, type?: string): number {
  const base = equipement === "machine"
    ? 0
    : equipement === "poulie"
      ? 1
      : equipement === "halteres" || equipement === "kettlebell"
        ? 2
        : 3;
  return base + (type === "polyarticulaire" ? 1 : 0);
}

function raisonAffichee(
  inst: ExerciseInstanceWithExercise,
  criteria: SubstitutionCriteria,
): string {
  if (criteria.raison === "trop_complique") return "Plus simple à apprendre";
  if (inst.equipement === "machine") return "Même groupe musculaire, machine guidée";
  if (inst.profilTension === criteria.profilTension) return "Très proche du mouvement prévu";
  return "Disponible dans cette salle";
}

export function findSubstitutes(
  allInstances: ExerciseInstanceWithExercise[],
  criteria: SubstitutionCriteria,
): SubstituteResult[] {
  const roleOrder = { pilier: 0, substitut: 1, accessoire: 2 };

  const niveauActuel = complexite(criteria.equipementActuel, criteria.type);
  const candidats = allInstances
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
      if (
        criteria.raison === "trop_complique"
        && complexite(inst.equipement, inst.type) >= niveauActuel
      ) return false;
      if (criteria.exigerDocumentation && !documentationSuffisante(inst)) return false;
      return true;
    })
    // Le tri ne regardait que le rôle : un profil voisin pouvait passer devant
    // un profil identique. On classe d'abord par fidélité — même profil, puis
    // même nature de mouvement — et le rôle départage ensuite.
    .sort((a, b) =>
      (criteria.raison === "trop_complique"
        ? complexite(a.equipement, a.type) - complexite(b.equipement, b.type)
        : 0)
      || (distanceProfil(criteria.profilTension, a.profilTension) ?? 9)
        - (distanceProfil(criteria.profilTension, b.profilTension) ?? 9)
      || (a.type === criteria.type ? 0 : 1) - (b.type === criteria.type ? 0 : 1)
      || roleOrder[a.categorieRole] - roleOrder[b.categorieRole])
    .slice(0, 3)
    .map((inst) => ({
      exerciseInstanceId: inst.id,
      exerciseName: inst.nom,
      machineName: inst.machineNom,
      categorieRole: inst.categorieRole,
      profilTension: inst.profilTension,
      type: inst.type,
      exerciseId: inst.exerciseId,
      slug: inst.slug,
      documentationSuffisante: documentationSuffisante(inst),
      raisonCompatibilite: raisonAffichee(inst, criteria),
    }));

  return candidats;
}
