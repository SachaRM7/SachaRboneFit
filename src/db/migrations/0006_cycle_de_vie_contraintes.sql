-- Une gêne doit pouvoir sortir du système.
--
-- `date_fin` existait déjà et n'était écrite par aucun chemin applicatif : les
-- contraintes entraient et restaient. Elle devient la sortie ; ces deux
-- colonnes ajoutent de quoi la déclencher.
ALTER TABLE "contraintes" ADD COLUMN "a_reevaluer_le" date;--> statement-breakpoint
ALTER TABLE "contraintes" ADD COLUMN "origine" text DEFAULT 'athlete' NOT NULL;--> statement-breakpoint

-- Les lignes existantes viennent toutes de l'onboarding : c'est le seul chemin
-- de création qui ait jamais existé, et il forçait `type = 'zone_sensible'`.
UPDATE "contraintes" SET "origine" = 'onboarding';--> statement-breakpoint

-- `a_reevaluer_le` reste NULLE sur l'existant, et c'est délibéré.
--
-- Nulle veut dire « ne pas relancer ». Aucune contrainte déjà déclarée ne
-- devient donc inactive, et aucune ne se met à poser une question que
-- l'athlète n'attend pas : elles restent exactement ce qu'elles étaient. Il
-- reste possible de les lever à la main depuis l'écran des contraintes, ce qui
-- n'existait pas non plus.

-- Les lectures du moteur filtrent sur l'utilisateur et la date de fin.
CREATE INDEX "contraintes_actives_idx" ON "contraintes" ("user_id","date_fin");
