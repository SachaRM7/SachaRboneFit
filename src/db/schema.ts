import { pgTable, uuid, text, boolean, timestamp, real, integer, jsonb, date, unique } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").unique().notNull(),
  nom: text("nom"),
  dateNaissance: date("date_naissance"),
  taille: integer("taille"),
  phaseNutritionnelle: text("phase_nutritionnelle"),
  objectifChiffre: text("objectif_chiffre"),
  dateCible: date("date_cible"),
  prefSalleParDefautId: uuid("pref_salle_par_defaut_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const gyms = pgTable("gyms", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  nom: text("nom").notNull(),
  horairesOuverture: text("horaires_ouverture"),
  est24h: boolean("est_24h").default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const exercises = pgTable("exercises", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  nom: text("nom").notNull(),
  pilier: text("pilier").notNull(),
  profilTension: text("profil_tension").notNull(),
  type: text("type").notNull(),
  categorieRole: text("categorie_role").notNull(),
  musclesPrincipaux: jsonb("muscles_principaux").$type<string[]>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const exerciseInstances = pgTable("exercise_instances", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  exerciseId: uuid("exercise_id").references(() => exercises.id).notNull(),
  gymId: uuid("gym_id").references(() => gyms.id).notNull(),
  machineNom: text("machine_nom").notNull(),
  typePoulie: text("type_poulie").default("na"),
  conventionCharge: text("convention_charge").notNull(),
  incrementsPossibles: jsonb("increments_possibles").$type<number[]>().notNull(),
  poidsNonCompte: real("poids_non_compte"),
  notesMachine: text("notes_machine"),
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
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const dailyStates = pgTable("daily_states", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  date: date("date").notNull(),
  sommeilHeures: real("sommeil_heures"),
  jeuneBool: boolean("jeune_bool").default(false),
  shiftRecentBool: boolean("shift_recent_bool").default(false),
  shiftType: text("shift_type"),
  energieDepart: integer("energie_depart"),
  courbatures: jsonb("courbatures").$type<{muscle: string; intensite: number}[]>(),
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
  contexte: jsonb("contexte").$type<Record<string, any>>().notNull(),
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
  contexteUtilise: jsonb("contexte_utilise").$type<Record<string, any>>(),
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
