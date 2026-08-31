-- Retirer un exercice d'un programme sans effacer d'où vient l'historique.
--
-- `session_plan_items.exercise_in_template_id` référence cette table en
-- ON DELETE NO ACTION : toute ligne déjà servie dans une séance était
-- indélébile, et la suppression remontait en erreur 500.
ALTER TABLE "exercise_in_template" ADD COLUMN "archive_le" timestamp;--> statement-breakpoint
-- Les lectures du programme actif filtrent toutes sur cette colonne.
CREATE INDEX "exercise_in_template_actives_idx" ON "exercise_in_template" ("seance_template_id","archive_le");
