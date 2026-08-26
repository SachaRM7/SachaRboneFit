CREATE TABLE "contraintes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"muscle" text NOT NULL,
	"type" text NOT NULL,
	"severite" integer NOT NULL,
	"notes" text,
	"date_debut" date NOT NULL,
	"date_fin" date,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "session_plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_log_id" uuid NOT NULL,
	"ordre" integer NOT NULL,
	"exercise_instance_id" uuid NOT NULL,
	"exercise_in_template_id" uuid,
	"substitution_de_instance_id" uuid,
	"raison_substitution" text,
	"series_cibles" integer NOT NULL,
	"series_prevues_avant_ajustement" integer,
	"fourchette_reps_min" integer NOT NULL,
	"fourchette_reps_max" integer NOT NULL,
	"rpe_cible" real,
	"tempo" text,
	"repos_secondes" integer,
	"charge_suggeree" real,
	"reps_suggerees" jsonb,
	"message_progression" text,
	"statut" text DEFAULT 'prevu' NOT NULL,
	"raison_statut" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "contraintes" ADD CONSTRAINT "contraintes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_plan_items" ADD CONSTRAINT "session_plan_items_session_log_id_session_logs_id_fk" FOREIGN KEY ("session_log_id") REFERENCES "public"."session_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_plan_items" ADD CONSTRAINT "session_plan_items_exercise_instance_id_exercise_instances_id_fk" FOREIGN KEY ("exercise_instance_id") REFERENCES "public"."exercise_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_plan_items" ADD CONSTRAINT "session_plan_items_exercise_in_template_id_exercise_in_template_id_fk" FOREIGN KEY ("exercise_in_template_id") REFERENCES "public"."exercise_in_template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_plan_items" ADD CONSTRAINT "session_plan_items_substitution_de_instance_id_exercise_instances_id_fk" FOREIGN KEY ("substitution_de_instance_id") REFERENCES "public"."exercise_instances"("id") ON DELETE no action ON UPDATE no action;