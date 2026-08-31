CREATE TABLE "coach_propositions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid,
	"seance_template_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"parametres" jsonb NOT NULL,
	"avant" jsonb NOT NULL,
	"apres" jsonb NOT NULL,
	"apercu" jsonb NOT NULL,
	"empreinte" text NOT NULL,
	"statut" text DEFAULT 'en_attente' NOT NULL,
	"resultat" jsonb,
	"decide_le" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_propositions" ADD CONSTRAINT "coach_propositions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_propositions" ADD CONSTRAINT "coach_propositions_conversation_id_coach_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."coach_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_propositions" ADD CONSTRAINT "coach_propositions_seance_template_id_seance_templates_id_fk" FOREIGN KEY ("seance_template_id") REFERENCES "public"."seance_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- La carte affichée dans le tiroir ne lit que les propositions en attente d'un
-- utilisateur : sans cet index, elle balaierait tout l'historique des décisions.
CREATE INDEX "coach_propositions_en_attente_idx" ON "coach_propositions" ("user_id","statut","created_at");
