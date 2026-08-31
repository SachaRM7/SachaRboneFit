import { pgTable, uuid, text, boolean, timestamp, real, integer, jsonb, date, unique } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").unique().notNull(),
  nom: text("nom"),
  dateNaissance: date("date_naissance"),
  taille: integer("taille"),
  phaseNutritionnelle: text("phase_nutritionnelle"),
  objectifChiffre: text("objectif_chiffre"),
  dateCible: date("date_cible"),
  // Objectif structure : `objectifChiffre` restait un texte libre, inexploitable
  // par le moteur. Ces colonnes le rendent lisible par le code.
  objectifType: text("objectif_type"),
  objectifMusclesPrioritaires: jsonb("objectif_muscles_prioritaires").$type<string[]>(),
  frequenceCibleParSemaine: integer("frequence_cible_par_semaine"),
  /**
   * Fourchette de frequence, et non une valeur unique.
   *
   * Un programme construit sur une seule frequence s'effondre des qu'une
   * seance est manquee. Connaitre le minimum realiste permet de le degrader
   * proprement, et le maximum d'utiliser une semaine plus disponible.
   */
  frequenceMinParSemaine: integer("frequence_min_par_semaine"),
  frequenceMaxParSemaine: integer("frequence_max_par_semaine"),
  dureeSeanceCibleMinutes: integer("duree_seance_cible_minutes"),
  dureeSeanceMaxMinutes: integer("duree_seance_max_minutes"),

  /** 'debutant' | 'intermediaire' | 'avance' — l'aisance technique, pas la performance. */
  niveauExperience: text("niveau_experience"),
  anneesDePratique: integer("annees_de_pratique"),
  /**
   * Mois d'interruption declares a l'inscription.
   *
   * Au-dela de deux, la programmation part en reprise : les schemas moteurs
   * reviennent vite, la tolerance au volume beaucoup moins. On ne demande
   * jamais les anciennes charges — cette application est un nouveau depart.
   */
  moisDInterruption: integer("mois_d_interruption"),

  /** 'machines' | 'poids_libres' | 'melange' | 'aucune'. */
  preferenceMateriel: text("preference_materiel"),
  /**
   * Materiel personnel qu'on emporte d'ordinaire. Propose coche au demarrage :
   * quelqu'un qui a toujours ses elastiques ne doit pas le redire chaque fois.
   */
  materielPersonnelHabituel: jsonb("materiel_personnel_habituel").$type<string[]>(),
  exercicesRefuses: jsonb("exercices_refuses").$type<string[]>(),
  exercicesApprecies: jsonb("exercices_apprecies").$type<string[]>(),

  /** Tant qu'elle est nulle, l'application ouvre l'onboarding plutot que l'accueil. */
  onboardingTermineLe: timestamp("onboarding_termine_le"),

  prefSalleParDefautId: uuid("pref_salle_par_defaut_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const gyms = pgTable("gyms", {
  id: uuid("id").defaultRandom().primaryKey(),
  /**
   * Compte ayant enregistre la salle.
   *
   * Une salle et les exercices qu'on y trouve decrivent un lieu, pas un
   * pratiquant : deux comptes qui s'y entrainent y trouvent la meme chose. La
   * lecture est donc commune a tous.
   *
   * Cet identifiant designe le responsable : celui qui a saisi la salle est le
   * seul a pouvoir la modifier et a gerer les exercices qu'elle contient. Tenir
   * un parc a jour est un travail de terrain, il a un auteur.
   */
  userId: uuid("user_id").references(() => users.id).notNull(),
  nom: text("nom").notNull(),
  /**
   * Types de materiel presents sur place.
   *
   * Un exercice n'etait realisable quelque part que si une ligne
   * `exercise_instances` le declarait, une par exercice et par salle :
   * declarer un lieu demandait de saisir a la main chaque mouvement possible,
   * pompes et gainage compris. C'est le lieu qui possede des ressources ;
   * l'exercice, lui, dit ce dont il a besoin. Le moteur fait l'intersection.
   *
   * C'est aussi ce qui permet a « Maison » d'etre un lieu comme un autre
   * plutot qu'une deuxieme bibliotheque d'exercices a maintenir.
   *
   * `null` et `[]` ne disent pas la meme chose : `null` = personne n'a encore
   * decrit ce lieu, `[]` = decrit, et il n'y a rien de plus que le poids du
   * corps. Sans cette distinction, une salle inconnue aurait recu une seance
   * de pompes au lieu qu'on demande ce qu'elle contient.
   */
  equipementsDisponibles: jsonb("equipements_disponibles").$type<string[]>(),
  horairesOuverture: text("horaires_ouverture"),
  est24h: boolean("est_24h").default(false),
  notes: text("notes"),
  /**
   * Date d'archivage.
   *
   * Une reprise apres une longue interruption, ou un demenagement, rend
   * l'existant trompeur : les anciennes charges et l'ancien parc fausseraient
   * la programmation sans rien apporter. Les archiver plutot que les supprimer
   * les retire de tout calcul en preservant la trace de ce qui a ete fait.
   */
  archiveLe: timestamp("archive_le"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const exercises = pgTable("exercises", {
  id: uuid("id").defaultRandom().primaryKey(),
  /**
   * Auteur de l'entree, `null` pour la bibliotheque commune.
   *
   * Un exercice decrit un mouvement, pas une personne : le dupliquer par compte
   * n'avait aucun sens et produisait trois cent soixante et une lignes pour
   * cent vingt mouvements. Seules les entrees creees a la main par quelqu'un
   * portent encore son identifiant.
   */
  userId: uuid("user_id").references(() => users.id),
  nom: text("nom").notNull(),
  pilier: text("pilier").notNull(),
  profilTension: text("profil_tension").notNull(),
  type: text("type").notNull(),
  categorieRole: text("categorie_role").notNull(),
  musclesPrincipaux: jsonb("muscles_principaux").$type<string[]>(),
  // Muscles secondaires : absents du modele, ils empechaient tout raisonnement
  // correct sur le volume reel et le chevauchement entre seances.
  musclesSecondaires: jsonb("muscles_secondaires").$type<string[]>(),
  // Type de materiel requis (referentiel equipements). Permet de repondre a
  // "cet exercice est-il faisable ici ?" autrement que par l'existence d'une instance.
  equipement: text("equipement"),
  // Identifiant dans la bibliotheque workout-guide : sert aussi de cle des illustrations.
  slug: text("slug"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const exerciseInstances = pgTable("exercise_instances", {
  id: uuid("id").defaultRandom().primaryKey(),
  /**
   * Compte ayant saisi l'entree. Trace d'auteur, sans effet sur les droits :
   * c'est le createur de la SALLE qui decide de son contenu. Sinon le premier a
   * corriger un reglage se l'approprierait.
   */
  userId: uuid("user_id").references(() => users.id).notNull(),
  exerciseId: uuid("exercise_id").references(() => exercises.id).notNull(),
  gymId: uuid("gym_id").references(() => gyms.id).notNull(),
  machineNom: text("machine_nom").notNull(),
  typePoulie: text("type_poulie").default("na"),
  conventionCharge: text("convention_charge").notNull(),
  incrementsPossibles: jsonb("increments_possibles").$type<number[]>().notNull(),
  poidsNonCompte: real("poids_non_compte"),
  // Plafond de la pile ou du chargement : permet de detecter qu'un exercice
  // est arrive en butee et qu'il faut en changer.
  chargeMax: real("charge_max"),
  notesMachine: text("notes_machine"),
  /**
   * Date d'archivage.
   *
   * Une reprise apres une longue interruption, ou un demenagement, rend
   * l'existant trompeur : les anciennes charges et l'ancien parc fausseraient
   * la programmation sans rien apporter. Les archiver plutot que les supprimer
   * les retire de tout calcul en preservant la trace de ce qui a ete fait.
   */
  archiveLe: timestamp("archive_le"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const programmeBlocs = pgTable("programme_blocs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  nom: text("nom").notNull(),
  dateDebut: date("date_debut").notNull(),
  dateFinPrevue: date("date_fin_prevue"),
  typeCycle: text("type_cycle").notNull(),
  semaineActuelle: integer("semaine_actuelle").default(1),
  actif: boolean("actif").default(false),
  /**
   * Date d'archivage.
   *
   * Une reprise apres une longue interruption, ou un demenagement, rend
   * l'existant trompeur : les anciennes charges et l'ancien parc fausseraient
   * la programmation sans rien apporter. Les archiver plutot que les supprimer
   * les retire de tout calcul en preservant la trace de ce qui a ete fait.
   */
  archiveLe: timestamp("archive_le"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const seanceTemplates = pgTable("seance_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  blocId: uuid("bloc_id").references(() => programmeBlocs.id).notNull(),
  lettre: text("lettre").notNull(),
  nom: text("nom").notNull(),
  ordreDansSemaine: integer("ordre_dans_semaine").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const exerciseInTemplate = pgTable("exercise_in_template", {
  id: uuid("id").defaultRandom().primaryKey(),
  seanceTemplateId: uuid("seance_template_id").references(() => seanceTemplates.id).notNull(),
  exerciseInstanceId: uuid("exercise_instance_id").references(() => exerciseInstances.id).notNull(),
  ordre: integer("ordre").notNull(),
  seriesCibles: integer("series_cibles").notNull(),
  fourchetteRepsMin: integer("fourchette_reps_min").notNull(),
  fourchetteRepsMax: integer("fourchette_reps_max").notNull(),
  rpeCible: real("rpe_cible"),
  tempo: text("tempo"),
  reposSecondes: integer("repos_secondes"),
  notes: text("notes"),
  /**
   * Date de retrait du programme.
   *
   * Une ligne de programme ne se supprime pas une fois qu'elle a servi.
   * `session_plan_items` la référence pour dire d'où venait un exercice réalisé,
   * et la clé étrangère refusait la suppression — l'écran Programme échouait
   * donc dès qu'on retirait un exercice déjà travaillé, et l'écran Matériel
   * conseillait précisément cette manœuvre pour libérer une machine.
   *
   * Retirer, c'est cesser de programmer. La ligne reste, l'historique garde son
   * origine, et plus rien ne la propose. Les lectures du programme ACTIF
   * l'excluent ; celles de l'historique n'en dépendent pas — `lirePlan` lit
   * `session_plan_items`, qui porte sa propre copie de la prescription.
   */
  archiveLe: timestamp("archive_le"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const dailyStates = pgTable("daily_states", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  date: date("date").notNull(),
  // La salle du jour ne transitait que par un parametre d'URL : elle n'etait
  // jamais persistee, alors qu'elle conditionne le materiel disponible.
  gymId: uuid("gym_id").references(() => gyms.id),
  sommeilHeures: real("sommeil_heures"),
  jeuneBool: boolean("jeune_bool").default(false),
  shiftRecentBool: boolean("shift_recent_bool").default(false),
  shiftType: text("shift_type"),
  energieDepart: integer("energie_depart"),
  courbatures: jsonb("courbatures").$type<{muscle: string; intensite: number}[]>(),
  /**
   * Materiel personnel emporte ce jour-la. Il s'ajoute a celui du lieu sans
   * jamais le modifier : personne ne doit declarer que la salle possede ses
   * propres elastiques.
   */
  materielApporte: jsonb("materiel_apporte").$type<string[]>(),
  dernierRepasHeure: text("dernier_repas_heure"),
  horaireSeancePrevu: text("horaire_seance_prevu"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userDateUnique: unique("user_date_unique").on(table.userId, table.date),
}));

export const sessionLogs = pgTable("session_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  seanceTemplateId: uuid("seance_template_id").references(() => seanceTemplates.id),
  dailyStateId: uuid("daily_state_id").references(() => dailyStates.id),
  date: date("date").notNull(),
  gymId: uuid("gym_id").references(() => gyms.id),
  dureeMinutes: integer("duree_minutes"),
  energieFin: integer("energie_fin"),
  feuBiologiqueJour: text("feu_biologique_jour"),
  feuBiologiqueTendance: text("feu_biologique_tendance"),
  volumeAjustePct: integer("volume_ajuste_pct"),
  volumeAjusteRaison: text("volume_ajuste_raison"),
  notesSeance: text("notes_seance"),
  /**
   * Date d'archivage.
   *
   * Une reprise apres une longue interruption, ou un demenagement, rend
   * l'existant trompeur : les anciennes charges et l'ancien parc fausseraient
   * la programmation sans rien apporter. Les archiver plutot que les supprimer
   * les retire de tout calcul en preservant la trace de ce qui a ete fait.
   */
  archiveLe: timestamp("archive_le"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const setLogs = pgTable("set_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionLogId: uuid("session_log_id").references(() => sessionLogs.id).notNull(),
  exerciseInstanceId: uuid("exercise_instance_id").references(() => exerciseInstances.id).notNull(),
  numeroSerie: integer("numero_serie").notNull(),
  repsEffectuees: integer("reps_effectuees").notNull(),
  charge: real("charge").notNull(),
  rpeEffectif: real("rpe_effectif"),
  tempoRespecte: boolean("tempo_respecte"),
  reposReelSecondes: integer("repos_reel_secondes"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const bodyWeights = pgTable("body_weights", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  date: date("date").notNull(),
  poids: real("poids").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userDateUnique: unique("body_weights_user_date_unique").on(table.userId, table.date),
}));

export const coachConversations = pgTable("coach_conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  title: text("title"),
  sessionLogId: uuid("session_log_id").references(() => sessionLogs.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const coachMessages = pgTable("coach_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").references(() => coachConversations.id).notNull(),
  role: text("role").notNull(), // 'user' | 'assistant' | 'system'
  content: text("content").notNull(),
  toolCalls: jsonb("tool_calls"),
  toolResults: jsonb("tool_results"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sessionIncidents = pgTable("session_incidents", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionLogId: uuid("session_log_id").references(() => sessionLogs.id).notNull(),
  type: text("type").notNull(), // 'machine_occupee' | 'douleur' | 'energie_chute' | 'temps_depasse'
  contexte: jsonb("contexte").$type<Record<string, unknown>>().notNull(),
  decision: text("decision").notNull(),
  impactProgramme: text("impact_programme"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const precalcSessions = pgTable("precalc_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  targetDate: date("target_date").notNull(),
  seanceTemplateId: uuid("seance_template_id").references(() => seanceTemplates.id),
  contenu: text("contenu").notNull(),
  contexteUtilise: jsonb("contexte_utilise").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userDateUnique: unique("precalc_user_date_unique").on(table.userId, table.targetDate),
}));

export const weeklyDebriefs = pgTable("weekly_debriefs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  weekStart: date("week_start").notNull(),
  weekEnd: date("week_end").notNull(),
  contenu: text("contenu").notNull(),
  stats: jsonb("stats").$type<{
    nbSeances: number;
    volumeTotal: number;
    feux: { vert: number; orange: number; rouge: number };
    progressions: string[];
    stagnations: string[];
    incidentsNb: number;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userWeekUnique: unique("weekly_debrief_user_week_unique").on(table.userId, table.weekStart),
}));


/**
 * La seance du jour : ce que l'application a decide pour aujourd'hui.
 *
 * Il manquait un objet entre le TEMPLATE (ce qui etait prevu il y a des semaines)
 * et le LOG (ce qui a ete fait). Sans lui, les calculs d'adaptation n'avaient nulle
 * part ou se poser : l'ajustement de volume finissait dans un sessionStorage que
 * personne ne relisait, et la charge suggeree etait recalculee puis oubliee.
 *
 * Une ligne = un exercice prescrit pour cette seance, apres resolution de la salle,
 * ajustement du volume et calcul de la charge.
 */
export const sessionPlanItems = pgTable("session_plan_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionLogId: uuid("session_log_id").references(() => sessionLogs.id).notNull(),
  ordre: integer("ordre").notNull(),

  /** Instance retenue APRES resolution de la salle du jour. */
  exerciseInstanceId: uuid("exercise_instance_id").references(() => exerciseInstances.id).notNull(),
  /** Ligne de template d'origine, absente pour un exercice ajoute a la volee. */
  exerciseInTemplateId: uuid("exercise_in_template_id").references(() => exerciseInTemplate.id),
  /** Instance initialement prevue, quand la salle a impose une substitution. */
  substitutionDeInstanceId: uuid("substitution_de_instance_id").references(() => exerciseInstances.id),
  /**
   * Ce qui etait prevu au depart, ecrit une fois et jamais reecrit.
   *
   * `substitution_de_instance_id` ne suffisait pas : il porte le remplacement
   * precedent, donc il bouge a chaque adaptation. Apres un aller-retour
   * salle -> maison -> salle, plus rien ne disait ce que la seance devait etre.
   *
   * La progression en a besoin pour ne PAS conclure a une stagnation ni a une
   * absence inexpliquee : un exercice remplace faute de materiel n'a pas ete
   * rate, il n'a pas ete propose.
   */
  exerciseInstancePrevuId: uuid("exercise_instance_prevu_id").references(() => exerciseInstances.id),
  /**
   * Pourquoi l'adaptation a eu lieu : lieu change, materiel absent, machine
   * occupee, materiel apporte. La raison textuelle s'adresse a l'utilisateur ;
   * ceci s'adresse au moteur et au planificateur.
   */
  contexteAdaptation: jsonb("contexte_adaptation").$type<{
    type: "changement_lieu" | "materiel_absent" | "machine_occupee" | "autre";
    lieuAvantId?: string | null;
    lieuAvantNom?: string | null;
    lieuApresId?: string | null;
    lieuApresNom?: string | null;
    materielApporte?: string[];
    niveauFidelite?: string;
    qualite?: string;
    horodatage?: string;
  }>(),
  raisonSubstitution: text("raison_substitution"),

  /** Prescription effective, ajustement de volume compris. */
  seriesCibles: integer("series_cibles").notNull(),
  seriesPrevuesAvantAjustement: integer("series_prevues_avant_ajustement"),
  fourchetteRepsMin: integer("fourchette_reps_min").notNull(),
  fourchetteRepsMax: integer("fourchette_reps_max").notNull(),
  rpeCible: real("rpe_cible"),
  tempo: text("tempo"),
  reposSecondes: integer("repos_secondes"),

  /** Issue de la double progression sur l'historique de CETTE instance. */
  chargeSuggeree: real("charge_suggeree"),
  repsSuggerees: jsonb("reps_suggerees").$type<number[]>(),
  messageProgression: text("message_progression"),

  /** 'prevu' | 'fait' | 'passe' | 'reporte' */
  statut: text("statut").notNull().default("prevu"),
  raisonStatut: text("raison_statut"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * Contraintes physiques persistantes : blessure, zone sensible, douleur recurrente.
 *
 * Une douleur n'existait que le temps d'une modale : elle n'etait pas historisee et
 * ne survivait pas a la seance. Le lendemain, l'application reproposait le meme
 * exercice sur la meme epaule, sans memoire.
 */
export const contraintes = pgTable("contraintes", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  /** Muscle du referentiel, ou zone de douleur. */
  muscle: text("muscle").notNull(),
  /** 'blessure' | 'douleur' | 'zone_sensible' */
  type: text("type").notNull(),
  /** 1-10 : au-dela de 7, l'exercice est ecarte plutot qu'allege. */
  severite: integer("severite").notNull(),
  notes: text("notes"),
  dateDebut: date("date_debut").notNull(),
  /** Nulle tant que la contrainte est active. */
  dateFin: date("date_fin"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * Mémoire du coach.
 *
 * L'historique brut dit ce qui s'est passé ; il ne dit pas ce qu'on en a
 * appris. Sans cette séparation, le coach doit re-déduire les mêmes constats à
 * chaque conversation, à partir d'un contexte forcément tronqué — et il oublie
 * tout entre deux échanges.
 *
 * Une observation peut venir d'un calcul de l'application ou d'une déduction du
 * modèle ; `source` les distingue, parce qu'elles ne méritent pas la même
 * confiance. `confirmee` marque celles que l'utilisateur a validées.
 */
export const coachMemoires = pgTable("coach_memoires", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  /** L'observation, en une phrase, telle qu'elle serait dite à voix haute. */
  observation: text("observation").notNull(),
  /** 'recuperation' | 'preference' | 'technique' | 'progression' | 'contrainte' */
  categorie: text("categorie").notNull(),
  /** 'calcul' quand l'application l'a mesurée, 'modele' quand le coach l'a déduite. */
  source: text("source").notNull().default("modele"),
  /** Muscles ou exercices concernés, pour retrouver l'observation au bon moment. */
  motsCles: jsonb("mots_cles").$type<string[]>(),
  /** 1-5 : une déduction isolée ne pèse pas autant qu'une régularité mesurée. */
  poids: integer("poids").notNull().default(3),
  confirmee: boolean("confirmee").notNull().default(false),
  /** Nulle tant que l'observation vaut ; datée quand elle cesse d'être vraie. */
  invalideeLe: timestamp("invalidee_le"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});


/**
 * Propositions du coach.
 *
 * Une proposition n'est pas une modification : c'est une modification calculée,
 * montrée, et qui attend un oui. Elle vit en base plutôt qu'en mémoire pour
 * trois raisons.
 *
 * D'abord parce que la confirmation arrive dans une seconde requête : entre les
 * deux, rien ne dit que le serveur est le même. Ensuite parce que l'avant doit
 * être figé au moment du calcul — le reconstruire à l'application reviendrait à
 * comparer l'après à un avant qui a peut-être bougé. Enfin parce que ces lignes
 * sont la trace : ce qui a été proposé, par quelle conversation, accepté ou non,
 * et ce que l'application a donné. Une proposition refusée se conserve autant
 * qu'une proposition appliquée.
 */
export const coachPropositions = pgTable("coach_propositions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  /** La conversation d'où elle vient, pour l'afficher au bon endroit. */
  conversationId: uuid("conversation_id").references(() => coachConversations.id),
  /** Séance programmée visée. Le périmètre actuel s'arrête à cet objet. */
  seanceTemplateId: uuid("seance_template_id").references(() => seanceTemplates.id).notNull(),
  /** 'remplacer_exercice' | 'ajuster_volume' | 'ajouter_exercice' | 'retirer_exercice' */
  operation: text("operation").notNull(),
  /** L'opération telle que le serveur l'a retenue, identifiants vérifiés. */
  parametres: jsonb("parametres").$type<Record<string, unknown>>().notNull(),
  /** L'état d'avant, construit par le serveur — jamais transmis par le modèle. */
  avant: jsonb("avant").$type<unknown[]>().notNull(),
  apres: jsonb("apres").$type<unknown[]>().notNull(),
  /** Ce qui a été montré à l'humain, mot pour mot. */
  apercu: jsonb("apercu").$type<Record<string, unknown>>().notNull(),
  /**
   * Empreinte de la séance au moment du calcul.
   *
   * Applique-t-on encore la bonne chose ? Si la séance a changé entre la
   * proposition et le oui, l'opération pourrait s'exécuter et produire autre
   * chose que ce qui était affiché. Cette empreinte rend l'écart détectable.
   */
  empreinte: text("empreinte").notNull(),
  /** 'en_attente' | 'appliquee' | 'refusee' | 'perimee' | 'echouee' */
  statut: text("statut").notNull().default("en_attente"),
  /** Contrôles passés après écriture, ou la raison d'un échec. */
  resultat: jsonb("resultat").$type<Record<string, unknown>>(),
  decideLe: timestamp("decide_le"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});


// ---------------------------------------------------------------------------
// Relations
//
// Sans ces declarations, toute requete `db.query.X.findMany({ with: { ... } })`
// echoue a l'execution : Drizzle ne connait pas le lien. Cinq appels du code
// (fiche exercice, routes exercices/instances, outils du coach) en dependaient.
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  gyms: many(gyms),
  exercises: many(exercises),
  exerciseInstances: many(exerciseInstances),
  sessionLogs: many(sessionLogs),
  dailyStates: many(dailyStates),
  bodyWeights: many(bodyWeights),
  programmeBlocs: many(programmeBlocs),
}));

export const gymsRelations = relations(gyms, ({ one, many }) => ({
  user: one(users, { fields: [gyms.userId], references: [users.id] }),
  exerciseInstances: many(exerciseInstances),
}));

export const exercisesRelations = relations(exercises, ({ one, many }) => ({
  user: one(users, { fields: [exercises.userId], references: [users.id] }),
  instances: many(exerciseInstances),
}));

export const exerciseInstancesRelations = relations(exerciseInstances, ({ one, many }) => ({
  user: one(users, { fields: [exerciseInstances.userId], references: [users.id] }),
  exercise: one(exercises, { fields: [exerciseInstances.exerciseId], references: [exercises.id] }),
  gym: one(gyms, { fields: [exerciseInstances.gymId], references: [gyms.id] }),
  setLogs: many(setLogs),
  templateEntries: many(exerciseInTemplate),
}));

export const programmeBlocsRelations = relations(programmeBlocs, ({ one, many }) => ({
  user: one(users, { fields: [programmeBlocs.userId], references: [users.id] }),
  seanceTemplates: many(seanceTemplates),
}));

export const seanceTemplatesRelations = relations(seanceTemplates, ({ one, many }) => ({
  bloc: one(programmeBlocs, { fields: [seanceTemplates.blocId], references: [programmeBlocs.id] }),
  exercises: many(exerciseInTemplate),
  sessionLogs: many(sessionLogs),
}));

export const exerciseInTemplateRelations = relations(exerciseInTemplate, ({ one }) => ({
  seanceTemplate: one(seanceTemplates, { fields: [exerciseInTemplate.seanceTemplateId], references: [seanceTemplates.id] }),
  exerciseInstance: one(exerciseInstances, { fields: [exerciseInTemplate.exerciseInstanceId], references: [exerciseInstances.id] }),
}));

export const dailyStatesRelations = relations(dailyStates, ({ one, many }) => ({
  user: one(users, { fields: [dailyStates.userId], references: [users.id] }),
  gym: one(gyms, { fields: [dailyStates.gymId], references: [gyms.id] }),
  sessionLogs: many(sessionLogs),
}));

export const sessionLogsRelations = relations(sessionLogs, ({ one, many }) => ({
  user: one(users, { fields: [sessionLogs.userId], references: [users.id] }),
  seanceTemplate: one(seanceTemplates, { fields: [sessionLogs.seanceTemplateId], references: [seanceTemplates.id] }),
  dailyState: one(dailyStates, { fields: [sessionLogs.dailyStateId], references: [dailyStates.id] }),
  gym: one(gyms, { fields: [sessionLogs.gymId], references: [gyms.id] }),
  setLogs: many(setLogs),
  incidents: many(sessionIncidents),
  planItems: many(sessionPlanItems),
}));

export const sessionPlanItemsRelations = relations(sessionPlanItems, ({ one }) => ({
  sessionLog: one(sessionLogs, { fields: [sessionPlanItems.sessionLogId], references: [sessionLogs.id] }),
  exerciseInstance: one(exerciseInstances, { fields: [sessionPlanItems.exerciseInstanceId], references: [exerciseInstances.id] }),
}));

export const contraintesRelations = relations(contraintes, ({ one }) => ({
  user: one(users, { fields: [contraintes.userId], references: [users.id] }),
}));

export const coachMemoiresRelations = relations(coachMemoires, ({ one }) => ({
  user: one(users, { fields: [coachMemoires.userId], references: [users.id] }),
}));

export const setLogsRelations = relations(setLogs, ({ one }) => ({
  sessionLog: one(sessionLogs, { fields: [setLogs.sessionLogId], references: [sessionLogs.id] }),
  exerciseInstance: one(exerciseInstances, { fields: [setLogs.exerciseInstanceId], references: [exerciseInstances.id] }),
}));

export const bodyWeightsRelations = relations(bodyWeights, ({ one }) => ({
  user: one(users, { fields: [bodyWeights.userId], references: [users.id] }),
}));

export const coachConversationsRelations = relations(coachConversations, ({ one, many }) => ({
  user: one(users, { fields: [coachConversations.userId], references: [users.id] }),
  sessionLog: one(sessionLogs, { fields: [coachConversations.sessionLogId], references: [sessionLogs.id] }),
  messages: many(coachMessages),
}));

export const coachMessagesRelations = relations(coachMessages, ({ one }) => ({
  conversation: one(coachConversations, { fields: [coachMessages.conversationId], references: [coachConversations.id] }),
}));

export const sessionIncidentsRelations = relations(sessionIncidents, ({ one }) => ({
  sessionLog: one(sessionLogs, { fields: [sessionIncidents.sessionLogId], references: [sessionLogs.id] }),
}));


// Inferred types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Gym = typeof gyms.$inferSelect;
export type NewGym = typeof gyms.$inferInsert;
export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;
export type ExerciseInstance = typeof exerciseInstances.$inferSelect;
export type NewExerciseInstance = typeof exerciseInstances.$inferInsert;
export type ProgrammeBloc = typeof programmeBlocs.$inferSelect;
export type NewProgrammeBloc = typeof programmeBlocs.$inferInsert;
export type SeanceTemplate = typeof seanceTemplates.$inferSelect;
export type NewSeanceTemplate = typeof seanceTemplates.$inferInsert;
export type ExerciseInTemplate = typeof exerciseInTemplate.$inferSelect;
export type NewExerciseInTemplate = typeof exerciseInTemplate.$inferInsert;
export type DailyState = typeof dailyStates.$inferSelect;
export type NewDailyState = typeof dailyStates.$inferInsert;
export type SessionLog = typeof sessionLogs.$inferSelect;
export type NewSessionLog = typeof sessionLogs.$inferInsert;
export type SetLog = typeof setLogs.$inferSelect;
export type NewSetLog = typeof setLogs.$inferInsert;
export type BodyWeight = typeof bodyWeights.$inferSelect;
export type NewBodyWeight = typeof bodyWeights.$inferInsert;
export type CoachConversation = typeof coachConversations.$inferSelect;
export type NewCoachConversation = typeof coachConversations.$inferInsert;
export type CoachMessage = typeof coachMessages.$inferSelect;
export type NewCoachMessage = typeof coachMessages.$inferInsert;
export type SessionIncident = typeof sessionIncidents.$inferSelect;
export type NewSessionIncident = typeof sessionIncidents.$inferInsert;
export type PrecalcSession = typeof precalcSessions.$inferSelect;
export type NewPrecalcSession = typeof precalcSessions.$inferInsert;
export type WeeklyDebrief = typeof weeklyDebriefs.$inferSelect;
export type NewWeeklyDebrief = typeof weeklyDebriefs.$inferInsert;
export type SessionPlanItem = typeof sessionPlanItems.$inferSelect;
export type NewSessionPlanItem = typeof sessionPlanItems.$inferInsert;
export type Contrainte = typeof contraintes.$inferSelect;
export type NewContrainte = typeof contraintes.$inferInsert;
