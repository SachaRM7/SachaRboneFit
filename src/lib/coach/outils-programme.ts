import { db } from "@/db/client";
import { setLogs, sessionLogs, exercises, exerciseInstances, gyms, users, dailyStates, programmeBlocs } from "@/db/schema";
import { and, eq, gte, desc, isNull } from "drizzle-orm";
import { versMuscle, MUSCLES, type Muscle } from "@/lib/referentiels/muscles";
import { libelleMuscle } from "@/lib/referentiels/libelles";
import { semainesSansDeload } from "@/services/progression";
import { classerEtatCycle, type EntreeSeance, type PhaseCycle } from "@/lib/engine/etat-cycle";
import {
  validerSeance,
  type ExercicePropose,
  type ContrainteMuscle,
} from "@/lib/engine/validation-seance";
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

/** Séries et dernière sollicitation par muscle, sur une fenêtre donnée. */
async function activiteMusculaire(userId: string, jours: number) {
  const lignes = await db
    .select({
      date: sessionLogs.date,
      musclesPrincipaux: exercises.musclesPrincipaux,
      musclesSecondaires: exercises.musclesSecondaires,
    })
    .from(setLogs)
    .innerJoin(sessionLogs, eq(sessionLogs.id, setLogs.sessionLogId))
    .innerJoin(exerciseInstances, eq(exerciseInstances.id, setLogs.exerciseInstanceId))
    .innerJoin(exercises, eq(exercises.id, exerciseInstances.exerciseId))
    .where(and(eq(sessionLogs.userId, userId), gte(sessionLogs.date, ilYaJours(jours))));

  const parMuscle = new Map<string, { series: number; jours: Set<string>; derniere: string | null }>();

  const ajouter = (brut: string, poids: number, date: string) => {
    const muscle = versMuscle(brut);
    if (!muscle) return;
    const actuel = parMuscle.get(muscle) ?? { series: 0, jours: new Set<string>(), derniere: null };
    actuel.series += poids;
    actuel.jours.add(date);
    // Les dates sont en ISO : la comparaison lexicographique suffit.
    if (!actuel.derniere || date > actuel.derniere) actuel.derniere = date;
    parMuscle.set(muscle, actuel);
  };

  for (const l of lignes) {
    for (const m of l.musclesPrincipaux ?? []) ajouter(m, 1, l.date);
    // Un muscle secondaire reçoit une fraction du stimulus : le compter plein
    // gonflerait artificiellement le volume hebdomadaire.
    for (const m of l.musclesSecondaires ?? []) ajouter(m, 0.5, l.date);
  }

  return parMuscle;
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

/** Le type de cycle stocké en base ramené aux phases du moteur. */
function phaseDepuisTypeCycle(type: string | null | undefined): PhaseCycle {
  const t = (type ?? "").toLowerCase();
  if (t.includes("decharge") || t.includes("deload")) return "decharge";
  if (t.includes("surcharge") || t.includes("overreach") || t.includes("intensification")) return "surcharge";
  if (t.includes("mecanique") || t.includes("hypertroph") || t.includes("accumulation") || t.includes("force")) {
    return "accumulation";
  }
  return "hors_cycle";
}

async function etatDuCycle(_p: Record<string, unknown>, userId: string): Promise<ToolExecutionResult> {
  const bloc = await db.query.programmeBlocs.findFirst({
    where: and(eq(programmeBlocs.userId, userId), eq(programmeBlocs.actif, true)),
  });

  const seances = await db.query.sessionLogs.findMany({
    where: eq(sessionLogs.userId, userId),
    orderBy: [desc(sessionLogs.date)],
    limit: 8,
  });

  const entrees: EntreeSeance[] = await Promise.all(
    seances.map(async (s) => {
      const series = await db.query.setLogs.findMany({ where: eq(setLogs.sessionLogId, s.id) });
      const meilleur = series.reduce((max, x) => {
        const estime = x.charge * (1 + x.repsEffectuees / 30);
        return estime > max ? estime : max;
      }, 0);
      const rpes = series.map((x) => x.rpeEffectif).filter((v): v is number => v !== null);
      return {
        date: s.date,
        meilleur1RM: meilleur > 0 ? Math.round(meilleur) : null,
        rpeMoyen: rpes.length ? rpes.reduce((t, v) => t + v, 0) / rpes.length : null,
        seriesRealisees: series.length,
      };
    }),
  );

  const etatsRecents = await db.query.dailyStates.findMany({
    where: and(eq(dailyStates.userId, userId), gte(dailyStates.date, ilYaJours(7))),
    orderBy: [desc(dailyStates.date)],
  });

  const etat = classerEtatCycle({
    phasePrevue: phaseDepuisTypeCycle(bloc?.typeCycle),
    semainesSansDecharge: await semainesSansDeload(userId),
    seancesRecentes: entrees,
    signaux: {
      sommeilRecent: etatsRecents.map((e) => e.sommeilHeures ?? 7),
      courbatureMax: Math.max(
        0,
        ...etatsRecents.flatMap((e) => (e.courbatures ?? []).map((c) => c.intensite)),
      ),
      douleurSignalee: etatsRecents.some((e) =>
        (e.courbatures ?? []).some((c) => c.intensite >= 8),
      ),
    },
  });

  return ok(JSON.stringify({
    bloc: bloc ? { nom: bloc.nom, typeCycle: bloc.typeCycle, semaine: bloc.semaineActuelle } : null,
    ...etat,
  }));
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
    db.query.gyms.findMany({ where: eq(gyms.userId, userId) }),
    db.query.exerciseInstances.findMany({
      where: eq(exerciseInstances.userId, userId),
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

  const activite = await activiteMusculaire(userId, 21);
  const joursDepuisDernierTravail: Record<string, number> = {};
  for (const [muscle, a] of activite) {
    if (a.derniere) joursDepuisDernierTravail[muscle] = joursEcoules(a.derniere);
  }

  const contraintesActives = await db.query.contraintes.findMany({
    where: (c, { and, eq, isNull }) => and(eq(c.userId, userId), isNull(c.dateFin)),
  });
  const contraintes: ContrainteMuscle[] = contraintesActives.map((c) => ({
    muscle: c.muscle,
    severite: c.severite,
  }));

  const resultat = validerSeance(exercicesProposes, {
    machinesDisponibles: duSite.map((i) => ({
      exerciseInstanceId: i.id,
      nom: (i.exercise as { nom?: string } | null)?.nom ?? i.machineNom,
    })),
    joursDepuisDernierTravail,
    contraintes,
    dureeDisponibleMinutes:
      Number(p.dureeDisponibleMinutes) || profil?.dureeSeanceCibleMinutes || 60,
    musclesAttendus: Array.isArray(p.musclesAttendus)
      ? (p.musclesAttendus as unknown[]).filter((m): m is string => typeof m === "string")
      : undefined,
  });

  return ok(JSON.stringify({
    salle: salle.nom,
    ...resultat,
    consigne: resultat.valide
      ? "Séance conforme. Tu peux la présenter."
      : "Séance refusée. Corrige les anomalies bloquantes et revalide avant de répondre.",
  }));
}

// ---------------------------------------------------------------------------

export const DEFINITIONS_PROGRAMME: CoachTool[] = [
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
  get_weekly_muscle_volume: volumeHebdomadaire,
  get_muscle_frequency: frequenceMusculaire,
  get_muscle_recovery_status: recuperationMusculaire,
  get_cycle_phase: etatDuCycle,
  validate_session: validerProposition,
};
