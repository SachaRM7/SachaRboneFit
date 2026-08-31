import { db } from "@/db/client";
import { verdictMemoire } from "./memoire-durable";
import { positionDuBloc } from "@/services/cycle";
import { contraintesActives } from "@/services/contraintes";
import { users, gyms, exercises, exerciseInstances, dailyStates, coachMemoires } from "@/db/schema";
import { and, eq, desc, isNull, inArray } from "drizzle-orm";
import { computeFeuJour, etatPourLeMoteur } from "@/lib/engine/feu-biologique";
import { prochaineSeance } from "@/services/programmes";
import {
  recordsPersonnels,
  volumeParMuscle,
  stagnations,
  fourchettesCompletees,
  semainesSansDeload,
} from "@/services/progression";
import { libelleMuscle, libelleEquipement, libelleProfilTension } from "@/lib/referentiels/libelles";
import { versMuscle } from "@/lib/referentiels/muscles";
import type { CoachTool, ToolExecutor, ToolExecutionResult } from "./tools";

/**
 * Outils de contexte du coach.
 *
 * Le modèle disposait de sept outils, tous tournés vers une séance en cours. Il
 * ne pouvait ni lire le profil, ni connaître l'état du jour, ni savoir quelles
 * machines existent dans la salle où l'on se trouve — autant de décisions qu'il
 * devait donc improviser.
 *
 * Chaque outil ci-dessous s'adosse à un calcul déjà fait par l'application. Le
 * partage des rôles est délibéré : le code mesure, le modèle interprète. Un
 * plateau, un volume, un record se calculent ; ce qu'il convient d'en faire se
 * discute.
 *
 * Aucun outil ne renvoie tout ce qu'il pourrait : le modèle appelle ce dont il
 * a besoin, quand il en a besoin.
 */

function ok(output: string): ToolExecutionResult {
  return { success: true, output };
}

function echec(raison: string): ToolExecutionResult {
  return { success: false, output: raison };
}

function nombre(valeur: unknown, defaut: number): number {
  const n = Number(valeur);
  return Number.isFinite(n) ? n : defaut;
}

function texte(valeur: unknown): string | null {
  return typeof valeur === "string" && valeur.trim() ? valeur.trim() : null;
}

function ilYaJours(jours: number): string {
  const d = new Date();
  d.setDate(d.getDate() - jours);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// 1 — Profil permanent
// ---------------------------------------------------------------------------

async function profil(_p: Record<string, unknown>, userId: string): Promise<ToolExecutionResult> {
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!u) return echec("Profil introuvable");

  const age = u.dateNaissance
    ? Math.floor((Date.now() - new Date(u.dateNaissance).getTime()) / 31_557_600_000)
    : null;

  const actives = await contraintesActives(userId);

  return ok(JSON.stringify({
    nom: u.nom,
    age,
    tailleCm: u.taille,
    objectif: u.objectifType ?? u.objectifChiffre,
    phaseNutritionnelle: u.phaseNutritionnelle,
    musclesPrioritaires: (u.objectifMusclesPrioritaires ?? []).map(libelleMuscle),
    seancesParSemaine: u.frequenceCibleParSemaine,
    dureeSeanceMinutes: u.dureeSeanceCibleMinutes,
    contraintes: actives.map((c) => ({
      muscle: libelleMuscle(c.muscle),
      type: c.type,
      severite: c.severite,
      note: c.notes,
      depuis: c.dateDebut,
      // Le coach doit pouvoir dire « ça fait deux semaines, ça va mieux ? »
      // plutôt que de découvrir une contrainte sans savoir si elle vaut encore.
      aReevaluer: c.aReevaluerLe,
    })),
  }));
}

// ---------------------------------------------------------------------------
// 4 — État du jour
// ---------------------------------------------------------------------------

async function etatDuJour(_p: Record<string, unknown>, userId: string): Promise<ToolExecutionResult> {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const etat = await db.query.dailyStates.findFirst({
    where: and(eq(dailyStates.userId, userId), eq(dailyStates.date, aujourdhui)),
  });

  if (!etat) {
    return ok(JSON.stringify({
      renseigne: false,
      message: "L'état du jour n'a pas été saisi. Ne suppose rien sur le sommeil ou la fatigue.",
    }));
  }

  // Le coach lisait un état du jour reconstruit avec ses propres valeurs par
  // défaut : il pouvait annoncer un feu que l'écran de séance contredisait.
  const calcul = computeFeuJour(etatPourLeMoteur(etat));

  return ok(JSON.stringify({
    renseigne: true,
    feu: calcul.feu,
    // Le feu est la décision du moteur ; ces facteurs disent d'où elle vient,
    // pour que le coach puisse l'expliquer au lieu de l'asséner.
    sommeilHeures: etat.sommeilHeures,
    energieDepart: etat.energieDepart,
    jeune: etat.jeuneBool,
    shiftRecent: etat.shiftRecentBool,
    courbatures: (etat.courbatures ?? []).map((c) => ({
      muscle: libelleMuscle(c.muscle),
      intensite: c.intensite,
    })),
  }));
}

// ---------------------------------------------------------------------------
// 2 — Salle, équipements, exercices réalisables
// ---------------------------------------------------------------------------

async function equipementSalle(p: Record<string, unknown>, userId: string): Promise<ToolExecutionResult> {
  const salleId = texte(p.gymId);

  const salles = await db.query.gyms.findMany({ where: isNull(gyms.archiveLe) });
  if (salles.length === 0) return ok(JSON.stringify({ salles: [], machines: [] }));

  const salle = salleId ? salles.find((s) => s.id === salleId) : salles[0];
  if (!salle) return echec("Salle introuvable");

  const instances = await db.query.exerciseInstances.findMany({
    where: and(isNull(exerciseInstances.archiveLe), eq(exerciseInstances.gymId, salle.id)),
  });

  const idsExercices = [...new Set(instances.map((i) => i.exerciseId))];
  const fiches = idsExercices.length
    ? await db.query.exercises.findMany({ where: inArray(exercises.id, idsExercices) })
    : [];
  const parId = new Map(fiches.map((e) => [e.id, e]));

  return ok(JSON.stringify({
    salle: { id: salle.id, nom: salle.nom },
    autresSalles: salles.filter((s) => s.id !== salle.id).map((s) => ({ id: s.id, nom: s.nom })),
    machines: instances.map((i) => {
      const e = parId.get(i.exerciseId);
      return {
        exerciseInstanceId: i.id,
        exercice: e?.nom,
        machine: i.machineNom,
        pilier: e?.pilier,
        profilTension: libelleProfilTension(e?.profilTension),
        muscles: (e?.musclesPrincipaux ?? []).map(libelleMuscle),
        incrementsKg: i.incrementsPossibles,
      };
    }),
  }));
}

// ---------------------------------------------------------------------------
// 2 — Recherche dans la bibliothèque
// ---------------------------------------------------------------------------

async function chercherExercices(p: Record<string, unknown>, userId: string): Promise<ToolExecutionResult> {
  const muscleDemande = texte(p.muscle);
  const pilier = texte(p.pilier);
  const equipement = texte(p.equipement);
  const limite = Math.min(nombre(p.limite, 15), 40);

  // Le vocabulaire du modèle n'est pas celui de la base : « pecs », « pectoral »
  // et « pectoraux » doivent tomber sur la même entrée.
  const muscle = muscleDemande ? versMuscle(muscleDemande) : null;
  if (muscleDemande && !muscle) {
    return echec(`Muscle « ${muscleDemande} » inconnu du référentiel`);
  }

  const tous = await db.query.exercises.findMany();

  const retenus = tous.filter((e) => {
    if (pilier && e.pilier !== pilier) return false;
    if (equipement && e.equipement !== equipement) return false;
    if (muscle) {
      const principaux = (e.musclesPrincipaux ?? []).map((m) => versMuscle(m));
      const secondaires = (e.musclesSecondaires ?? []).map((m) => versMuscle(m));
      if (!principaux.includes(muscle) && !secondaires.includes(muscle)) return false;
    }
    return true;
  });

  const instances = await db.query.exerciseInstances.findMany({
    where: isNull(exerciseInstances.archiveLe),
  });
  const equipes = new Set(instances.map((i) => i.exerciseId));

  return ok(JSON.stringify({
    total: retenus.length,
    exercices: retenus.slice(0, limite).map((e) => ({
      exerciseId: e.id,
      nom: e.nom,
      pilier: e.pilier,
      profilTension: libelleProfilTension(e.profilTension),
      equipement: libelleEquipement(e.equipement),
      muscles: (e.musclesPrincipaux ?? []).map(libelleMuscle),
      // Un exercice non équipé n'est pas programmable en l'état : le dire évite
      // au coach de proposer ce qui n'existe dans aucune salle.
      equipeDansUneSalle: equipes.has(e.id),
    })),
  }));
}

// ---------------------------------------------------------------------------
// 3 — Séance du jour
// ---------------------------------------------------------------------------

async function seanceDuJour(_p: Record<string, unknown>, userId: string): Promise<ToolExecutionResult> {
  const suite = await prochaineSeance(userId);
  if (!suite) return ok(JSON.stringify({ programmee: false, message: "Aucun bloc actif." }));

  return ok(JSON.stringify({
    programmee: true,
    // La semaine déduite, comme partout ailleurs : `semaine_actuelle` vaut 1.
    bloc: { nom: suite.bloc.nom, semaine: positionDuBloc(suite.bloc).semaine },
    seance: { lettre: suite.template.lettre, nom: suite.template.nom, id: suite.template.id },
    rotation: suite.toutesLesSeances.map((s) => s.lettre),
  }));
}

// ---------------------------------------------------------------------------
// 5 — État de progression : le calcul est fait par le code
// ---------------------------------------------------------------------------

async function etatProgression(_p: Record<string, unknown>, userId: string): Promise<ToolExecutionResult> {
  const [plateaux, completees, sansDeload] = await Promise.all([
    stagnations(userId),
    fourchettesCompletees(userId),
    semainesSansDeload(userId),
  ]);

  return ok(JSON.stringify({
    // Ces trois constats sont mesurés, pas déduits. Le coach choisit la
    // stratégie ; il n'a pas à recalculer si un plateau existe.
    plateaux: plateaux.map((s) => ({
      exerciseInstanceId: s.exerciseInstanceId,
      exercice: s.exerciseName,
      semainesSansProgression: s.semainesSansProgression,
      // Un plateau dans un contexte perturbé — sommeil, décharge, blessure —
      // ne s'interprète pas comme un plateau d'entraînement.
      contexteNormal: s.contexteNormal,
    })),
    fourchettesCompletees: completees,
    semainesSansDeload: sansDeload,
  }));
}

async function records(p: Record<string, unknown>, userId: string): Promise<ToolExecutionResult> {
  const liste = await recordsPersonnels(userId, Math.min(nombre(p.limite, 10), 30));
  return ok(JSON.stringify(liste));
}

async function volume(p: Record<string, unknown>, userId: string): Promise<ToolExecutionResult> {
  const jours = Math.min(nombre(p.jours, 28), 180);
  const liste = await volumeParMuscle(userId, ilYaJours(jours));
  return ok(JSON.stringify({
    fenetreJours: jours,
    volumes: liste.map((v) => ({ ...v, muscle: libelleMuscle(v.muscle) })),
  }));
}

// ---------------------------------------------------------------------------
// 6 — Mémoire du coach
// ---------------------------------------------------------------------------

const CATEGORIES = ["recuperation", "preference", "technique", "progression", "contrainte"];

async function memoriser(p: Record<string, unknown>, userId: string): Promise<ToolExecutionResult> {
  const observation = texte(p.observation);
  const categorie = texte(p.categorie);

  if (!observation) return echec("observation manquante");
  if (!categorie || !CATEGORIES.includes(categorie)) {
    return echec(`categorie doit valoir : ${CATEGORIES.join(", ")}`);
  }

  // Une consigne dans la description de l'outil n'est pas une garantie : un
  // fait ponctuel pouvait s'enregistrer comme préférence durable, puis être
  // relu des mois plus tard comme un trait de l'athlète.
  const dejaRetenues = await db.query.coachMemoires.findMany({
    where: and(eq(coachMemoires.userId, userId), isNull(coachMemoires.invalideeLe)),
    columns: { observation: true },
  });
  const verdict = verdictMemoire(observation, dejaRetenues.map((m) => m.observation));
  if (!verdict.retenue) {
    return ok(JSON.stringify({ enregistre: false, raison: verdict.raison }));
  }

  const motsCles = Array.isArray(p.motsCles)
    ? p.motsCles.filter((m): m is string => typeof m === "string").slice(0, 8)
    : [];

  const [ligne] = await db.insert(coachMemoires).values({
    userId,
    observation,
    categorie,
    // Une observation venue du modèle reste une hypothèse tant qu'elle n'est
    // pas confirmée : elle ne s'enregistre jamais comme un fait mesuré.
    source: "modele",
    motsCles,
    poids: Math.min(Math.max(nombre(p.poids, 3), 1), 5),
  }).returning();

  return ok(JSON.stringify({ enregistre: true, id: ligne?.id, observation }));
}

async function rappeler(p: Record<string, unknown>, userId: string): Promise<ToolExecutionResult> {
  const recherche = texte(p.recherche)?.toLowerCase();
  const categorie = texte(p.categorie);

  const toutes = await db.query.coachMemoires.findMany({
    where: and(eq(coachMemoires.userId, userId), isNull(coachMemoires.invalideeLe)),
    orderBy: [desc(coachMemoires.poids), desc(coachMemoires.createdAt)],
  });

  const retenues = toutes.filter((m) => {
    if (categorie && m.categorie !== categorie) return false;
    if (!recherche) return true;
    const champ = `${m.observation} ${(m.motsCles ?? []).join(" ")}`.toLowerCase();
    return champ.includes(recherche);
  });

  return ok(JSON.stringify({
    total: retenues.length,
    observations: retenues.slice(0, 20).map((m) => ({
      id: m.id,
      observation: m.observation,
      categorie: m.categorie,
      source: m.source,
      poids: m.poids,
      confirmee: m.confirmee,
    })),
  }));
}

// ---------------------------------------------------------------------------

export const DEFINITIONS_CONTEXTE: CoachTool[] = [
  {
    name: "get_user_profile",
    description:
      "Profil permanent : objectif, âge, taille, muscles prioritaires, fréquence et durée de séance visées, contraintes physiques actives. À appeler avant toute recommandation structurante.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_today_readiness",
    description:
      "État du jour et feu biologique calculé par l'application : sommeil, énergie, jeûne, shift, courbatures par muscle. Renvoie renseigne:false si rien n'a été saisi — dans ce cas ne suppose rien.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_gym_equipment",
    description:
      "Machines réellement présentes dans une salle, avec l'exercice, le pilier et les muscles associés. Sans gymId, renvoie la première salle et la liste des autres. N'invente jamais une machine absente de cette liste.",
    input_schema: {
      type: "object",
      properties: { gymId: { type: "string", description: "Identifiant de la salle" } },
    },
  },
  {
    name: "search_exercises",
    description:
      "Cherche dans la bibliothèque par muscle, pilier ou équipement. Indique pour chaque exercice s'il est équipé dans au moins une salle — un exercice non équipé n'est pas programmable en l'état.",
    input_schema: {
      type: "object",
      properties: {
        muscle: { type: "string", description: "Muscle ciblé, en français" },
        pilier: {
          type: "string",
          description: "P1_poussee, P2_tirage, P3_squat, P4_hanche, epaules, bras_biceps, bras_triceps, jambes_iso, core",
        },
        equipement: {
          type: "string",
          description: "barre, halteres, machine, poulie, poids_du_corps, elastique, kettlebell",
        },
        limite: { type: "number" },
      },
    },
  },
  {
    name: "get_current_session",
    description: "Prochaine séance du bloc actif, sa lettre et la rotation complète.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_progression_status",
    description:
      "Constats mesurés par l'application : exercices en plateau et depuis combien de semaines, fourchettes complétées, semaines écoulées sans décharge. Ne recalcule pas ces valeurs toi-même.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_personal_records",
    description: "Records personnels estimés par exercice.",
    input_schema: { type: "object", properties: { limite: { type: "number" } } },
  },
  {
    name: "get_volume_by_muscle",
    description: "Volume de séries par muscle sur une fenêtre de jours (28 par défaut).",
    input_schema: { type: "object", properties: { jours: { type: "number" } } },
  },
  {
    name: "create_coach_memory",
    description:
      "Enregistre une observation durable sur l'athlète, pour la retrouver dans les conversations suivantes. À utiliser pour une régularité constatée, pas pour un fait ponctuel déjà présent dans l'historique.",
    input_schema: {
      type: "object",
      properties: {
        observation: { type: "string", description: "Une phrase, formulée comme on la dirait à voix haute" },
        categorie: {
          type: "string",
          description: "recuperation, preference, technique, progression ou contrainte",
        },
        motsCles: { type: "array", items: { type: "string" }, description: "Muscles ou exercices concernés" },
        poids: { type: "number", description: "1 à 5 : force de la conviction" },
      },
      required: ["observation", "categorie"],
    },
  },
  {
    name: "search_coach_memory",
    description:
      "Relit les observations retenues sur l'athlète. À appeler au début d'un échange de coaching pour éviter de redécouvrir ce qui est déjà su.",
    input_schema: {
      type: "object",
      properties: {
        recherche: { type: "string", description: "Mot-clé, muscle ou exercice" },
        categorie: { type: "string" },
      },
    },
  },
];

export const EXECUTEURS_CONTEXTE: Record<string, ToolExecutor> = {
  get_user_profile: profil,
  get_today_readiness: etatDuJour,
  get_gym_equipment: equipementSalle,
  search_exercises: chercherExercices,
  get_current_session: seanceDuJour,
  get_progression_status: etatProgression,
  get_personal_records: records,
  get_volume_by_muscle: volume,
  create_coach_memory: memoriser,
  search_coach_memory: rappeler,
};
