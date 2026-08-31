-- Le coach doit pouvoir proposer une contrainte, pas seulement une séance.
--
-- La table ne connaissait qu'un sujet : une séance programmée. Plutôt qu'un
-- second mécanisme de proposition — aperçu, empreinte, confirmation, atomicité
-- à réécrire — elle en accueille un deuxième.
ALTER TABLE "coach_propositions" ALTER COLUMN "seance_template_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_propositions" ADD COLUMN "sujet" text DEFAULT 'seance' NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_propositions" ADD COLUMN "contrainte_id" uuid;--> statement-breakpoint
ALTER TABLE "coach_propositions" ADD CONSTRAINT "coach_propositions_contrainte_id_contraintes_id_fk" FOREIGN KEY ("contrainte_id") REFERENCES "public"."contraintes"("id") ON DELETE no action ON UPDATE no action;
