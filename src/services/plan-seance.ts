import { db } from "@/db/client";
import {
  contraintes, dailyStates, exerciseInTemplate, exerciseInstances, exercises,
  seanceTemplates, sessionLogs, sessionPlanItems, setLogs,
} from "@/db/schema";
import { and, asc, desc, eq, isNull, or, gte } from "drizzle-orm";
import { computeFeuJour } from "@/lib/engine/feu-biologique";
import { computeVolumeAdjustment } from "@/lib/engine/volume-adjustment";
import { applyVolumeAdjustment, type ExerciseInTemplateWithDetails } from "@/lib/engine/apply-adjustment";
import { computeNextSets } from "@/lib/engine/double-progression";
import { resoudrePourSalle, type InstanceResolvable } from "@/lib/engine/resolution-salle";
import { versMuscles } from "@/lib/referentiels/muscles";
import type { DailyStateInput } from "@/lib/validators/daily-state";
import type { SessionLog, SessionPlanItem } from "@/db/schema";

/**
 * Construction de la seance du jour.
 *
 * Cette orchestration vivait dans un composant client de 153 lignes : cinq appels
 * en cascade, trois modules du moteur executes dans le navigateur, puis un passage
 * de relais par sessionStorage que la page destinataire ne relisait jamais.
 * L'ajustement de volume calcule etait donc perdu, et la charge suggeree n'etait
 * jamais reinjectee dans la seance suivante.
 *
 * Tout se fait desormais ici, cote serveur, sous transaction, et le resultat est
 * persiste dans session_plan_items : la decision existe enfin quelque part.
 */

export interface ContexteSeance {
  userId: string;
  date: string;
  gymId: string;
  seanceTemplateId: string;
}

export interface ResultatConstruction {
  seance: SessionLog;
  items: SessionPlanItem[];
  feuJour: "vert" | "orange" | "rouge";
  ajustement: { totalPct: number; raisons: string[] };
  /** Exercices retires faute d'equivalent dans la salle du jour. */
  ecartes: Array<{ exerciceNom: string; raison: string }>;
}

/** Muscles a menager : courbatures fortes du jour + contraintes actives. */
async function musclesAMenager(userId: string, etat: DailyStateInput | null): Promise<string[]> {
  const contraintesActives = await db.query.contraintes.findMany({
    where: and(
      eq(contraintes.userId, userId),
      or(isNull(contraintes.dateFin), gte(contraintes.dateFin, new Date().toISOString().slice(0, 10))),
    ),
  });

  const depuisContraintes = contraintesActives
    .filter((c) => c.severite >= 7)
    .map((c) => c.muscle);

  const depuisCourbatures = (etat?.courbatures ?? [])
    .filter((c) => c.intensite > 7)
    .map((c) => c.muscle);

  return versMuscles([...depuisContraintes, ...depuisCourbatures]);
}

/** Toutes les instances de l'utilisateur, enrichies de leur exercice. */
async function chargerParc(userId: string): Promise<InstanceResolvable[]> {
  const lignes = await db
    .select({
      id: exerciseInstances.id,
      gymId: exerciseInstances.gymId,
      exerciseId: exerciseInstances.exerciseId,
      machineNom: exerciseInstances.machineNom,
      exerciceNom: exercises.nom,
      pilier: exercises.pilier,
      profilTension: exercises.profilTension,
      categorieRole: exercises.categorieRole,
      musclesPrincipaux: exercises.musclesPrincipaux,
      equipement: exercises.equipement,
      incrementsPossibles: exerciseInstances.incrementsPossibles,
    })
    .from(exerciseInstances)
    .innerJoin(exercises, eq(exercises.id, exerciseInstances.exerciseId))
    .where(isNull(exerciseInstances.archiveLe));

  return lignes.map((l) => ({
    ...l,
    categorieRole: (l.categorieRole as InstanceResolvable["categorieRole"]) ?? "accessoire",
    musclesPrincipaux: l.musclesPrincipaux ?? [],
    incrementsPossibles: l.incrementsPossibles ?? [],
  }));
}

/** Derniere seance realisee sur cette instance, pour la double progression. */
/**
 * Dernières séries réalisées sur une machine.
 *
 * Exportée parce que l'écran de séance peut être atteint sans plan calculé :
 * il lui faut alors la même base — historique et double progression — que
 * celle utilisée à la construction du plan, sinon la charge suggérée et la
 * colonne « Dernière » restent vides.
 */
export async function derniereSeriesPour(userId: string, exerciseInstanceId: string) {
  const lignes = await db
    .select({
      sessionLogId: setLogs.sessionLogId,
      numero: setLogs.numeroSerie,
      reps: setLogs.repsEffectuees,
      charge: setLogs.charge,
      date: sessionLogs.date,
    })
    .from(setLogs)
    .innerJoin(sessionLogs, eq(sessionLogs.id, setLogs.sessionLogId))
    .where(and(eq(setLogs.exerciseInstanceId, exerciseInstanceId), and(eq(sessionLogs.userId, userId), isNull(sessionLogs.archiveLe))))
    .orderBy(desc(sessionLogs.date), desc(sessionLogs.createdAt), asc(setLogs.numeroSerie));

  if (lignes.length === 0) return null;

  const derniereSession = lignes[0]!.sessionLogId;
  return {
    sets: lignes
      .filter((l) => l.sessionLogId === derniereSession)
      .map((l) => ({ numero: l.numero, reps: l.reps, charge: l.charge })),
  };
}

export async function construireSeanceDuJour(ctx: ContexteSeance): Promise<ResultatConstruction> {
  const template = await db.query.seanceTemplates.findFirst({
    where: eq(seanceTemplates.id, ctx.seanceTemplateId),
  });
  if (!template) throw new Error("Séance introuvable");

  const etatDuJour = await db.query.dailyStates.findFirst({
    where: and(eq(dailyStates.userId, ctx.userId), eq(dailyStates.date, ctx.date)),
  });

  const etat: DailyStateInput | null = etatDuJour
    ? {
        date: etatDuJour.date,
        sommeilHeures: etatDuJour.sommeilHeures ?? 7,
        jeuneBool: etatDuJour.jeuneBool ?? false,
        shiftRecentBool: etatDuJour.shiftRecentBool ?? false,
        shiftType: (etatDuJour.shiftType as DailyStateInput["shiftType"]) ?? "aucun",
        energieDepart: etatDuJour.energieDepart ?? 7,
        courbatures: etatDuJour.courbatures ?? [],
      }
    : null;

  const feuJour = etat ? computeFeuJour(etat).feu : "vert";

  const lignesTemplate = await db.query.exerciseInTemplate.findMany({
    where: eq(exerciseInTemplate.seanceTemplateId, ctx.seanceTemplateId),
    orderBy: [asc(exerciseInTemplate.ordre)],
  });

  const parc = await chargerParc(ctx.userId);
  const parcDuJour = parc.filter((i) => i.gymId === ctx.gymId);
  const parcParId = new Map(parc.map((i) => [i.id, i]));
  const aMenager = await musclesAMenager(ctx.userId, etat);

  // --- Resolution vers la salle du jour ---
  const retenues: string[] = [];
  const ecartes: ResultatConstruction["ecartes"] = [];
  const resolus: Array<{
    ligne: (typeof lignesTemplate)[number];
    instance: InstanceResolvable;
    substitutionDe: string | null;
    raison: string | null;
  }> = [];

  for (const ligne of lignesTemplate) {
    const prevu = parcParId.get(ligne.exerciseInstanceId);
    if (!prevu) continue;

    const resolution = resoudrePourSalle(prevu, parcDuJour, retenues, aMenager);
    if (!resolution.instance) {
      ecartes.push({ exerciceNom: prevu.exerciceNom, raison: resolution.raison ?? "Indisponible" });
      continue;
    }

    retenues.push(resolution.instance.id);
    resolus.push({
      ligne,
      instance: resolution.instance,
      substitutionDe: resolution.niveau === "identique" ? null : prevu.id,
      raison: resolution.raison,
    });
  }

  // --- Ajustement du volume ---
  const musclesCibles = resolus.flatMap((r) => r.instance.musclesPrincipaux);
  const ajustement = etat
    ? computeVolumeAdjustment(etat, musclesCibles)
    : { totalPct: 0, raisons: [], proposeDeloadImprovise: false, proposeReport: false, musclesAReporter: [] };

  const pourAjustement: ExerciseInTemplateWithDetails[] = resolus.map((r) => ({
    exerciseInstanceId: r.instance.id,
    exerciseInTemplateId: r.ligne.id,
    exerciseName: r.instance.exerciceNom,
    machineNom: r.instance.machineNom,
    categorieRole: r.instance.categorieRole,
    seriesCibles: r.ligne.seriesCibles,
    fourchetteRepsMin: r.ligne.fourchetteRepsMin,
    fourchetteRepsMax: r.ligne.fourchetteRepsMax,
    rpeCible: r.ligne.rpeCible ?? 8,
    tempo: r.ligne.tempo ?? "",
    reposSecondes: r.ligne.reposSecondes ?? 120,
    incrementsPossibles: [],
    musclesPrincipaux: r.instance.musclesPrincipaux,
  }));

  const ajustes = applyVolumeAdjustment(pourAjustement, ajustement);
  const seriesParLigne = new Map(ajustes.map((a) => [a.exerciseInTemplateId, a.seriesAjustees]));

  // --- Charge suggeree par double progression ---
  const suggestions = await Promise.all(
    resolus.map(async (r) => {
      const derniere = await derniereSeriesPour(ctx.userId, r.instance.id);
      return computeNextSets(derniere, {
        fourchetteRepsMin: r.ligne.fourchetteRepsMin,
        fourchetteRepsMax: r.ligne.fourchetteRepsMax,
        seriesCibles: seriesParLigne.get(r.ligne.id) ?? r.ligne.seriesCibles,
        // Les increments viennent de la machine RETENUE, pas de celle prevue :
        // une poulie en livres et une pile en kilos ne progressent pas pareil.
        incrementsPossibles: r.instance.incrementsPossibles,
      });
    }),
  );

  // --- Persistance ---
  return db.transaction(async (tx) => {
    const [seance] = await tx
      .insert(sessionLogs)
      .values({
        userId: ctx.userId,
        date: ctx.date,
        seanceTemplateId: ctx.seanceTemplateId,
        gymId: ctx.gymId,
        dailyStateId: etatDuJour?.id ?? null,
        feuBiologiqueJour: feuJour,
        volumeAjustePct: ajustement.totalPct || null,
        volumeAjusteRaison: ajustement.raisons.join(" ; ") || null,
      })
      .returning();

    if (!seance) throw new Error("Création de la séance impossible");

    const items = resolus.length
      ? await tx
          .insert(sessionPlanItems)
          .values(
            resolus.map((r, index) => {
              const suggestion = suggestions[index]!;
              return {
                sessionLogId: seance.id,
                ordre: index + 1,
                exerciseInstanceId: r.instance.id,
                exerciseInTemplateId: r.ligne.id,
                substitutionDeInstanceId: r.substitutionDe,
                raisonSubstitution: r.raison,
                seriesCibles: seriesParLigne.get(r.ligne.id) ?? r.ligne.seriesCibles,
                seriesPrevuesAvantAjustement: r.ligne.seriesCibles,
                fourchetteRepsMin: r.ligne.fourchetteRepsMin,
                fourchetteRepsMax: r.ligne.fourchetteRepsMax,
                rpeCible: r.ligne.rpeCible,
                tempo: r.ligne.tempo,
                reposSecondes: r.ligne.reposSecondes,
                chargeSuggeree: suggestion.charge || null,
                repsSuggerees: suggestion.reps,
                messageProgression: suggestion.messageProgression,
                statut: "prevu" as const,
              };
            }),
          )
          .returning()
      : [];

    return {
      seance,
      items,
      feuJour,
      ajustement: { totalPct: ajustement.totalPct, raisons: ajustement.raisons },
      ecartes,
    };
  });
}

/** Une ligne de plan, enrichie de tout ce dont l'écran de séance a besoin. */
export interface ItemPlanEnrichi {
  id: string;
  planItemId: string;
  ordre: number;
  nom: string;
  machineNom: string;
  categorieRole: string;
  profilTension: string;
  musclesPrincipaux: string[];
  slug: string | null;
  seriesCibles: number;
  seriesPrevuesAvantAjustement: number | null;
  fourchetteRepsMin: number;
  fourchetteRepsMax: number;
  rpeCible: number | null;
  tempo: string | null;
  reposSecondes: number | null;
  incrementsPossibles: number[];
  poidsNonCompte: number | null;
  chargeSuggeree: number | null;
  repsSuggerees: number[] | null;
  messageProgression: string | null;
  raisonSubstitution: string | null;
  historique: { charge: number; reps: number; rpe: number | null }[];
}

/**
 * Relit le plan d'une séance, enrichi des informations d'affichage et de
 * l'historique de la dernière séance sur chaque machine.
 */
export async function lirePlan(userId: string, sessionLogId: string) {
  const seance = await db.query.sessionLogs.findFirst({
    where: and(eq(sessionLogs.id, sessionLogId), and(eq(sessionLogs.userId, userId), isNull(sessionLogs.archiveLe))),
  });
  if (!seance) return null;

  const lignes = await db
    .select({
      planItemId: sessionPlanItems.id,
      ordre: sessionPlanItems.ordre,
      exerciseInstanceId: sessionPlanItems.exerciseInstanceId,
      seriesCibles: sessionPlanItems.seriesCibles,
      seriesPrevuesAvantAjustement: sessionPlanItems.seriesPrevuesAvantAjustement,
      fourchetteRepsMin: sessionPlanItems.fourchetteRepsMin,
      fourchetteRepsMax: sessionPlanItems.fourchetteRepsMax,
      rpeCible: sessionPlanItems.rpeCible,
      tempo: sessionPlanItems.tempo,
      reposSecondes: sessionPlanItems.reposSecondes,
      chargeSuggeree: sessionPlanItems.chargeSuggeree,
      repsSuggerees: sessionPlanItems.repsSuggerees,
      messageProgression: sessionPlanItems.messageProgression,
      raisonSubstitution: sessionPlanItems.raisonSubstitution,
      machineNom: exerciseInstances.machineNom,
      incrementsPossibles: exerciseInstances.incrementsPossibles,
      poidsNonCompte: exerciseInstances.poidsNonCompte,
      nom: exercises.nom,
      slug: exercises.slug,
      categorieRole: exercises.categorieRole,
      profilTension: exercises.profilTension,
      musclesPrincipaux: exercises.musclesPrincipaux,
    })
    .from(sessionPlanItems)
    .innerJoin(exerciseInstances, eq(exerciseInstances.id, sessionPlanItems.exerciseInstanceId))
    .innerJoin(exercises, eq(exercises.id, exerciseInstances.exerciseId))
    .where(eq(sessionPlanItems.sessionLogId, sessionLogId))
    .orderBy(asc(sessionPlanItems.ordre));

  const items: ItemPlanEnrichi[] = await Promise.all(
    lignes.map(async (l) => {
      const derniere = await derniereSeriesPour(userId, l.exerciseInstanceId);
      return {
        id: l.exerciseInstanceId,
        planItemId: l.planItemId,
        ordre: l.ordre,
        nom: l.nom,
        machineNom: l.machineNom,
        categorieRole: l.categorieRole,
        profilTension: l.profilTension,
        musclesPrincipaux: l.musclesPrincipaux ?? [],
        slug: l.slug,
        seriesCibles: l.seriesCibles,
        seriesPrevuesAvantAjustement: l.seriesPrevuesAvantAjustement,
        fourchetteRepsMin: l.fourchetteRepsMin,
        fourchetteRepsMax: l.fourchetteRepsMax,
        rpeCible: l.rpeCible,
        tempo: l.tempo,
        reposSecondes: l.reposSecondes,
        incrementsPossibles: l.incrementsPossibles ?? [],
        poidsNonCompte: l.poidsNonCompte,
        chargeSuggeree: l.chargeSuggeree,
        repsSuggerees: l.repsSuggerees,
        messageProgression: l.messageProgression,
        raisonSubstitution: l.raisonSubstitution,
        historique: (derniere?.sets ?? []).map((s) => ({ charge: s.charge, reps: s.reps, rpe: null })),
      };
    }),
  );

  return { seance, items };
}
