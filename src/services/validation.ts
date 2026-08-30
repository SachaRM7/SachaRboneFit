import { db } from "@/db/client";
import { contraintes, exerciseInstances, users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { validerSeance, type ExercicePropose, type ContrainteMuscle, type ResultatValidation } from "@/lib/engine/validation-seance";
import { validerImpactSemaine, type ResultatSemaine } from "@/lib/engine/validation-semaine";
import { versMuscle } from "@/lib/referentiels/muscles";
import {
  activiteMusculaire,
  etatMusclesDepuis,
  courbaturesDuJour,
  ciblesHebdo,
  mesurerCycle,
} from "@/lib/coach/outils-programme";

/**
 * La validation d'une séance, en un seul endroit.
 *
 * Elle vivait dans l'outil du coach, monté pour le modèle. L'adaptation à un
 * autre lieu en a besoin des mêmes contrôles, et deux copies auraient fini par
 * diverger : l'une aurait accepté ce que l'autre refuse, selon le chemin pris
 * pour arriver à la même séance. C'est le genre d'écart qui ne se voit pas
 * avant de mordre.
 */

export interface AlignementCycle {
  phase: string;
  aligne: boolean;
  /** Écart de volume introduit par rapport à ce qui était prévu, en %. */
  ecartVolumePct: number;
  motifs: string[];
}

export interface ValidationComplete {
  seance: ResultatValidation;
  semaine: ResultatSemaine;
  cycle: AlignementCycle;
  valide: boolean;
}

/** En décharge, une séance qui reprend du volume rate sa raison d'être. */
const DERIVE_TOLEREE_PCT = 20;

/**
 * Le contrôle d'alignement au cycle.
 *
 * `validerSeance` regarde déjà si une séance respecte sa phase. Ce qu'il ne
 * peut pas voir, c'est ce qu'une adaptation a fait *perdre* : une séance de
 * décharge reste conforme en perdant la moitié de son volume, alors qu'une
 * semaine d'accumulation, non.
 */
export function alignementCycle(entrees: {
  phase: string;
  seriesPrevues: number;
  seriesApres: number;
}): AlignementCycle {
  const { phase, seriesPrevues, seriesApres } = entrees;
  const ecart = seriesPrevues > 0
    ? Math.round(((seriesApres - seriesPrevues) / seriesPrevues) * 100)
    : 0;
  const motifs: string[] = [];

  if (phase === "decharge" && ecart > DERIVE_TOLEREE_PCT) {
    motifs.push(`Décharge en cours : la séance adaptée ajoute ${ecart} % de volume.`);
  }
  if (phase !== "decharge" && ecart < -DERIVE_TOLEREE_PCT) {
    motifs.push(
      `Phase ${phase} : la séance adaptée perd ${Math.abs(ecart)} % de volume — le stimulus prévu n'y est plus.`,
    );
  }

  return { phase, aligne: motifs.length === 0, ecartVolumePct: ecart, motifs };
}

export interface SeanceAValider {
  exerciseInstanceId: string;
  series: number;
  repsMin: number;
  repsMax: number;
  reposSecondes: number;
  rirCible?: number | null;
}

/**
 * Valide une séance, la semaine qu'elle produit, et son alignement au cycle.
 *
 * Les muscles et le pilier ne viennent jamais de l'appelant : ils sont relus en
 * base à partir des identifiants. Ni le modèle ni un écran ne peuvent donc
 * contourner un contrôle en déclarant de faux muscles.
 */
export async function validerSeanceComplete(entrees: {
  userId: string;
  gymId: string;
  exercices: SeanceAValider[];
  dureeDisponibleMinutes?: number;
  /** Volume prévu avant adaptation, pour mesurer la dérive au cycle. */
  seriesPrevues?: number;
  /**
   * Volume réel de la séance adaptée.
   *
   * Nécessaire parce que les contrôles de séance ne portent que sur les
   * exercices déjà décrits en base : un remplaçant déduit du matériel n'a pas
   * encore d'identifiant. Le déduire du seul sous-ensemble validé faisait
   * annoncer une séance effondrée alors qu'elle était complète.
   */
  seriesApres?: number;
}): Promise<ValidationComplete> {
  const { userId, gymId, exercices } = entrees;

  const [profil, instances] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, userId) }),
    db.query.exerciseInstances.findMany({
      where: isNull(exerciseInstances.archiveLe),
      with: { exercise: true },
    }),
  ]);

  const duSite = instances.filter((i) => i.gymId === gymId);
  const parId = new Map(duSite.map((i) => [i.id, i]));

  const proposes: ExercicePropose[] = exercices.map((e) => {
    const instance = parId.get(e.exerciseInstanceId);
    const fiche = instance?.exercise as
      | { nom?: string; pilier?: string; profilTension?: string; categorieRole?: string; musclesPrincipaux?: string[] }
      | null;
    return {
      exerciseInstanceId: e.exerciseInstanceId,
      nom: fiche?.nom ?? instance?.machineNom ?? e.exerciseInstanceId,
      series: e.series,
      repsMin: e.repsMin,
      repsMax: e.repsMax,
      reposSecondes: e.reposSecondes,
      musclesPrincipaux: fiche?.musclesPrincipaux ?? [],
      pilier: fiche?.pilier ?? "",
      profilTension: fiche?.profilTension,
      categorieRole: fiche?.categorieRole,
      rirCible: e.rirCible ?? null,
    };
  });

  const [activite, activiteSemaine, cycle, courbatures, contraintesActives] = await Promise.all([
    activiteMusculaire(userId, 21),
    activiteMusculaire(userId, 7),
    mesurerCycle(userId),
    courbaturesDuJour(userId),
    db.query.contraintes.findMany({
      where: and(eq(contraintes.userId, userId), isNull(contraintes.dateFin)),
    }),
  ]);

  const seriesSemaineParMuscle: Record<string, number> = {};
  for (const [muscle, a] of activiteSemaine) seriesSemaineParMuscle[muscle] = Math.round(a.series);

  const contraintesMuscle: ContrainteMuscle[] = contraintesActives.map((c) => ({
    muscle: c.muscle,
    severite: c.severite,
  }));

  const cibles = ciblesHebdo(profil?.objectifMusclesPrioritaires ?? []);

  const seance = validerSeance(proposes, {
    machinesDisponibles: duSite.map((i) => ({
      exerciseInstanceId: i.id,
      nom: (i.exercise as { nom?: string } | null)?.nom ?? i.machineNom,
    })),
    etatMuscles: etatMusclesDepuis(activite, courbatures),
    contraintes: contraintesMuscle,
    dureeDisponibleMinutes:
      entrees.dureeDisponibleMinutes || profil?.dureeSeanceCibleMinutes || 60,
    phase: cycle.phase,
    tendancePerformance: cycle.tendancePerformance,
    seriesSemaineParMuscle,
    cibleHebdoParMuscle: cibles,
  });

  const seriesProposees: Record<string, number> = {};
  for (const e of proposes) {
    for (const brut of e.musclesPrincipaux) {
      const muscle = versMuscle(brut);
      if (muscle) seriesProposees[muscle] = (seriesProposees[muscle] ?? 0) + e.series;
    }
  }

  const semaine = validerImpactSemaine({
    seriesRealisees: seriesSemaineParMuscle,
    seriesProposees,
    cibles,
    prioritaires: profil?.objectifMusclesPrioritaires ?? [],
    // La semaine d'entraînement se termine le dimanche.
    joursRestants: Math.max(0, 7 - (new Date().getDay() || 7)),
  });

  const seriesValidees = proposes.reduce((n, e) => n + e.series, 0);
  const seriesApres = entrees.seriesApres ?? seriesValidees;
  const cycleAligne = alignementCycle({
    phase: cycle.phase,
    seriesPrevues: entrees.seriesPrevues ?? seriesApres,
    seriesApres,
  });

  return {
    seance,
    semaine,
    cycle: cycleAligne,
    // L'alignement au cycle informe sans bloquer : perdre du volume parce
    // qu'on s'entraîne ailleurs reste mieux que ne pas s'entraîner.
    valide: seance.valide && semaine.valide,
  };
}

