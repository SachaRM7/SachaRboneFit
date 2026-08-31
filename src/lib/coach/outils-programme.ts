import { db } from "@/db/client";
import { setLogs, sessionLogs, exercises, exerciseInstances, gyms, users, dailyStates, programmeBlocs } from "@/db/schema";
import { and, eq, gte, desc, isNull } from "drizzle-orm";
import { versMuscle, MUSCLES, type Muscle } from "@/lib/referentiels/muscles";
import { libelleMuscle } from "@/lib/referentiels/libelles";
import { semainesSansDeload } from "@/services/progression";
/**
 * `mesurerCycle` vit desormais dans les services : l'ecran Programme en a
 * besoin des memes mesures, et le laisser ici aurait impose soit d'importer
 * les internes du coach depuis une page, soit de reclasser l'etat une seconde
 * fois. Le reexport garde ces outils inchanges.
 */
export { mesurerCycle, phaseDepuisTypeCycle } from "@/services/cycle";
import { mesurerCycle } from "@/services/cycle";
import {
  validerSeance,
  type ExercicePropose,
  type ContrainteMuscle,
  type EtatMuscle,
} from "@/lib/engine/validation-seance";
import { validerImpactSemaine } from "@/lib/engine/validation-semaine";
import type { CoachTool, ToolExecutor, ToolExecutionResult } from "./tools";

/**
 * Outils de programmation.
 *
 * Ils servent la séparation demandée : le modèle propose et raisonne, ce code
 * mesure et refuse. `validate_session` en est la pièce centrale — une séance
 * générée n'atteint l'écran qu'après être passée par un contrôle déterministe,
 * et les anomalies lui reviennent formulées assez précisément pour qu'il
 * corrige lui-même.
 *
 * Aucun outil ici n'écrit en base. Créer un mésocycle ou déclencher une
 * décharge modifie durablement l'entraînement : ces actions attendent une
 * confirmation à l'écran, pas un appel de fonction.
 */

function ok(output: string): ToolExecutionResult {
  return { success: true, output };
}

function echec(raison: string): ToolExecutionResult {
  return { success: false, output: raison };
}

function ilYaJours(jours: number): string {
  const d = new Date();
  d.setDate(d.getDate() - jours);
  return d.toISOString().slice(0, 10);
}

function joursEcoules(dateISO: string): number {
  const ecart = Date.now() - new Date(`${dateISO}T00:00:00Z`).getTime();
  return Math.max(0, Math.floor(ecart / 86_400_000));
}

interface ActiviteMuscle {
  series: number;
  jours: Set<string>;
  derniere: string | null;
  /** Séries et RIR de la dernière exposition : ce que la dette a coûté. */
  seriesDerniereExposition: number;
  rirsDerniereExposition: number[];
}

/**
 * Activité par muscle sur une fenêtre donnée.
 *
 * Le score de récupération ne se contente pas d'une date : deux jours après six
 * séries loin de l'échec n'est pas deux jours après vingt séries à RIR 0. On
 * conserve donc le coût de la dernière exposition, pas seulement son moment.
 */
export async function activiteMusculaire(userId: string, jours: number) {
  const lignes = await db
    .select({
      date: sessionLogs.date,
      rpe: setLogs.rpeEffectif,
      musclesPrincipaux: exercises.musclesPrincipaux,
      musclesSecondaires: exercises.musclesSecondaires,
    })
    .from(setLogs)
    .innerJoin(sessionLogs, eq(sessionLogs.id, setLogs.sessionLogId))
    .innerJoin(exerciseInstances, eq(exerciseInstances.id, setLogs.exerciseInstanceId))
    .innerJoin(exercises, eq(exercises.id, exerciseInstances.exerciseId))
    .where(and(and(eq(sessionLogs.userId, userId), isNull(sessionLogs.archiveLe)), gte(sessionLogs.date, ilYaJours(jours))));

  const parMuscle = new Map<string, ActiviteMuscle>();

  const ajouter = (brut: string, poids: number, date: string, rpe: number | null) => {
    const muscle = versMuscle(brut);
    if (!muscle) return;
    const actuel = parMuscle.get(muscle) ?? {
      series: 0, jours: new Set<string>(), derniere: null,
      seriesDerniereExposition: 0, rirsDerniereExposition: [],
    };
    actuel.series += poids;
    actuel.jours.add(date);

    // Les dates sont en ISO : la comparaison lexicographique suffit.
    if (!actuel.derniere || date > actuel.derniere) {
      actuel.derniere = date;
      actuel.seriesDerniereExposition = 0;
      actuel.rirsDerniereExposition = [];
    }
    if (date === actuel.derniere) {
      actuel.seriesDerniereExposition += poids;
      // Le RPE est saisi, le RIR s'en déduit : à 10 il ne reste rien en réserve.
      if (rpe !== null) actuel.rirsDerniereExposition.push(Math.max(0, 10 - rpe));
    }

    parMuscle.set(muscle, actuel);
  };

  for (const l of lignes) {
    for (const m of l.musclesPrincipaux ?? []) ajouter(m, 1, l.date, l.rpe);
    // Un muscle secondaire reçoit une fraction du stimulus : le compter plein
    // gonflerait artificiellement le volume hebdomadaire.
    for (const m of l.musclesSecondaires ?? []) ajouter(m, 0.5, l.date, l.rpe);
  }

  return parMuscle;
}

/** Ce que le validateur attend pour juger la récupération d'un muscle. */
export function etatMusclesDepuis(activite: Map<string, ActiviteMuscle>, courbatures: Map<string, number>) {
  const etats: Record<string, EtatMuscle> = {};
  for (const [muscle, a] of activite) {
    const rirs = a.rirsDerniereExposition;
    etats[muscle] = {
      joursDepuis: a.derniere ? joursEcoules(a.derniere) : null,
      seriesDerniereExposition: Math.round(a.seriesDerniereExposition),
      rirMoyen: rirs.length ? rirs.reduce((t, v) => t + v, 0) / rirs.length : null,
      courbature: courbatures.get(muscle) ?? 0,
    };
  }
  return etats;
}

/** Courbatures signalées aujourd'hui, par muscle canonique. */
export async function courbaturesDuJour(userId: string): Promise<Map<string, number>> {
  const etat = await db.query.dailyStates.findFirst({
    where: and(eq(dailyStates.userId, userId), eq(dailyStates.date, new Date().toISOString().slice(0, 10))),
  });
  return new Map(
    (etat?.courbatures ?? [])
      .map((c) => [versMuscle(c.muscle), c.intensite] as const)
      .filter((e): e is [Muscle, number] => e[0] !== null),
  );
}

/**
 * Cibles hebdomadaires de séries par muscle.
 *
 * Faute de cible saisie par l'utilisateur, on retient une fourchette moyenne
 * défendable pour l'hypertrophie, relevée sur les muscles qu'il a désignés
 * comme prioritaires. Ce n'est pas une vérité physiologique : c'est un repère,
 * qui n'existe que pour donner au contrôle hebdomadaire quelque chose à
 * comparer. Une cible saisie explicitement devra le remplacer.
 */
const CIBLE_HEBDO_PAR_DEFAUT = 12;
const CIBLE_HEBDO_PRIORITAIRE = 18;

export function ciblesHebdo(prioritairesBruts: string[]): Record<string, number> {
  const prioritaires = new Set(
    prioritairesBruts.map(versMuscle).filter((m): m is Muscle => m !== null),
  );
  return Object.fromEntries(
    MUSCLES.map((m) => [m, prioritaires.has(m) ? CIBLE_HEBDO_PRIORITAIRE : CIBLE_HEBDO_PAR_DEFAUT]),
  );
}

// ---------------------------------------------------------------------------

async function volumeHebdomadaire(_p: Record<string, unknown>, userId: string): Promise<ToolExecutionResult> {
  const activite = await activiteMusculaire(userId, 7);
  return ok(JSON.stringify({
    fenetreJours: 7,
    parMuscle: [...activite.entries()]
      .map(([muscle, a]) => ({
        muscle: libelleMuscle(muscle),
        series: Math.round(a.series * 2) / 2,
        expositions: a.jours.size,
      }))
      .sort((a, b) => b.series - a.series),
    // Les muscles absents sont aussi une information : ils disent ce que la
    // semaine n'a pas couvert.
    jamaisTravailles: MUSCLES.filter((m) => !activite.has(m)).map(libelleMuscle),
  }));
}

async function frequenceMusculaire(_p: Record<string, unknown>, userId: string): Promise<ToolExecutionResult> {
  const activite = await activiteMusculaire(userId, 28);
  return ok(JSON.stringify({
    fenetreJours: 28,
    parMuscle: [...activite.entries()]
      .map(([muscle, a]) => ({
        muscle: libelleMuscle(muscle),
        expositions: a.jours.size,
        expositionsParSemaine: Math.round((a.jours.size / 4) * 10) / 10,
      }))
      .sort((a, b) => b.expositions - a.expositions),
  }));
}

async function recuperationMusculaire(_p: Record<string, unknown>, userId: string): Promise<ToolExecutionResult> {
  const activite = await activiteMusculaire(userId, 21);

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const etat = await db.query.dailyStates.findFirst({
    where: and(eq(dailyStates.userId, userId), eq(dailyStates.date, aujourdhui)),
  });
  const courbatures = new Map(
    (etat?.courbatures ?? [])
      .map((c) => [versMuscle(c.muscle), c.intensite] as const)
      .filter((e): e is [Muscle, number] => e[0] !== null),
  );

  return ok(JSON.stringify({
    muscles: MUSCLES.map((muscle) => {
      const a = activite.get(muscle);
      const jours = a?.derniere ? joursEcoules(a.derniere) : null;
      return {
        muscle: libelleMuscle(muscle),
        joursDepuisDernierTravail: jours,
        courbatureAujourdhui: courbatures.get(muscle) ?? null,
      };
    }).filter((m) => m.joursDepuisDernierTravail !== null || m.courbatureAujourdhui !== null),
  }));
}

// ---------------------------------------------------------------------------

async function etatDuCycle(_p: Record<string, unknown>, userId: string): Promise<ToolExecutionResult> {
  return ok(JSON.stringify(await mesurerCycle(userId)));
}

// ---------------------------------------------------------------------------
// La pièce centrale : contrôle déterministe d'une séance proposée
// ---------------------------------------------------------------------------

interface EntreeSeanceProposee {
  exerciseInstanceId?: unknown;
  series?: unknown;
  repsMin?: unknown;
  repsMax?: unknown;
  reposSecondes?: unknown;
}

async function validerProposition(p: Record<string, unknown>, userId: string): Promise<ToolExecutionResult> {
  const brut = Array.isArray(p.exercices) ? (p.exercices as EntreeSeanceProposee[]) : null;
  if (!brut) return echec("exercices doit être un tableau");

  const salleId = typeof p.gymId === "string" ? p.gymId : null;

  const [profil, salles, instances] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, userId) }),
    db.query.gyms.findMany({ where: isNull(gyms.archiveLe) }),
    db.query.exerciseInstances.findMany({
      where: isNull(exerciseInstances.archiveLe),
      with: { exercise: true },
    }),
  ]);

  const salle = salleId ? salles.find((s) => s.id === salleId) : salles[0];
  if (!salle) return echec("Aucune salle enregistrée");

  const duSite = instances.filter((i) => i.gymId === salle.id);
  const parId = new Map(duSite.map((i) => [i.id, i]));

  // La séance proposée est enrichie ici : le modèle ne fournit que des
  // identifiants, les muscles et le pilier viennent de la base. Il ne peut donc
  // pas contourner un contrôle en déclarant de faux muscles.
  const exercicesProposes: ExercicePropose[] = brut.map((e) => {
    const instance = typeof e.exerciseInstanceId === "string" ? parId.get(e.exerciseInstanceId) : undefined;
    const fiche = instance?.exercise as { nom?: string; pilier?: string; musclesPrincipaux?: string[] } | null;
    return {
      exerciseInstanceId: String(e.exerciseInstanceId ?? ""),
      nom: fiche?.nom ?? instance?.machineNom ?? String(e.exerciseInstanceId ?? "inconnu"),
      series: Number(e.series) || 0,
      repsMin: Number(e.repsMin) || 0,
      repsMax: Number(e.repsMax) || 0,
      reposSecondes: Number(e.reposSecondes) || 120,
      musclesPrincipaux: fiche?.musclesPrincipaux ?? [],
      pilier: fiche?.pilier ?? "",
    };
  });

  const [activite, activiteSemaine, cycle, courbatures] = await Promise.all([
    activiteMusculaire(userId, 21),
    activiteMusculaire(userId, 7),
    mesurerCycle(userId),
    courbaturesDuJour(userId),
  ]);

  const contraintesActives = await db.query.contraintes.findMany({
    where: (c, { and, eq, isNull }) => and(eq(c.userId, userId), isNull(c.dateFin)),
  });
  const contraintes: ContrainteMuscle[] = contraintesActives.map((c) => ({
    muscle: c.muscle,
    severite: c.severite,
  }));

  const seriesSemaineParMuscle: Record<string, number> = {};
  for (const [muscle, a] of activiteSemaine) seriesSemaineParMuscle[muscle] = Math.round(a.series);

  const resultat = validerSeance(exercicesProposes, {
    machinesDisponibles: duSite.map((i) => ({
      exerciseInstanceId: i.id,
      nom: (i.exercise as { nom?: string } | null)?.nom ?? i.machineNom,
    })),
    etatMuscles: etatMusclesDepuis(activite, courbatures),
    contraintes,
    dureeDisponibleMinutes:
      Number(p.dureeDisponibleMinutes) || profil?.dureeSeanceCibleMinutes || 60,
    phase: cycle.phase,
    tendancePerformance: cycle.tendancePerformance,
    seriesSemaineParMuscle,
    cibleHebdoParMuscle: ciblesHebdo(profil?.objectifMusclesPrioritaires ?? []),
    musclesAttendus: Array.isArray(p.musclesAttendus)
      ? (p.musclesAttendus as unknown[]).filter((m): m is string => typeof m === "string")
      : undefined,
  });

  // Une séance peut être irréprochable et donner une semaine bancale : le
  // contrôle hebdomadaire suit immédiatement, sur la même proposition.
  const seriesProposees: Record<string, number> = {};
  for (const e of exercicesProposes) {
    for (const brut of e.musclesPrincipaux) {
      const muscle = versMuscle(brut);
      if (muscle) seriesProposees[muscle] = (seriesProposees[muscle] ?? 0) + e.series;
    }
  }

  const semaine = validerImpactSemaine({
    seriesRealisees: seriesSemaineParMuscle,
    seriesProposees,
    cibles: ciblesHebdo(profil?.objectifMusclesPrioritaires ?? []),
    prioritaires: profil?.objectifMusclesPrioritaires ?? [],
    // La semaine d'entraînement se termine le dimanche.
    joursRestants: Math.max(0, 7 - (new Date().getDay() || 7)),
  });

  const valide = resultat.valide && semaine.valide;

  return ok(JSON.stringify({
    salle: salle.nom,
    seance: resultat,
    semaine,
    valide,
    consigne: valide
      ? "Séance conforme, et cohérente avec la semaine. Tu peux la présenter."
      : "Séance refusée. Corrige les anomalies bloquantes — de la séance comme de la semaine — et revalide avant de répondre. Les avertissements se discutent avec l'athlète, ils n'empêchent rien.",
  }));
}

async function validerSemaine(p: Record<string, unknown>, userId: string): Promise<ToolExecutionResult> {
  const profil = await db.query.users.findFirst({ where: eq(users.id, userId) });
  const activiteSemaine = await activiteMusculaire(userId, 7);

  const seriesRealisees: Record<string, number> = {};
  for (const [muscle, a] of activiteSemaine) seriesRealisees[muscle] = Math.round(a.series);

  const proposees = (p.seriesProposees ?? {}) as Record<string, unknown>;
  const seriesProposees: Record<string, number> = {};
  for (const [brut, valeur] of Object.entries(proposees)) {
    const n = Number(valeur);
    if (Number.isFinite(n)) seriesProposees[brut] = n;
  }

  const resultat = validerImpactSemaine({
    seriesRealisees,
    seriesProposees,
    cibles: ciblesHebdo(profil?.objectifMusclesPrioritaires ?? []),
    prioritaires: profil?.objectifMusclesPrioritaires ?? [],
    joursRestants: Number.isFinite(Number(p.joursRestants))
      ? Number(p.joursRestants)
      : Math.max(0, 7 - (new Date().getDay() || 7)),
  });

  return ok(JSON.stringify(resultat));
}

// ---------------------------------------------------------------------------

export const DEFINITIONS_PROGRAMME: CoachTool[] = [
  {
    name: "validate_week_impact",
    description:
      "Verifie l'equilibre de la semaine si l'on y ajoute un volume donne. Une seance peut etre irreprochable et donner une semaine bancale — vingt-deux series d'epaules contre quatre d'ischios. Signale les ecarts aux cibles et les desequilibres entre antagonistes. `validate_session` l'appelle deja ; utilise cet outil pour raisonner sur plusieurs seances a venir.",
    input_schema: {
      type: "object",
      properties: {
        seriesProposees: {
          type: "object",
          description: "Series envisagees par muscle, ex. { pectoraux: 8, dorsaux: 6 }",
        },
        joursRestants: { type: "number", description: "Jours restants dans la semaine" },
      },
      required: ["seriesProposees"],
    },
  },
  {
    name: "get_weekly_muscle_volume",
    description:
      "Séries par muscle sur sept jours, et nombre d'expositions. Liste aussi les muscles non travaillés — c'est ce qui manque qui décide de la prochaine séance.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_muscle_frequency",
    description: "Expositions par muscle sur quatre semaines, ramenées à une moyenne hebdomadaire.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_muscle_recovery_status",
    description:
      "Pour chaque muscle : jours écoulés depuis la dernière sollicitation, et courbature signalée aujourd'hui. À consulter avant de composer une séance.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_cycle_phase",
    description:
      "État du cycle mesuré par l'application : phase du bloc actif, statut de fatigue, tendance des performances, et si une décharge se justifie. Les motifs listent ce qui a conduit au classement. Ne juge pas la fatigue toi-même, appelle ceci.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "validate_session",
    description:
      "Contrôle une séance que tu proposes AVANT de la présenter. Vérifie que chaque machine existe dans la salle, qu'aucun exercice n'est répété, que les contraintes physiques sont respectées, que la récupération est suffisante et que la durée tient. Si valide vaut false, corrige les anomalies bloquantes et rappelle cet outil. N'annonce jamais une séance sans l'avoir validée.",
    input_schema: {
      type: "object",
      properties: {
        exercices: {
          type: "array",
          description: "La séance proposée, dans l'ordre",
          items: {
            type: "object",
            properties: {
              exerciseInstanceId: { type: "string", description: "Identifiant issu de get_gym_equipment" },
              series: { type: "number" },
              repsMin: { type: "number" },
              repsMax: { type: "number" },
              reposSecondes: { type: "number" },
            },
            required: ["exerciseInstanceId", "series", "repsMin", "repsMax"],
          },
        },
        gymId: { type: "string", description: "Salle du jour" },
        dureeDisponibleMinutes: { type: "number" },
        musclesAttendus: {
          type: "array",
          items: { type: "string" },
          description: "Muscles que la semaine attend encore",
        },
      },
      required: ["exercices"],
    },
  },
];

export const EXECUTEURS_PROGRAMME: Record<string, ToolExecutor> = {
  validate_week_impact: validerSemaine,
  get_weekly_muscle_volume: volumeHebdomadaire,
  get_muscle_frequency: frequenceMusculaire,
  get_muscle_recovery_status: recuperationMusculaire,
  get_cycle_phase: etatDuCycle,
  validate_session: validerProposition,
};
