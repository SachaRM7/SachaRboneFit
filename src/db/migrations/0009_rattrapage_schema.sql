-- Rattrapage : ce que les migrations ne savaient pas construire.
--
-- Une base vide plus les migrations de ce dépôt ne produisait pas le schéma
-- que l'application attend. Plusieurs chantiers passés ont modifié la base
-- avec `drizzle-kit push`, qui applique la différence sans laisser de fichier :
-- le schéma vivant avançait, l'historique versionné restait derrière. La
-- dérive ne se voit nulle part tant qu'on ne reconstruit pas — et c'est en
-- montant une base neuve pour vérifier l'import Saint-Martin qu'elle est
-- apparue, sous la forme d'une colonne `archive_le` introuvable.
--
-- Ce fichier rattrape TRENTE ET UNE colonnes, une table entière et deux clés
-- étrangères. Il ne réécrit aucune migration ancienne : celles-ci décrivent ce
-- qui a réellement été appliqué à l'époque, et les corriger après coup ferait
-- diverger les bases déjà migrées.
--
-- Tout y est idempotent — `IF NOT EXISTS`, et des blocs gardés pour les
-- contraintes, que PostgreSQL ne sait pas créer conditionnellement. Le fichier
-- est donc sûr dans les trois situations : base neuve migrée depuis zéro, base
-- vivante déjà conforme, base partiellement conforme.

-- ---------------------------------------------------------------------------
-- Archivage : quatre tables l'ont reçu sans qu'aucune migration le dise
-- ---------------------------------------------------------------------------
-- Archiver plutôt que supprimer répond à deux questions distinctes : « qu'est-ce
-- qui compte pour le calcul d'aujourd'hui » n'est pas « qu'est-ce qui a été
-- fait ». Le prédicat est lu partout dans le moteur ; sans ces colonnes,
-- l'application ne démarre pas.
ALTER TABLE "gyms" ADD COLUMN IF NOT EXISTS "archive_le" timestamp;--> statement-breakpoint
ALTER TABLE "exercise_instances" ADD COLUMN IF NOT EXISTS "archive_le" timestamp;--> statement-breakpoint
ALTER TABLE "programme_blocs" ADD COLUMN IF NOT EXISTS "archive_le" timestamp;--> statement-breakpoint
ALTER TABLE "session_logs" ADD COLUMN IF NOT EXISTS "archive_le" timestamp;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Ce qu'une salle possède
-- ---------------------------------------------------------------------------
-- `null` et `[]` ne disent pas la même chose : `null` = personne n'a encore
-- décrit ce lieu, `[]` = décrit, et il n'y a rien de plus que le poids du
-- corps. Aucune valeur par défaut, donc, sous peine d'effacer la distinction.
ALTER TABLE "gyms" ADD COLUMN IF NOT EXISTS "equipements_disponibles" jsonb;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Un exercice décrit un mouvement, pas une personne
-- ---------------------------------------------------------------------------
-- La colonne était NOT NULL : la bibliothèque commune devait donc appartenir à
-- quelqu'un, et trois cent soixante et une lignes existaient pour cent vingt
-- mouvements. Seules les entrées créées à la main portent encore un auteur.
ALTER TABLE "exercises" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Le profil d'entraînement, tel que l'onboarding le remplit
-- ---------------------------------------------------------------------------
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarding_termine_le" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "niveau_experience" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "annees_de_pratique" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mois_d_interruption" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "frequence_min_par_semaine" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "frequence_max_par_semaine" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "duree_seance_max_minutes" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preference_materiel" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "exercices_apprecies" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "exercices_refuses" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "materiel_personnel_habituel" jsonb;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Le matériel qu'on apporte aujourd'hui
-- ---------------------------------------------------------------------------
-- Il décrit un sac, pas un lieu : deux élastiques changent ce qui est faisable
-- ce jour-là sans que la salle en possède.
ALTER TABLE "daily_states" ADD COLUMN IF NOT EXISTS "materiel_apporte" jsonb;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- La trace d'une substitution, sur la ligne de séance
-- ---------------------------------------------------------------------------
ALTER TABLE "session_plan_items" ADD COLUMN IF NOT EXISTS "exercise_instance_prevu_id" uuid;--> statement-breakpoint
ALTER TABLE "session_plan_items" ADD COLUMN IF NOT EXISTS "contexte_adaptation" jsonb;--> statement-breakpoint

-- Le nom est tronqué à 63 caractères par PostgreSQL, et c'est celui que
-- produit Drizzle : le reproduire tel quel évite qu'une comparaison de schémas
-- signale une différence qui n'en est pas une.
DO $$ BEGIN
  ALTER TABLE "session_plan_items"
    ADD CONSTRAINT "session_plan_items_exercise_instance_prevu_id_exercise_instance"
    FOREIGN KEY ("exercise_instance_prevu_id") REFERENCES "public"."exercise_instances"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- La mémoire du coach : une table entière, absente de l'historique
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "coach_memoires" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "observation" text NOT NULL,
  "categorie" text NOT NULL,
  -- Qui l'a formulée : le modèle, ou l'athlète lui-même.
  "source" text DEFAULT 'modele' NOT NULL,
  "mots_cles" jsonb,
  "poids" integer DEFAULT 3 NOT NULL,
  "confirmee" boolean DEFAULT false NOT NULL,
  -- Invalider plutôt que supprimer : une observation démentie reste une trace
  -- de ce que le coach a cru, et cesse simplement de peser.
  "invalidee_le" timestamp,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "coach_memoires"
    ADD CONSTRAINT "coach_memoires_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Un nom de contrainte, pour les bases construites autrement
-- ---------------------------------------------------------------------------
-- La même clé étrangère porte deux noms selon la façon dont la base a été
-- montée : `..._fkey`, généré par PostgreSQL, sur celles où elle a été créée
-- à la main ou par un push ; `..._contrainte_id_contraintes_id_fk`, la
-- convention Drizzle, sur celles issues de la migration 0007.
--
-- La définition est identique et le comportement aussi : ce n'est pas une
-- divergence de schéma, seulement de nomenclature. Elle est corrigée quand
-- même, parce qu'un nom qui dépend de l'histoire d'une base est exactement le
-- genre de détail qui fait échouer une comparaison automatique un an plus tard,
-- pour rien.
DO $$ BEGIN
  ALTER TABLE "coach_propositions"
    RENAME CONSTRAINT "coach_propositions_contrainte_id_fkey"
    TO "coach_propositions_contrainte_id_contraintes_id_fk";
EXCEPTION
  -- Le nom canonique est déjà en place, ou l'ancien n'a jamais existé.
  WHEN undefined_object THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Les trois index de lecture, pour les bases qui ne les ont pas
-- ---------------------------------------------------------------------------
-- Ils vivaient dans les migrations 0004, 0005 et 0006 mais pas dans le schéma
-- Drizzle : un `drizzle-kit push` les aurait supprimés sans que personne le
-- remarque, puisqu'un index manquant ne casse rien — il ralentit. Ils sont
-- désormais déclarés dans `schema.ts` ; ces trois lignes ne servent qu'aux
-- bases où un push les aurait déjà emportés.
CREATE INDEX IF NOT EXISTS "coach_propositions_en_attente_idx"
  ON "coach_propositions" ("user_id","statut","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercise_in_template_actives_idx"
  ON "exercise_in_template" ("seance_template_id","archive_le");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contraintes_actives_idx"
  ON "contraintes" ("user_id","date_fin");
