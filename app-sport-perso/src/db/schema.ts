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
