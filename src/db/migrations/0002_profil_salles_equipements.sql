ALTER TABLE "daily_states" ADD COLUMN "gym_id" uuid;--> statement-breakpoint
ALTER TABLE "exercise_instances" ADD COLUMN "charge_max" real;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "muscles_secondaires" jsonb;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "equipement" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "objectif_type" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "objectif_muscles_prioritaires" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "frequence_cible_par_semaine" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "duree_seance_cible_minutes" integer;--> statement-breakpoint
ALTER TABLE "daily_states" ADD CONSTRAINT "daily_states_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE no action ON UPDATE no action;