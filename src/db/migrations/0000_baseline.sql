CREATE TABLE "body_weights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"poids" real NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "body_weights_user_date_unique" UNIQUE("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "coach_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text,
	"session_log_id" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coach_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"tool_calls" jsonb,
	"tool_results" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "daily_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"sommeil_heures" real,
	"jeune_bool" boolean DEFAULT false,
	"shift_recent_bool" boolean DEFAULT false,
	"shift_type" text,
	"energie_depart" integer,
	"courbatures" jsonb,
	"dernier_repas_heure" text,
	"horaire_seance_prevu" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_date_unique" UNIQUE("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "exercise_in_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seance_template_id" uuid NOT NULL,
	"exercise_instance_id" uuid NOT NULL,
	"ordre" integer NOT NULL,
	"series_cibles" integer NOT NULL,
	"fourchette_reps_min" integer NOT NULL,
	"fourchette_reps_max" integer NOT NULL,
	"rpe_cible" real,
	"tempo" text,
	"repos_secondes" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "exercise_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"gym_id" uuid NOT NULL,
	"machine_nom" text NOT NULL,
	"type_poulie" text DEFAULT 'na',
	"convention_charge" text NOT NULL,
	"increments_possibles" jsonb NOT NULL,
	"poids_non_compte" real,
	"notes_machine" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"nom" text NOT NULL,
	"pilier" text NOT NULL,
	"profil_tension" text NOT NULL,
	"type" text NOT NULL,
	"categorie_role" text NOT NULL,
	"muscles_principaux" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "gyms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"nom" text NOT NULL,
	"horaires_ouverture" text,
	"est_24h" boolean DEFAULT false,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "precalc_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"target_date" date NOT NULL,
	"seance_template_id" uuid,
	"contenu" text NOT NULL,
	"contexte_utilise" jsonb,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "precalc_user_date_unique" UNIQUE("user_id","target_date")
);
--> statement-breakpoint
CREATE TABLE "programme_blocs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"nom" text NOT NULL,
	"date_debut" date NOT NULL,
	"date_fin_prevue" date,
	"type_cycle" text NOT NULL,
	"semaine_actuelle" integer DEFAULT 1,
	"actif" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "seance_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bloc_id" uuid NOT NULL,
	"lettre" text NOT NULL,
	"nom" text NOT NULL,
	"ordre_dans_semaine" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "session_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_log_id" uuid NOT NULL,
	"type" text NOT NULL,
	"contexte" jsonb NOT NULL,
	"decision" text NOT NULL,
	"impact_programme" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "session_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"seance_template_id" uuid,
	"daily_state_id" uuid,
	"date" date NOT NULL,
	"gym_id" uuid,
	"duree_minutes" integer,
	"energie_fin" integer,
	"feu_biologique_jour" text,
	"feu_biologique_tendance" text,
	"volume_ajuste_pct" integer,
	"volume_ajuste_raison" text,
	"notes_seance" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "set_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_log_id" uuid NOT NULL,
	"exercise_instance_id" uuid NOT NULL,
	"numero_serie" integer NOT NULL,
	"reps_effectuees" integer NOT NULL,
	"charge" real NOT NULL,
	"rpe_effectif" real,
	"tempo_respecte" boolean,
	"repos_reel_secondes" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"nom" text,
	"date_naissance" date,
	"taille" integer,
	"phase_nutritionnelle" text,
	"objectif_chiffre" text,
	"date_cible" date,
	"pref_salle_par_defaut_id" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "weekly_debriefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"week_end" date NOT NULL,
	"contenu" text NOT NULL,
	"stats" jsonb,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "weekly_debrief_user_week_unique" UNIQUE("user_id","week_start")
);
--> statement-breakpoint
ALTER TABLE "body_weights" ADD CONSTRAINT "body_weights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_conversations" ADD CONSTRAINT "coach_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_conversations" ADD CONSTRAINT "coach_conversations_session_log_id_session_logs_id_fk" FOREIGN KEY ("session_log_id") REFERENCES "public"."session_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_messages" ADD CONSTRAINT "coach_messages_conversation_id_coach_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."coach_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_states" ADD CONSTRAINT "daily_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_in_template" ADD CONSTRAINT "exercise_in_template_seance_template_id_seance_templates_id_fk" FOREIGN KEY ("seance_template_id") REFERENCES "public"."seance_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_in_template" ADD CONSTRAINT "exercise_in_template_exercise_instance_id_exercise_instances_id_fk" FOREIGN KEY ("exercise_instance_id") REFERENCES "public"."exercise_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_instances" ADD CONSTRAINT "exercise_instances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_instances" ADD CONSTRAINT "exercise_instances_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_instances" ADD CONSTRAINT "exercise_instances_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gyms" ADD CONSTRAINT "gyms_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precalc_sessions" ADD CONSTRAINT "precalc_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precalc_sessions" ADD CONSTRAINT "precalc_sessions_seance_template_id_seance_templates_id_fk" FOREIGN KEY ("seance_template_id") REFERENCES "public"."seance_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programme_blocs" ADD CONSTRAINT "programme_blocs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seance_templates" ADD CONSTRAINT "seance_templates_bloc_id_programme_blocs_id_fk" FOREIGN KEY ("bloc_id") REFERENCES "public"."programme_blocs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_incidents" ADD CONSTRAINT "session_incidents_session_log_id_session_logs_id_fk" FOREIGN KEY ("session_log_id") REFERENCES "public"."session_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_logs" ADD CONSTRAINT "session_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_logs" ADD CONSTRAINT "session_logs_seance_template_id_seance_templates_id_fk" FOREIGN KEY ("seance_template_id") REFERENCES "public"."seance_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_logs" ADD CONSTRAINT "session_logs_daily_state_id_daily_states_id_fk" FOREIGN KEY ("daily_state_id") REFERENCES "public"."daily_states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_logs" ADD CONSTRAINT "session_logs_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_session_log_id_session_logs_id_fk" FOREIGN KEY ("session_log_id") REFERENCES "public"."session_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_exercise_instance_id_exercise_instances_id_fk" FOREIGN KEY ("exercise_instance_id") REFERENCES "public"."exercise_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_debriefs" ADD CONSTRAINT "weekly_debriefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;