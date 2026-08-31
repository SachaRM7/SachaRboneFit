-- Ce qu'un appareil permet réellement d'atteindre.
--
-- Le modèle savait dire « cette machine monte par 5 kg ». Il ne savait pas dire
-- qu'une pile commence à 5 et s'arrête à 100, qu'un râtelier ne contient que
-- des barres de 10, 15, 20, 25 et 30, qu'une machine est en panne cette
-- semaine, ni qu'une charge peut AIDER au lieu de résister. Confronté à un
-- premier inventaire réel, il proposait des charges qui n'existent pas.
--
-- Cinq colonnes s'ajoutent, et une devient nullable. Rien n'est supprimé :
-- aucune charge déjà enregistrée ne change de sens.

ALTER TABLE "exercise_instances" ADD COLUMN "paliers_charges" jsonb;--> statement-breakpoint
ALTER TABLE "exercise_instances" ADD COLUMN "charge_minimale" real;--> statement-breakpoint
ALTER TABLE "exercise_instances" ADD COLUMN "nature_charge" text DEFAULT 'resistance' NOT NULL;--> statement-breakpoint
ALTER TABLE "exercise_instances" ADD COLUMN "etat" text DEFAULT 'disponible' NOT NULL;--> statement-breakpoint
ALTER TABLE "exercise_instances" ADD COLUMN "quantite" integer;--> statement-breakpoint

-- Inconnu doit rester inconnu.
--
-- La colonne était NOT NULL : toute entrée devait porter des incréments, y
-- compris celles créées automatiquement, qui recevaient une valeur de repli
-- déduite du type de matériel. Une supposition et une mesure devenaient alors
-- indiscernables — et le moteur prescrivait « +2,5 kg » sur une machine dont
-- personne n'avait jamais regardé la pile.
ALTER TABLE "exercise_instances" ALTER COLUMN "increments_possibles" DROP NOT NULL;--> statement-breakpoint

-- Sort des anciennes lignes, explicitement.
--
-- Deux chemins créaient des entrées sans les avoir vues : la calibration et
-- l'adaptation de lieu, qui matérialisent un exercice déduit du matériel
-- déclaré. Toutes deux laissent la même trace dans les notes. Leurs incréments
-- n'ont jamais été mesurés : ils redeviennent inconnus.
--
-- Les autres entrées ont été saisies à la main, appareil sous les yeux : elles
-- gardent leurs incréments tels quels. Aucune ne reçoit de palier, de plancher
-- ni de quantité — ces informations n'ont jamais été relevées, et les inventer
-- ici serait exactement la faute qu'on corrige.
UPDATE "exercise_instances"
SET "increments_possibles" = NULL
WHERE "notes_machine" LIKE 'Déduit du matériel%';--> statement-breakpoint

-- Un tableau vide disait déjà « je ne sais pas », sans que le code sache le lire.
UPDATE "exercise_instances"
SET "increments_possibles" = NULL
WHERE "increments_possibles" = '[]'::jsonb;
