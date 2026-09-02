import { db } from "@/db/client";
import {
  contraintes, dailyStates, exerciseInTemplate, exerciseInstances, exercises,
  programmeBlocs, seanceTemplates, sessionLogs, sessionPlanItems, setLogs,
} from "@/db/schema";
import { and, asc, desc, eq, getTableName, isNull, or, gte, sql } from "drizzle-orm";
import { computeFeuJour, etatPourLeMoteur } from "@/lib/engine/feu-biologique";
import { contraintesActives } from "./contraintes";
import { musclesSousContrainte } from "@/lib/engine/contraintes";
import { computeVolumeAdjustment } from "@/lib/engine/volume-adjustment";
import { applyVolumeAdjustment, type ExerciseInTemplateWithDetails } from "@/lib/engine/apply-adjustment";
import { configurationDe } from "@/lib/engine/charges";
import { computeNextSets, type MotifProgression } from "@/lib/engine/double-progression";
import { resoudrePourSalle, type InstanceResolvable } from "@/lib/engine/resolution-salle";
import { versMuscles } from "@/lib/referentiels/muscles";
import { expliquerRetours } from "@/services/retours";
import type { DailyStateInput } from "@/lib/validators/daily-state";
import type { SessionLog, SessionPlanItem } from "@/db/schema";
import { machinesUtilisablesAujourdhui } from "@/db/archivage";

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
  /**
   * Exercices remis aujourd'hui apres avoir ete empeches, avec la phrase qui
   * l'explique. Jamais un ajout : ce sont des places deja prevues par le
   * gabarit, dont on dit seulement pourquoi elles retrouvent leur exercice.
   */
  retours: Array<{ exerciceNom: string; explication: string }>;
}

/** Muscles a menager : courbatures fortes du jour + contraintes actives. */
interface ZonesAMenager {
  /** Muscles fatigués : ils écartent les remplaçants, sans rien retirer. */
  aEviter: string[];
  /** Muscles sous contrainte sévère : ils écartent l'exercice lui-même. */
  exclus: string[];
}

async function musclesAMenager(
  userId: string,
  etat: DailyStateInput | null,
  date = new Date().toISOString().slice(0, 10),
): Promise<ZonesAMenager> {
  // Le seuil était écrit ici à la main, et la définition d'« active » était
  // celle de ce fichier seulement : trois autres lectures exigeaient
  // `date_fin IS NULL`, donc une contrainte datée pour la semaine prochaine
  // était active ici et terminée ailleurs. Les deux viennent maintenant du
  // même endroit.
  const actives = await contraintesActives(userId, db, date);

  const depuisCourbatures = (etat?.courbatures ?? [])
    .filter((c) => c.intensite > 7)
    .map((c) => c.muscle);

  return {
    // Une courbature est passagère : elle oriente le choix d'un remplaçant,
    // elle ne retire pas l'exercice prévu. Comportement inchangé.
    aEviter: versMuscles(depuisCourbatures),
    // Une contrainte sévère, elle, exclut : c'est une décision du moteur, et
    // la présence de la machine ne doit pas permettre de la contourner.
    exclus: versMuscles(musclesSousContrainte(actives, date)),
  };
}

/**
 * Toutes les instances utilisables aujourd'hui, enrichies de leur exercice.
 *
 * Exportée : c'est la définition du parc du jour, celle que la résolution de
 * salle consomme. La vérifier depuis l'extérieur est le seul moyen de prouver
 * qu'une machine hors service en sort — et y revient.
 */
export async function chargerParc(userId: string): Promise<InstanceResolvable[]> {
  const lignes = await db
    .select({
      id: exerciseInstances.id,
      gymId: exerciseInstances.gymId,
      exerciseId: exerciseInstances.exerciseId,
      machineNom: exerciseInstances.machineNom,
      exerciceNom: exercises.nom,
      pilier: exercises.pilier,
      profilTension: exercises.profilTension,
      type: exercises.type,
      categorieRole: exercises.categorieRole,
      musclesPrincipaux: exercises.musclesPrincipaux,
      equipement: exercises.equipement,
      incrementsPossibles: exerciseInstances.incrementsPossibles,
      paliersCharges: exerciseInstances.paliersCharges,
      chargeMinimale: exerciseInstances.chargeMinimale,
      chargeMax: exerciseInstances.chargeMax,
      natureCharge: exerciseInstances.natureCharge,
      etat: exerciseInstances.etat,
    })
    .from(exerciseInstances)
    .innerJoin(exercises, eq(exercises.id, exerciseInstances.exerciseId))
    // Le parc du JOUR : une machine hors service en est retirée sans que son
    // historique bouge, et sans qu'on ait eu à l'archiver pour ça.
    .where(machinesUtilisablesAujourdhui());

  return lignes.map((l) => ({
    ...l,
    categorieRole: (l.categorieRole as InstanceResolvable["categorieRole"]) ?? "accessoire",
    musclesPrincipaux: l.musclesPrincipaux ?? [],
    charge: configurationDe(l),
  }));
}

/**
 * Repos retenu quand le gabarit n'en prescrit aucun.
 *
 * Ce n'est pas une recommandation d'entraînement : c'est ce qui permet au
 * chronomètre de démarrer, donc à l'intervalle entre séries d'être mesuré. Sans
 * lui, `lancerRepos` sort immédiatement et la colonne reste vide.
 */
export const REPOS_PAR_DEFAUT_SECONDES = 120;

/**
 * Combien de séries la séance de référence demandait pour CETTE machine.
 *
 * Sous-requête scalaire, et non jointure : rien ne garantit l'unicité du couple
 * (session_log_id, exercise_instance_id) dans `session_plan_items`, et une
 * jointure y dupliquerait chaque série de la référence — faussant précisément le
 * comptage que ce chantier corrige. Un scalaire ne peut pas multiplier de lignes.
 *
 * `series_cibles` et non `series_prevues_avant_ajustement` : c'est le nombre
 * APRÈS les adaptations déterministes de volume, donc ce qui a réellement été
 * demandé ce jour-là.
 *
 * `order by ordre` rend le choix déterministe si plusieurs lignes existaient.
 */
function seriesAttenduesDeLaReference() {
  const P = sql.identifier("plan_de_la_reference");
  const col = (c: { name: string }) => sql.identifier(c.name);
  return sql<number | null>`(
    select ${P}.${col(sessionPlanItems.seriesCibles)}
      from ${sql.identifier(getTableName(sessionPlanItems))} ${P}
     where ${P}.${col(sessionPlanItems.sessionLogId)} = ${setLogs.sessionLogId}
       and ${P}.${col(sessionPlanItems.exerciseInstanceId)} = ${setLogs.exerciseInstanceId}
     order by ${P}.${col(sessionPlanItems.ordre)}
     limit 1)`;
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
      // Sans le RPE, la séance précédente serait estimée sans réserve et la
      // séance en cours avec : les deux côtés ne mesureraient pas la même chose.
      rpe: setLogs.rpeEffectif,
      date: sessionLogs.date,
      seriesAttendues: seriesAttenduesDeLaReference(),
    })
    .from(setLogs)
    .innerJoin(sessionLogs, eq(sessionLogs.id, setLogs.sessionLogId))
    .where(and(eq(setLogs.exerciseInstanceId, exerciseInstanceId), and(eq(sessionLogs.userId, userId), isNull(sessionLogs.archiveLe))))
    .orderBy(desc(sessionLogs.date), desc(sessionLogs.createdAt), asc(setLogs.numeroSerie));

  if (lignes.length === 0) return null;

  const derniereSession = lignes[0]!.sessionLogId;
  const deLaReference = lignes.filter((l) => l.sessionLogId === derniereSession);
  return {
    sets: deLaReference.map((l) => ({ numero: l.numero, reps: l.reps, charge: l.charge, rpe: l.rpe })),
    // Identique sur toutes les lignes de la référence : la sous-requête ne
    // dépend que de la séance et de la machine.
    seriesAttendues: deLaReference[0]!.seriesAttendues ?? null,
  };
}

export async function construireSeanceDuJour(ctx: ContexteSeance): Promise<ResultatConstruction> {
  // Le gabarit n'a pas de propriétaire direct : il appartient à un bloc. Sans
  // cette jointure, `seanceTemplateId` venant du client suffisait à construire
  // sa journée à partir du programme de quelqu'un d'autre — et à en lire le
  // contenu au passage.
  const [template] = await db
    .select({ id: seanceTemplates.id, nom: seanceTemplates.nom, lettre: seanceTemplates.lettre })
    .from(seanceTemplates)
    .innerJoin(programmeBlocs, eq(programmeBlocs.id, seanceTemplates.blocId))
    .where(
      and(
        eq(seanceTemplates.id, ctx.seanceTemplateId),
        and(eq(programmeBlocs.userId, ctx.userId), isNull(programmeBlocs.archiveLe)),
      ),
    )
    .limit(1);
  if (!template) throw new Error("Séance introuvable");

  const etatDuJour = await db.query.dailyStates.findFirst({
    where: and(eq(dailyStates.userId, ctx.userId), eq(dailyStates.date, ctx.date)),
  });

  const etat: DailyStateInput | null = etatDuJour ? etatPourLeMoteur(etatDuJour) : null;

  const feuJour = etat ? computeFeuJour(etat).feu : "vert";

  // Un exercice retiré du programme ne se planifie plus. Sa ligne reste en base
  // parce que des séances passées la citent, mais elle ne construit plus rien.
  const lignesTemplate = await db.query.exerciseInTemplate.findMany({
    where: and(
      eq(exerciseInTemplate.seanceTemplateId, ctx.seanceTemplateId),
      isNull(exerciseInTemplate.archiveLe),
    ),
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

    const resolution = resoudrePourSalle(
      prevu, parcDuJour, retenues, aMenager.aEviter, aMenager.exclus,
    );
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
    rpeCible: r.ligne.rpeCible,
    tempo: r.ligne.tempo ?? "",
    reposSecondes: r.ligne.reposSecondes ?? REPOS_PAR_DEFAUT_SECONDES,
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
        // La configuration vient de la machine RETENUE, pas de celle prevue :
        // une poulie en livres et une pile en kilos ne progressent pas pareil.
        charge: r.instance.charge,
      });
    }),
  );

  // --- Retours d'exercices precedemment empeches ---
  //
  // La memoire n'ajoute rien : la place existe deja dans le gabarit, et la
  // resolution y a deja remis l'exercice prevu puisqu'il est de nouveau
  // disponible. Ce qu'elle apporte est la RAISON, et le droit de veto des
  // garde-fous : si le muscle n'est pas recupere ou si la semaine est servie,
  // on ne s'en felicite pas.
  const retours = await expliquerRetours({
    userId: ctx.userId,
    resolus: resolus.map((r) => ({
      exerciceId: r.instance.exerciseId,
      exerciceNom: r.instance.exerciceNom,
      musclesPrincipaux: r.instance.musclesPrincipaux,
      series: seriesParLigne.get(r.ligne.id) ?? r.ligne.seriesCibles,
    })),
    date: ctx.date,
    dureeDisponibleMinutes: null,
  });

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
                // Même défaut que l'ajustement de volume plus haut. La valeur
                // était écrite brute ici : un gabarit sans repos renseigné
                // produisait `null`, et `lancerRepos` sortait alors sans
                // démarrer le chronomètre — donc AUCUN `repos_reel_secondes`
                // pour la séance entière. La même donnée ne peut pas avoir deux
                // défauts à 78 lignes d'écart.
                reposSecondes: r.ligne.reposSecondes ?? REPOS_PAR_DEFAUT_SECONDES,
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
      retours,
    };
  });
}

/**
 * La nature de la décision persistée, retrouvée sans la stocker.
 *
 * `session_plan_items` garde la PHRASE (`message_progression`) mais pas sa
 * nature, et ce chantier n'ouvre aucune migration. Le motif est donc recalculé
 * à la lecture — puis, et c'est l'essentiel, **confronté au message persisté**.
 *
 * On ne retient le motif que si le recalcul reproduit ce message au caractère
 * près. Même message ⇒ même branche ⇒ même motif : la correspondance est alors
 * certaine. Sinon — l'historique a changé depuis la construction du plan, la
 * machine a été redécrite — on rend `null`, l'écran retombe sur un ton neutre,
 * et **aucune couleur fausse n'est possible**. Le repli est du côté du silence,
 * jamais de l'affirmation.
 *
 * Le calcul est pur et la référence déjà chargée : le coût est nul.
 */
function motifDuMessagePersiste(
  ligne: {
    messageProgression: string | null;
    fourchetteRepsMin: number;
    fourchetteRepsMax: number;
    seriesCibles: number;
    incrementsPossibles: number[] | null;
    paliersCharges: number[] | null;
    chargeMinimale: number | null;
    chargeMax: number | null;
    natureCharge: string | null;
    poidsNonCompte: number | null;
    conventionCharge: string;
  },
  derniere: Awaited<ReturnType<typeof derniereSeriesPour>>,
): MotifProgression | null {
  if (!ligne.messageProgression) return null;
  const rejeu = computeNextSets(derniere, {
    fourchetteRepsMin: ligne.fourchetteRepsMin,
    fourchetteRepsMax: ligne.fourchetteRepsMax,
    seriesCibles: ligne.seriesCibles,
    charge: configurationDe(ligne),
  });
  return rejeu.messageProgression === ligne.messageProgression ? rejeu.motifProgression : null;
}

/** Une ligne de plan, enrichie de tout ce dont l'écran de séance a besoin. */
export interface ItemPlanEnrichi {
  /** La nature de `messageProgression`. Voir `motifDuMessagePersiste`. */
  motifProgression: MotifProgression | null;
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
  /** Ce qu'il faut saisir sur cet appareil, et dans quel sens le lire. */
  conventionCharge: string;
  natureCharge: string;
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
      exerciseId: exerciseInstances.exerciseId,
      incrementsPossibles: exerciseInstances.incrementsPossibles,
      poidsNonCompte: exerciseInstances.poidsNonCompte,
      conventionCharge: exerciseInstances.conventionCharge,
      natureCharge: exerciseInstances.natureCharge,
      // Nécessaires au rejeu qui retrouve le motif : sans la grille complète,
      // la charge recalculée diffèrerait et le message ne correspondrait plus.
      paliersCharges: exerciseInstances.paliersCharges,
      chargeMinimale: exerciseInstances.chargeMinimale,
      chargeMax: exerciseInstances.chargeMax,
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
        motifProgression: motifDuMessagePersiste(l, derniere),
        id: l.exerciseInstanceId,
        exerciseId: l.exerciseId,
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
        conventionCharge: l.conventionCharge,
        natureCharge: l.natureCharge,
        chargeSuggeree: l.chargeSuggeree,
        repsSuggerees: l.repsSuggerees,
        messageProgression: l.messageProgression,
        raisonSubstitution: l.raisonSubstitution,
        historique: (derniere?.sets ?? []).map((s) => ({ charge: s.charge, reps: s.reps, rpe: null })),
      };
    }),
  );

  // La phase du cycle change ce qu'on demande à l'utilisateur pendant la
  // séance : en calibration, une réserve de répétitions plutôt qu'un RPE.
  const bloc = seance.seanceTemplateId
    ? await db.query.seanceTemplates
        .findFirst({ where: eq(seanceTemplates.id, seance.seanceTemplateId) })
        .then((t) =>
          t ? db.query.programmeBlocs.findFirst({ where: eq(programmeBlocs.id, t.blocId) }) : null,
        )
    : null;

  return { seance, items, phaseCycle: bloc?.typeCycle ?? null };
}
