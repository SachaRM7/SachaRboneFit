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

/**
 * Combien d'alternatives on propose.
 *
 * Trois était trop peu quand la salle en offre davantage ; au-delà de cinq, le
 * choix cesse d'aider — on relit une liste au lieu de reprendre sa série.
 */
const MAX_ALTERNATIVES = 5;

/**
 * Ce qui rapproche un candidat de l'exercice prévu, en points.
 *
 * DÉTERMINISTE, ET C'EST TOUT L'INTÉRÊT. La version précédente prenait
 * `candidates.slice(0, 3)` — donc les trois premiers dans l'ordre où la base
 * les avait rendus. Deux appels identiques pouvaient proposer deux listes
 * différentes, et rien ne disait pourquoi celui-là plutôt qu'un autre.
 *
 * Les critères sont ordonnés par ce qu'ils coûtent à l'entraînement : changer
 * de profil de tension change la portion de l'amplitude où le muscle travaille ;
 * changer de rôle change la place de l'exercice dans la séance ; perdre un
 * muscle principal change ce qui est entraîné. Le nom ne départage qu'à égalité
 * parfaite, pour que l'ordre soit reproductible.
 *
 * Aucun modèle de langage : les mêmes données donnent toujours la même liste.
 */
const POINTS = {
  memeProfilExact: 8,
  memeRole: 4,
  /** Par muscle principal partagé, plafonné : trois muscles communs ne valent
   *  pas trois fois un profil de tension. */
  muscleCommun: 2,
} as const;

export interface CandidatClasse {
  instance: ExerciseInstanceWithExercise;
  score: number;
  raison: string;
}

function musclesCommuns(a: string[], b: string[]): number {
  return a.filter((m) => b.some((autre) => memeMuscle(m, autre))).length;
}

/**
 * La raison affichée — dérivée du classement, jamais rédigée à part.
 *
 * Une phrase écrite indépendamment du score finirait par dire « très proche »
 * d'un candidat classé quatrième. Ici les deux sortent du même calcul.
 */
function raisonDe(
  base: ExerciseInstanceWithExercise,
  candidat: ExerciseInstanceWithExercise,
  score: number,
): string {
  const geste = candidat.pilier ? libellePilier(candidat.pilier) : null;
  const memeProfil = profilCompatible(base.profilTension, candidat.profilTension)
    && base.profilTension === candidat.profilTension;
  const communs = musclesCommuns(base.musclesPrincipaux, candidat.musclesPrincipaux);

  /*
   * Le geste est nommé même dans la meilleure des raisons.
   *
   * « Très proche du mouvement prévu » se lit bien et ne dit pas DE QUOI on
   * parle : devant la machine, savoir qu'il s'agit toujours d'un tirage est
   * l'information utile. Un test du dépôt tient d'ailleurs cet invariant —
   * le libellé humain, jamais le code `P2_tirage`.
   */
  if (memeProfil && communs > 0) {
    return geste ? `Très proche — ${geste}` : "Très proche du mouvement prévu";
  }
  if (memeProfil) return geste ? `Même geste (${geste}) et même profil` : "Même profil de tension";
  if (communs > 0) return geste ? `${geste} — mêmes muscles visés` : "Mêmes muscles visés";
  if (score > 0) return geste ? `${geste} — alternative disponible` : "Alternative possible";
  return "Alternative possible";
}

/**
 * Classer les candidats, du plus proche au plus éloigné.
 *
 * Exportée pour être testée seule : le classement est une décision du moteur,
 * et il doit pouvoir être vérifié sans monter un écran.
 */
export function classerCandidats(
  base: ExerciseInstanceWithExercise,
  candidats: ExerciseInstanceWithExercise[],
): CandidatClasse[] {
  return candidats
    .map((c) => {
      let score = 0;
      if (base.profilTension === c.profilTension) score += POINTS.memeProfilExact;
      if (base.categorieRole === c.categorieRole) score += POINTS.memeRole;
      score += Math.min(2, musclesCommuns(base.musclesPrincipaux, c.musclesPrincipaux))
        * POINTS.muscleCommun;
      return { instance: c, score, raison: raisonDe(base, c, score) };
    })
    // À score égal, le nom tranche : deux appels identiques doivent rendre la
    // même liste, dans le même ordre.
    .sort((a, b) => b.score - a.score
      || a.instance.nom.localeCompare(b.instance.nom)
      || (a.instance.machineNom ?? "").localeCompare(b.instance.machineNom ?? ""));
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
  // Classées, puis coupées — et non coupées dans l'ordre de la base.
  const classes = classerCandidats(baseInstance, candidates);
  const retenus = classes.slice(0, MAX_ALTERNATIVES).map((c) => c.instance);
  const raisonParId = new Map(classes.map((c) => [c.instance.id, c.raison]));
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
      raisonCompatibilite: raisonParId.get(inst.id) ?? "Alternative possible",
    };
  });

  return {
    substituts,
    message: substituts.length > 0
      ? `${substituts.length} substitut(s) disponible(s)`
      : "Aucun substitut disponible dans cette salle.",
  };
}