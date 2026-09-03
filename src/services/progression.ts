import { db } from "@/db/client";
import { seancesRealisees, seancesActives } from "@/db/archivage";
import type { Lecteur } from "@/db/lecteur";
import {
  exerciseInstances, exercises, seanceTemplates, sessionLogs, sessionPlanItems, setLogs,
} from "@/db/schema";
import { and, asc, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { computeAlerts, type Alert, type AlertsInput } from "@/lib/engine/alerts";
import { configurationDe, porteeDeLaMesure, type PorteeDeLaMesure } from "@/lib/engine/charges";
import { computeNextSets } from "@/lib/engine/double-progression";
import { computeFeuTendance, type FeuBiologique, type SessionPilierPerf } from "@/lib/engine/feu-biologique";
import { empecheParLesCirconstances, semainesEmpechees } from "@/lib/engine/tracabilite";
import {
  estimer1RM, estimer1RMDepuisRpe, estimer1RMSansReserve, reserveDepuisRpe,
  recordsDeLExercice, type NatureMesure,
} from "@/lib/engine/records";
import { reserveFiable } from "@/lib/engine/score-progression";
import { SEUILS } from "@/lib/engine/bilan-progression";
import { memoireEmpechements, type MemoireEmpechements } from "./memoire";
import { lireBlocs, type BlocsDuProgramme } from "./blocs";

/**
 * Agrégats de progression.
 *
 * `computeAlerts` attendait `semainesSansDeload` et `semainesSansProgression` :
 * deux grandeurs qu'aucune requête ne calculait. La route qui l'appelait les
 * renseignait partiellement, avec un commentaire « For now, return basic alerts ».
 * Le moteur d'alertes était donc opérationnel et nourri de valeurs vides.
 */

const MS_PAR_SEMAINE = 7 * 24 * 60 * 60 * 1000;

function semainesDepuis(dateISO: string): number {
  const ecart = Date.now() - new Date(`${dateISO}T12:00:00`).getTime();
  return Math.max(0, Math.floor(ecart / MS_PAR_SEMAINE));
}

/**
 * Semaines écoulées depuis la dernière décharge.
 *
 * Une décharge est soit un bloc de type `deload`, soit une semaine où le volume
 * a été fortement réduit (au moins -30 %). À défaut, on compte depuis le début
 * du bloc actif.
 */
/**
 * Ce que l'appelant a déjà lu et qu'il serait absurde de relire.
 *
 * Cette fonction faisait jusqu'à trois requêtes, dont deux que son appelant
 * principal — `vueDuProgramme` via `mesurerCycle` — venait de faire pour son
 * propre compte. Rien n'est mémorisé entre deux appels : ce sont les lectures
 * d'un même traitement qui se passent la main, et un appelant qui ne fournit
 * rien retrouve exactement le comportement d'avant.
 */
export interface PrealablesDeload {
  blocs?: BlocsDuProgramme;
  /**
   * La séance réalisée la plus récente, avec au moins `date` et
   * `volumeAjustePct`. `null` signifie « lue, et il n'y en a aucune » — c'est
   * pourquoi `undefined` reste distinct : lui seul déclenche la lecture.
   */
  derniereSeance?: { date: string; volumeAjustePct: number | null } | null;
}

export async function semainesSansDeload(
  userId: string,
  executeur: Lecteur = db,
  prealables: PrealablesDeload = {},
): Promise<number> {
  const blocs = prealables.blocs ?? (await lireBlocs(userId, executeur));

  const seanceAllegee =
    prealables.derniereSeance !== undefined
      ? prealables.derniereSeance
      : ((await executeur.query.sessionLogs.findFirst({
          where: seancesRealisees(userId),
          orderBy: [desc(sessionLogs.date)],
          columns: { date: true, volumeAjustePct: true },
        })) ?? null);

  const candidats: string[] = [];
  if (blocs.dernierDeload) candidats.push(blocs.dernierDeload.dateDebut);
  if (seanceAllegee?.volumeAjustePct != null && seanceAllegee.volumeAjustePct <= -30) {
    candidats.push(seanceAllegee.date);
  }

  if (candidats.length === 0) {
    return blocs.actif ? semainesDepuis(blocs.actif.dateDebut) : 0;
  }

  return Math.min(...candidats.map(semainesDepuis));
}

export interface Stagnation {
  /** Semaines pendant lesquelles l'exercice n'a pas pu être proposé. */
  semainesEmpechees?: number;
  exerciseInstanceId: string;
  exerciseName: string;
  semainesSansProgression: number;
  contexteNormal: boolean;
}

/**
 * Pour chaque machine travaillée récemment, depuis combien de semaines son 1RM
 * estimé n'a pas dépassé son meilleur niveau.
 */
export async function stagnations(userId: string, seuilSemaines = 2): Promise<Stagnation[]> {
  const lignes = await db
    .select({
      exerciseInstanceId: setLogs.exerciseInstanceId,
      exerciseName: exercises.nom,
      charge: setLogs.charge,
      reps: setLogs.repsEffectuees,
      rpe: setLogs.rpeEffectif,
      date: sessionLogs.date,
      feuJour: sessionLogs.feuBiologiqueJour,
    })
    .from(setLogs)
    .innerJoin(sessionLogs, eq(sessionLogs.id, setLogs.sessionLogId))
    .innerJoin(exerciseInstances, eq(exerciseInstances.id, setLogs.exerciseInstanceId))
    .innerJoin(exercises, eq(exercises.id, exerciseInstances.exerciseId))
    .where(and(eq(sessionLogs.userId, userId), isNull(sessionLogs.archiveLe)))
    .orderBy(asc(sessionLogs.date));

  const parInstance = new Map<string, typeof lignes>();
  for (const l of lignes) {
    parInstance.set(l.exerciseInstanceId, [...(parInstance.get(l.exerciseInstanceId) ?? []), l]);
  }

  // Un exercice remplacé faute de matériel n'a pas stagné : il n'a pas été
  // proposé. Sans cette lecture, trois séances à la maison faisaient conclure
  // que le développé de la salle stagne depuis six semaines — une absence
  // parfaitement expliquée, présentée comme un échec.
  const empechements = await db
    .select({
      prevu: sessionPlanItems.exerciseInstancePrevuId,
      fait: sessionPlanItems.exerciseInstanceId,
      contexte: sessionPlanItems.contexteAdaptation,
      raison: sessionPlanItems.raisonSubstitution,
      date: sessionLogs.date,
    })
    .from(sessionPlanItems)
    .innerJoin(sessionLogs, eq(sessionLogs.id, sessionPlanItems.sessionLogId))
    // Ici, et seulement ici, on reste sur les séances ACTIVES et non
    // RÉALISÉES. Un empêchement ne dit pas ce qui a été soulevé, il dit ce que
    // le lieu n'offrait pas — un déplacement où l'on constate qu'une machine
    // manque reste une observation valable même si rien n'a été fait ensuite.
    // Et l'exiger réalisée serait circulaire : cette lecture existe justement
    // pour éviter qu'un exercice empêché soit lu comme une stagnation.
    .where(seancesActives(userId));

  const datesEmpechees = new Map<string, string[]>();
  for (const e of empechements) {
    const ligne = {
      exerciseInstanceId: e.fait,
      exerciseInstancePrevuId: e.prevu,
      raisonSubstitution: e.raison,
      contexteAdaptation: e.contexte,
    };
    if (!empecheParLesCirconstances(ligne)) continue;
    const cle = e.prevu!;
    datesEmpechees.set(cle, [...(datesEmpechees.get(cle) ?? []), e.date]);
  }

  const resultat: Stagnation[] = [];

  for (const [instanceId, series] of parInstance) {
    // Meilleur 1RM par date, puis date du dernier record. L'estimation vient
    // du moteur `records` : c'est la même que celle qui décide des records
    // affichés, donc « depuis ton dernier record » désigne bien la même séance
    // dans les deux blocs de l'écran.
    const meilleurParDate = new Map<string, number>();
    for (const s of series) {
      const rm = estimer1RM({
        date: s.date,
        charge: s.charge,
        reps: s.reps,
        rir: reserveDepuisRpe(s.rpe),
      });
      meilleurParDate.set(s.date, Math.max(meilleurParDate.get(s.date) ?? 0, rm));
    }

    const dates = [...meilleurParDate.keys()].sort();
    if (dates.length < 2) continue;

    let record = 0;
    let dateRecord = dates[0]!;
    for (const d of dates) {
      const rm = meilleurParDate.get(d)!;
      if (rm > record) {
        record = rm;
        dateRecord = d;
      }
    }

    // Les semaines où l'exercice était empêché ne comptent pas comme des
    // occasions de progresser.
    const empechees = semainesEmpechees(datesEmpechees.get(instanceId) ?? []);
    const semaines = Math.max(0, semainesDepuis(dateRecord) - empechees);
    if (semaines < seuilSemaines) continue;

    // Le contexte est normal si la majorité des séances récentes étaient vertes :
    // stagner après trois nuits blanches n'est pas une stagnation d'entraînement.
    const recentes = series.slice(-9);
    const verts = recentes.filter((s) => s.feuJour === "vert").length;
    const renseignes = recentes.filter((s) => s.feuJour !== null).length;

    resultat.push({
      exerciseInstanceId: instanceId,
      exerciseName: series[0]!.exerciseName,
      semainesSansProgression: semaines,
      semainesEmpechees: empechees,
      contexteNormal: renseignes === 0 || verts / renseignes >= 0.5,
    });
  }

  return resultat.sort((a, b) => b.semainesSansProgression - a.semainesSansProgression);
}

/** Exercices dont la fourchette a été complétée à la dernière séance. */
export async function fourchettesCompletees(userId: string) {
  const derniere = await db.query.sessionLogs.findFirst({
    where: seancesRealisees(userId),
    orderBy: [desc(sessionLogs.date), desc(sessionLogs.createdAt)],
  });
  if (!derniere) return [];

  const lignes = await db
    .select({
      exerciseInstanceId: setLogs.exerciseInstanceId,
      exerciseName: exercises.nom,
      numero: setLogs.numeroSerie,
      reps: setLogs.repsEffectuees,
      charge: setLogs.charge,
      rpe: setLogs.rpeEffectif,
      increments: exerciseInstances.incrementsPossibles,
      paliersCharges: exerciseInstances.paliersCharges,
      chargeMinimale: exerciseInstances.chargeMinimale,
      chargeMax: exerciseInstances.chargeMax,
      natureCharge: exerciseInstances.natureCharge,
    })
    .from(setLogs)
    .innerJoin(exerciseInstances, eq(exerciseInstances.id, setLogs.exerciseInstanceId))
    .innerJoin(exercises, eq(exercises.id, exerciseInstances.exerciseId))
    .where(eq(setLogs.sessionLogId, derniere.id))
    .orderBy(asc(setLogs.numeroSerie));

  const parInstance = new Map<string, typeof lignes>();
  for (const l of lignes) {
    parInstance.set(l.exerciseInstanceId, [...(parInstance.get(l.exerciseInstanceId) ?? []), l]);
  }

  const resultat: AlertsInput["completedRanges"] = [];

  for (const [, series] of parInstance) {
    const premiere = series[0]!;
    // La fourchette du template n'est pas connue ici : on retient le maximum
    // réellement effectué comme borne haute, ce qui suffit à détecter le palier.
    const maxReps = Math.max(...series.map((s) => s.reps));
    const suggestion = computeNextSets(
      { sets: series.map((s) => ({ numero: s.numero, reps: s.reps, charge: s.charge, rpe: s.rpe })) },
      {
        fourchetteRepsMin: Math.min(...series.map((s) => s.reps)),
        fourchetteRepsMax: maxReps,
        seriesCibles: series.length,
        charge: configurationDe({ ...premiere, incrementsPossibles: premiere.increments }),
      },
    );

    // La fourchette peut être complétée sans qu'une charge suivante existe :
    // appareil en butée, ou incréments jamais relevés. Annoncer « passe à
    // null kg » serait pire que de se taire — l'alerte propose une action, et
    // il n'y en a pas.
    if (suggestion.fourchetteCompletee && suggestion.charge !== null) {
      resultat.push({
        exerciseName: premiere.exerciseName,
        currentCharge: premiere.charge,
        nextCharge: suggestion.charge,
      });
    }
  }

  return resultat;
}

/**
 * Feu de tendance sur les trois dernières séances d'un même template.
 *
 * La tendance compare des maximums estimés d'une séance à l'autre. La réserve
 * n'y entre que si elle est renseignée assez souvent, au même seuil que le
 * score de progression : si le RPE est noté une séance sur trois, la réserve
 * ferait monter la séance où l'on a pensé à le noter, et le feu changerait de
 * couleur au gré de la saisie plutôt que de la fatigue.
 */
export async function feuDeTendance(userId: string): Promise<FeuBiologique | null> {
  const dernieres = await db.query.sessionLogs.findMany({
    where: seancesRealisees(userId),
    orderBy: [desc(sessionLogs.date), desc(sessionLogs.createdAt)],
    limit: 3,
  });
  if (dernieres.length < 3) return null;

  // La couverture se mesure sur les trois séances ensemble : c'est entre elles
  // que la comparaison se fait, et c'est donc là qu'une réserve partielle
  // fausserait le résultat.
  const toutesLesSeries = await db
    .select({ rpe: setLogs.rpeEffectif })
    .from(setLogs)
    .where(inArray(setLogs.sessionLogId, dernieres.map((s) => s.id)));
  const reserveExploitable = reserveFiable(
    toutesLesSeries.map((x) => ({ date: "", charge: 1, reps: 1, rir: reserveDepuisRpe(x.rpe) })),
  );

  /**
   * Les séries des trois séances, en UNE requête.
   *
   * Elles étaient lues séance par séance, dans un `Promise.all` qui donnait
   * l'illusion du parallélisme : le pool applicatif n'ouvre qu'UNE connexion,
   * les trois requêtes se sérialisaient donc, chacune payant sa latence. Le
   * `Promise.all` ne parallélise que ce qui peut l'être ailleurs qu'en base.
   */
  const toutesLesLignes = await db
    .select({
      sessionLogId: setLogs.sessionLogId,
      exerciseInstanceId: setLogs.exerciseInstanceId,
      exerciseName: exercises.nom,
      charge: setLogs.charge,
      reps: setLogs.repsEffectuees,
      rpe: setLogs.rpeEffectif,
      categorieRole: exercises.categorieRole,
    })
    .from(setLogs)
    .innerJoin(exerciseInstances, eq(exerciseInstances.id, setLogs.exerciseInstanceId))
    .innerJoin(exercises, eq(exercises.id, exerciseInstances.exerciseId))
    .where(inArray(setLogs.sessionLogId, dernieres.map((s) => s.id)));

  const sessions = await Promise.all(
    dernieres.map(async (s) => {
      const lignes = toutesLesLignes.filter((l) => l.sessionLogId === s.id);

      // Le feu de tendance ne regarde que les piliers : un accessoire varie trop.
      const meilleurs = new Map<string, SessionPilierPerf>();
      for (const l of lignes.filter((x) => x.categorieRole === "pilier")) {
        const rm = reserveExploitable
          ? estimer1RMDepuisRpe(l.charge, l.reps, l.rpe)
          : estimer1RMSansReserve(l.charge, l.reps);
        const actuel = meilleurs.get(l.exerciseInstanceId);
        if (!actuel || rm > actuel.estimated1RM) {
          meilleurs.set(l.exerciseInstanceId, {
            exerciseInstanceId: l.exerciseInstanceId,
            // Le nom réel, et non le littéral "Exercice" qu'utilisait l'écran de fin.
            exerciseName: l.exerciseName,
            volumeTotal: l.charge * l.reps,
            estimated1RM: rm,
          });
        }
      }

      return {
        date: s.date,
        // Le feu du jour réel, et non `null` — un null comptait comme non-vert
        // et dégradait systématiquement le contexte.
        feuJour: (s.feuBiologiqueJour as FeuBiologique) ?? "vert",
        pilierPerfs: [...meilleurs.values()],
      };
    }),
  );

  return computeFeuTendance({ sessions }).feu;
}

/**
 * Toutes les alertes de l'utilisateur, nourries de vraies valeurs.
 *
 * `prealables` sert au tableau de bord, qui appelle `alertes` et
 * `vueDuProgramme` côte à côte : sans lui, les deux relisent les mêmes blocs et
 * la même mémoire d'empêchements dans le même rendu. Appelée seule, la fonction
 * lit tout elle-même, comme avant.
 */
export async function alertes(
  userId: string,
  prealables: { blocs?: BlocsDuProgramme; memoire?: MemoireEmpechements } = {},
): Promise<Alert[]> {
  const [completedRanges, listeStagnations, sansDeload, tendance, memoire] = await Promise.all([
    fourchettesCompletees(userId),
    stagnations(userId),
    semainesSansDeload(userId, db, { blocs: prealables.blocs }),
    feuDeTendance(userId),
    prealables.memoire ?? memoireEmpechements(userId),
  ]);

  const alertesCalculees = computeAlerts({
    completedRanges,
    semainesSansDeload: sansDeload,
    stagnations: listeStagnations,
    feuTendance: tendance,
  });

  // Un empêchement devenu durable ne se rattrape pas : il se constate. Rien
  // n'est modifié automatiquement, la décision revient à l'utilisateur.
  const contexte: Alert[] = memoire.suggestions.map((s) => ({
    type: "contexte_durable" as const,
    timing: "pre_seance" as const,
    exerciseName: s.nom,
    message: s.message,
    actionLabel: "Revoir mon programme",
    priority: "info" as const,
  }));

  return [...alertesCalculees, ...contexte];
}

// ---------------------------------------------------------------------------
// Records et volume par muscle
// ---------------------------------------------------------------------------

export interface RecordPersonnel {
  exerciseInstanceId: string;
  exerciseName: string;
  machineNom: string;
  charge: number;
  reps: number;
  estimation1RM: number;
  /**
   * Ce que `estimation1RM` mesure sur cette entrée.
   *
   * `kilos` sur une charge libre, `indice_local` sur une pile ou un Smith —
   * comparable à lui-même, à rien d'autre. L'écran l'annonçait comme un 1RM
   * dans les deux cas.
   */
  portee: PorteeDeLaMesure;
  date: string;
  /** Vrai si la performance a été établie lors de la dernière séance. */
  recent: boolean;
  /**
   * `baseline` tant que rien n'a encore été dépassé sur cet exercice.
   *
   * Cette fonction prenait le maximum de l'historique et l'appelait « record ».
   * Sur un exercice fait une seule fois, elle décernait donc un record pour le
   * simple fait d'être monté sur la machine. Le moteur `records` tranche la
   * question depuis longtemps, avec ses tests ; il n'était appelé nulle part.
   */
  nature: NatureMesure;
}

/** Meilleure performance par machine, en distinguant référence et record. */
export async function recordsPersonnels(userId: string, limite = 20): Promise<RecordPersonnel[]> {
  const lignes = await db
    .select({
      exerciseInstanceId: setLogs.exerciseInstanceId,
      exerciseName: exercises.nom,
      machineNom: exerciseInstances.machineNom,
      charge: setLogs.charge,
      reps: setLogs.repsEffectuees,
      rpe: setLogs.rpeEffectif,
      date: sessionLogs.date,
      natureCharge: exerciseInstances.natureCharge,
      conventionCharge: exerciseInstances.conventionCharge,
    })
    .from(setLogs)
    .innerJoin(sessionLogs, eq(sessionLogs.id, setLogs.sessionLogId))
    .innerJoin(exerciseInstances, eq(exerciseInstances.id, setLogs.exerciseInstanceId))
    .innerJoin(exercises, eq(exercises.id, exerciseInstances.exerciseId))
    // Un record de charge croissante sur une assistance désignerait la séance
    // où l'on a eu le plus besoin d'aide. L'exercice a sa propre lecture — la
    // baisse de l'assistance — et n'a rien à faire dans ce classement.
    .where(and(
      eq(sessionLogs.userId, userId),
      isNull(sessionLogs.archiveLe),
      eq(exerciseInstances.natureCharge, "resistance"),
    ));

  const derniereDate = lignes.reduce((max, l) => (l.date > max ? l.date : max), "");

  const parInstance = new Map<string, typeof lignes>();
  for (const l of lignes) {
    parInstance.set(l.exerciseInstanceId, [...(parInstance.get(l.exerciseInstanceId) ?? []), l]);
  }

  const resultat: RecordPersonnel[] = [];

  for (const [instanceId, series] of parInstance) {
    const records = recordsDeLExercice(
      series.map((s) => ({
        date: s.date,
        charge: s.charge,
        reps: s.reps,
        // RPE 8 signifie deux répétitions en réserve.
        rir: reserveDepuisRpe(s.rpe),
      })),
    );
    const meilleur = records.meilleur1RM;
    if (!meilleur) continue;

    // La nature se lit sur la plage effectivement atteinte par cette série :
    // c'est là qu'on sait si quelque chose a été dépassé ou seulement mesuré.
    const plage = records.parPlage
      .filter((p) => p.plage <= meilleur.reps)
      .sort((a, b) => b.plage - a.plage)[0];

    resultat.push({
      exerciseInstanceId: instanceId,
      exerciseName: series[0]!.exerciseName,
      machineNom: series[0]!.machineNom,
      charge: meilleur.charge,
      reps: meilleur.reps,
      estimation1RM: Math.round(meilleur.valeur),
      portee: porteeDeLaMesure(series[0]!),
      date: meilleur.date,
      recent: meilleur.date === derniereDate,
      nature: plage?.nature ?? "baseline",
    });
  }

  return resultat
    // Les records d'abord : ce qui a été dépassé prime sur ce qui a été mesuré.
    .sort((a, b) =>
      a.nature === b.nature
        ? b.estimation1RM - a.estimation1RM
        : a.nature === "record" ? -1 : 1,
    )
    .slice(0, limite);
}

export interface VolumeMuscle {
  muscle: string;
  /** Tonnage : charge × répétitions. */
  volume: number;
  series: number;
}

/**
 * Volume hebdomadaire par muscle.
 *
 * Les statistiques ne raisonnaient que par pilier. Les muscles secondaires,
 * absents du modèle jusqu'en phase 3, rendaient impossible tout calcul du volume
 * réel : un développé couché ne travaille pas que les pectoraux.
 *
 * Un muscle secondaire compte pour moitié — convention simple et assumée, pas une
 * mesure physiologique. Elle est déclarée une seule fois, dans les seuils du
 * bilan : deux moitiés qui divergent donneraient deux volumes différents pour
 * le même entraînement selon l'écran consulté.
 */
export async function volumeParMuscle(userId: string, depuisISO: string): Promise<VolumeMuscle[]> {
  const lignes = await db
    .select({
      charge: setLogs.charge,
      reps: setLogs.repsEffectuees,
      musclesPrincipaux: exercises.musclesPrincipaux,
      musclesSecondaires: exercises.musclesSecondaires,
    })
    .from(setLogs)
    .innerJoin(sessionLogs, eq(sessionLogs.id, setLogs.sessionLogId))
    .innerJoin(exerciseInstances, eq(exerciseInstances.id, setLogs.exerciseInstanceId))
    .innerJoin(exercises, eq(exercises.id, exerciseInstances.exerciseId))
    .where(and(and(eq(sessionLogs.userId, userId), isNull(sessionLogs.archiveLe)), gte(sessionLogs.date, depuisISO)));

  const cumul = new Map<string, VolumeMuscle>();

  const ajouter = (muscle: string, volume: number, series: number) => {
    const actuel = cumul.get(muscle) ?? { muscle, volume: 0, series: 0 };
    actuel.volume += volume;
    actuel.series += series;
    cumul.set(muscle, actuel);
  };

  for (const l of lignes) {
    const tonnage = l.charge * l.reps;
    for (const m of l.musclesPrincipaux ?? []) ajouter(m, tonnage, 1);
    for (const m of l.musclesSecondaires ?? []) {
      ajouter(m, tonnage * SEUILS.poidsMuscleSecondaire, SEUILS.poidsMuscleSecondaire);
    }
  }

  return [...cumul.values()]
    .map((v) => ({ ...v, volume: Math.round(v.volume), series: Math.round(v.series * 2) / 2 }))
    .sort((a, b) => b.volume - a.volume);
}
