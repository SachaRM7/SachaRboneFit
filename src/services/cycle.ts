import { db } from "@/db/client";
import {
  dailyStates, exerciseInTemplate, exerciseInstances, exercises, programmeBlocs,
  seanceTemplates, sessionLogs, sessionPlanItems, setLogs,
} from "@/db/schema";
import { and, asc, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { classerEtatCycle, type EntreeSeance, type PhaseCycle } from "@/lib/engine/etat-cycle";
import { estimer1RM, reserveDepuisRpe } from "@/lib/engine/records";
import { empecheParLesCirconstances, type ContexteAdaptation } from "@/lib/engine/tracabilite";
import {
  positionDansLeCycle, semaineDuProgramme, dechargeJustifiee,
  type PositionDansLeCycle, type SeanceDeLaSemaine,
} from "@/lib/engine/semaine-programme";
import { DOMINANTES, libelleCycle, type LibelleCycle } from "@/lib/referentiels/cycle";
import { semainesSansDeload } from "./progression";
import { memoireEmpechements } from "./memoire";

/**
 * L'état du cycle, pour l'écran Programme comme pour le coach.
 *
 * `mesurerCycle` vivait dans les outils du coach. L'écran en a besoin des mêmes
 * mesures : le laisser là aurait signifié soit importer les internes du coach
 * depuis une page, soit reclasser l'état une seconde fois avec ses propres
 * seuils. Il est ici, et les outils du coach le réexportent — leur
 * comportement est inchangé.
 */

const ilYaJours = (jours: number) =>
  new Date(Date.now() - jours * 86_400_000).toISOString().slice(0, 10);

/**
 * Le type de cycle stocké en base ramené aux phases du moteur.
 *
 * La correspondance est explicite pour les dominantes actuelles : sans elle,
 * un cycle « volume » ou « densite » ne correspondait à aucun des motifs
 * hérités et retombait sur `hors_cycle` — ce qui change le seuil de
 * récupération et les règles de décharge. La phase décide de comportements
 * d'entraînement : elle ne peut pas dépendre d'une recherche de sous-chaîne.
 *
 * L'ordre compte : « décharge » et « surcharge » contiennent tous deux
 * « charge », et doivent être reconnus avant la dominante du même nom.
 */
export function phaseDepuisTypeCycle(type: string | null | undefined): PhaseCycle {
  const t = (type ?? "").toLowerCase().trim();
  if (t.includes("decharge") || t.includes("deload")) return "decharge";
  if (t.includes("surcharge")) return "surcharge";
  // Les quatre dominantes décrivent un travail d'accumulation : elles disent
  // ce qu'on fait varier, pas qu'on cherche à dépasser la capacité du moment.
  if ((DOMINANTES as readonly string[]).includes(t)) return "accumulation";
  if (t.includes("overreach") || t.includes("intensification")) return "surcharge";
  if (t.includes("mecanique") || t.includes("hypertroph") || t.includes("accumulation") || t.includes("force")) {
    return "accumulation";
  }
  return "hors_cycle";
}

/**
 * La semaine courante d'un bloc — définition de référence, unique.
 *
 * `programme_blocs.semaine_actuelle` est écrite à 1 et jamais incrémentée.
 * Tout ce qui parle de « la semaine » passe donc par ici : l'écran Programme,
 * le tableau de bord, le prompt du coach, ses outils, et le classement de
 * l'état du cycle. Sans ce point unique, l'interface disait « semaine 4 »
 * pendant que le coach recevait « semaine 1 » et raisonnait dessus.
 */
export function positionDuBloc(
  bloc: { dateDebut: string; dateFinPrevue: string | null },
  aujourdhui = new Date().toISOString().slice(0, 10),
): PositionDansLeCycle {
  return positionDansLeCycle(bloc.dateDebut, bloc.dateFinPrevue, aujourdhui);
}

/**
 * Mesure de l'état du cycle, partagée.
 *
 * Le validateur en a besoin autant que l'outil de lecture : la phase décide
 * du seuil de récupération et des règles de décharge.
 */
export async function mesurerCycle(userId: string) {
  const bloc = await db.query.programmeBlocs.findFirst({
    where: and(and(eq(programmeBlocs.userId, userId), isNull(programmeBlocs.archiveLe)), eq(programmeBlocs.actif, true)),
  });

  // Une jointure plutôt qu'une requête par séance : la version précédente
  // interrogeait la base huit fois pour huit séances.
  const seances = await db.query.sessionLogs.findMany({
    where: and(eq(sessionLogs.userId, userId), isNull(sessionLogs.archiveLe)),
    orderBy: [desc(sessionLogs.date)],
    limit: 8,
  });

  const series = seances.length
    ? await db
        .select({
          sessionLogId: setLogs.sessionLogId,
          charge: setLogs.charge,
          reps: setLogs.repsEffectuees,
          rpe: setLogs.rpeEffectif,
        })
        .from(setLogs)
        .where(inArray(setLogs.sessionLogId, seances.map((s) => s.id)))
    : [];

  const entrees: EntreeSeance[] = seances.map((s) => {
    const siennes = series.filter((x) => x.sessionLogId === s.id);
    const meilleur = siennes.reduce(
      (max, x) =>
        Math.max(
          max,
          estimer1RM({
            date: s.date,
            charge: x.charge,
            reps: x.reps,
            rir: reserveDepuisRpe(x.rpe),
          }),
        ),
      0,
    );
    const rpes = siennes.map((x) => x.rpe).filter((v): v is number => v !== null);
    return {
      date: s.date,
      meilleur1RM: meilleur > 0 ? Math.round(meilleur) : null,
      rpeMoyen: rpes.length ? rpes.reduce((t, v) => t + v, 0) / rpes.length : null,
      seriesRealisees: siennes.length,
    };
  });

  const etatsRecents = await db.query.dailyStates.findMany({
    where: and(eq(dailyStates.userId, userId), gte(dailyStates.date, ilYaJours(7))),
    orderBy: [desc(dailyStates.date)],
  });

  const douleurSignalee = etatsRecents.some((e) =>
    (e.courbatures ?? []).some((c) => c.intensite >= 8),
  );

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
      douleurSignalee,
    },
  });

  return {
    bloc: bloc
      ? {
          nom: bloc.nom,
          typeCycle: bloc.typeCycle,
          libelleCycle: libelleCycle(bloc.typeCycle).libelle,
          // La semaine déduite, jamais la colonne figée.
          semaine: positionDuBloc(bloc).semaine,
          semainesTotal: positionDuBloc(bloc).semainesTotal,
        }
      : null,
    douleurSignalee,
    ...etat,
  };
}

// ---------------------------------------------------------------------------
// Vue de l'écran Programme
// ---------------------------------------------------------------------------

export type EtatProgramme =
  | "sans_onboarding"
  | "sans_cycle"
  | "calibration"
  | "cycle"
  | "cycle_termine";

export interface AjustementPropose {
  titre: string;
  message: string;
}

export interface VueProgramme {
  etat: EtatProgramme;
  cycle: {
    id: string;
    nom: string;
    libelle: LibelleCycle;
    dateDebut: string;
    position: PositionDansLeCycle;
    /** Séances de calibration faites sur celles prévues. Calibration seulement. */
    seancesFaites: number;
  } | null;
  /**
   * Lecture de l'état du corps. Absente tant qu'aucune séance n'existe :
   * `classerEtatCycle` renvoie sinon un classement fondé sur rien.
   */
  lecture: {
    phase: PhaseCycle;
    statutFatigue: string;
    tendancePerformance: string;
    motifs: string[];
  } | null;
  semaine: SeanceDeLaSemaine[];
  /** Décharge recommandée pour un motif corporel, jamais par le calendrier seul. */
  dechargeRecommandee: boolean;
  ajustements: AjustementPropose[];
}

/** Séances minimales avant qu'une lecture d'état ait un sens. */
const SEANCES_POUR_LIRE_LETAT = 3;

export async function vueDuProgramme(
  userId: string,
  aujourdhui = new Date().toISOString().slice(0, 10),
): Promise<VueProgramme> {
  const vide: VueProgramme = {
    etat: "sans_cycle",
    cycle: null,
    lecture: null,
    semaine: [],
    dechargeRecommandee: false,
    ajustements: [],
  };

  const bloc = await db.query.programmeBlocs.findFirst({
    where: and(
      and(eq(programmeBlocs.userId, userId), isNull(programmeBlocs.archiveLe)),
      eq(programmeBlocs.actif, true),
    ),
  });
  if (!bloc) return vide;

  const gabarits = await db.query.seanceTemplates.findMany({
    where: eq(seanceTemplates.blocId, bloc.id),
    orderBy: [asc(seanceTemplates.ordreDansSemaine)],
  });

  const lignes = gabarits.length
    ? await db
        .select({
          seanceTemplateId: exerciseInTemplate.seanceTemplateId,
          series: exerciseInTemplate.seriesCibles,
          reposSecondes: exerciseInTemplate.reposSecondes,
          pilier: exercises.pilier,
        })
        .from(exerciseInTemplate)
        .innerJoin(exerciseInstances, eq(exerciseInstances.id, exerciseInTemplate.exerciseInstanceId))
        .innerJoin(exercises, eq(exercises.id, exerciseInstances.exerciseId))
        .where(inArray(exerciseInTemplate.seanceTemplateId, gabarits.map((g) => g.id)))
    : [];

  // Les séances faites depuis le début du cycle : elles servent au décompte de
  // calibration comme à l'état de la semaine.
  const faites = await db
    .select({
      id: sessionLogs.id,
      date: sessionLogs.date,
      seanceTemplateId: sessionLogs.seanceTemplateId,
    })
    .from(sessionLogs)
    .where(
      and(
        eq(sessionLogs.userId, userId),
        isNull(sessionLogs.archiveLe),
        gte(sessionLogs.date, bloc.dateDebut),
      ),
    )
    .orderBy(asc(sessionLogs.date));

  const items = faites.length
    ? await db
        .select({
          sessionLogId: sessionPlanItems.sessionLogId,
          exerciseInstanceId: sessionPlanItems.exerciseInstanceId,
          exerciseInstancePrevuId: sessionPlanItems.exerciseInstancePrevuId,
          raisonSubstitution: sessionPlanItems.raisonSubstitution,
          contexteAdaptation: sessionPlanItems.contexteAdaptation,
        })
        .from(sessionPlanItems)
        .where(inArray(sessionPlanItems.sessionLogId, faites.map((s) => s.id)))
    : [];

  const adapteesPar = new Set(
    items
      .filter((i) =>
        empecheParLesCirconstances({
          exerciseInstanceId: i.exerciseInstanceId,
          exerciseInstancePrevuId: i.exerciseInstancePrevuId,
          raisonSubstitution: i.raisonSubstitution,
          contexteAdaptation: i.contexteAdaptation as ContexteAdaptation | null,
        }),
      )
      .map((i) => i.sessionLogId),
  );

  const semaine = semaineDuProgramme({
    gabarits: gabarits.map((g) => ({
      id: g.id,
      lettre: g.lettre,
      nom: g.nom,
      ordreDansSemaine: g.ordreDansSemaine,
      exercices: lignes
        .filter((l) => l.seanceTemplateId === g.id)
        .map((l) => ({ series: l.series, reposSecondes: l.reposSecondes, pilier: l.pilier })),
    })),
    seancesFaites: faites.map((s) => ({
      seanceTemplateId: s.seanceTemplateId,
      date: s.date,
      adaptee: adapteesPar.has(s.id),
    })),
    aujourdhui,
  });

  const position = positionDansLeCycle(bloc.dateDebut, bloc.dateFinPrevue, aujourdhui);
  const enCalibration = (bloc.typeCycle ?? "").toLowerCase() === "calibration";

  // La lecture de l'état n'a de sens qu'avec un historique. Sur une ou deux
  // séances, `classerEtatCycle` classe surtout du vide.
  const mesure = faites.length >= SEANCES_POUR_LIRE_LETAT ? await mesurerCycle(userId) : null;

  const ajustements: AjustementPropose[] = [];
  const memoire = await memoireEmpechements(userId, aujourdhui);
  for (const s of memoire.suggestions) {
    ajustements.push({ titre: "Ajustement possible", message: s.message });
  }

  return {
    etat: enCalibration ? "calibration" : position.termine ? "cycle_termine" : "cycle",
    cycle: {
      id: bloc.id,
      nom: bloc.nom,
      libelle: libelleCycle(bloc.typeCycle),
      dateDebut: bloc.dateDebut,
      position,
      seancesFaites: faites.length,
    },
    lecture: mesure
      ? {
          phase: mesure.phase,
          statutFatigue: mesure.statutFatigue,
          tendancePerformance: mesure.tendancePerformance,
          motifs: mesure.motifs,
        }
      : null,
    semaine,
    dechargeRecommandee: mesure
      ? dechargeJustifiee({
          dechargeConseillee: mesure.dechargeConseillee,
          statutFatigue: mesure.statutFatigue,
          tendancePerformance: mesure.tendancePerformance,
          douleurSignalee: mesure.douleurSignalee,
        })
      : false,
    ajustements,
  };
}
