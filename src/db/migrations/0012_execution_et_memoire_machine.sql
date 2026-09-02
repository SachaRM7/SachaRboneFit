-- Exécuter un mouvement, pas seulement le programmer.
--
-- Debout devant la machine, il manquait de quoi agir : à quel cran mettre le
-- siège, quelle amplitude viser, quel tempo tenir, ce qu'on s'était noté la
-- fois d'avant. Trois natures d'information, trois portées distinctes, et les
-- confondre produirait exactement les faux souvenirs qu'on veut éviter — un
-- cran de siège recopié d'une machine à l'autre est pire qu'un cran absent.
--
--   le MOUVEMENT   fiche technique, tempo par défaut     -> exercises
--   l'APPAREIL     quels réglages existent, quelles      -> instance_reglages
--                  valeurs ils acceptent
--   la PERSONNE    ses valeurs à elle, sur CET appareil  -> reglages_personnels
--   × l'appareil   sa note                               -> notes_exercice
--
-- Tout est additif et nullable : les 99 instances de Saint-Martin, les
-- historiques, la calibration et les substitutions fonctionnent à l'identique
-- sans qu'une seule de ces lignes existe.

-- ---------------------------------------------------------------------------
-- Le mouvement
-- ---------------------------------------------------------------------------
-- La fiche est un document : ses sections sont toutes facultatives et arrivent
-- par vagues, exercice par exercice. Une table de colonnes obligerait à une
-- migration par section ajoutée ; une table de lignes clé/valeur perdrait la
-- distinction entre un texte et une liste de points. Le document est validé au
-- passage par un schéma Zod — il n'est donc pas opaque, il est seulement
-- structuré ailleurs que dans le catalogue Postgres.
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "fiche_technique" jsonb;--> statement-breakpoint

-- Le quatrième niveau du tempo, le plus général. Reste NULL partout : aucun
-- tempo universel n'est posé, sous peine de faire passer un remplissage
-- automatique pour une prescription.
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "tempo_par_defaut" text;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- L'appareil : ce qu'il propose comme réglages
-- ---------------------------------------------------------------------------
-- Une ligne par possibilité physique — « il y a un siège, il a dix crans ».
-- Surtout pas une colonne par type de réglage sur `exercise_instances` : le
-- rack a des safety bars que la Leg Extension n'a pas, le banc a une
-- inclinaison que la poulie n'a pas, et la table finirait creuse à quatre-vingt
-- pour cent.
--
-- Cette définition décrit l'OBJET, pas la personne : elle est donc commune à
-- tous les comptes du lieu, comme l'instance qui la porte.
CREATE TABLE IF NOT EXISTS "instance_reglages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "exercise_instance_id" uuid NOT NULL,
  -- Stable, en snake_case : c'est elle qui relie une valeur personnelle à sa
  -- définition. La renommer orpheline les valeurs mémorisées.
  "cle" text NOT NULL,
  "libelle" text NOT NULL,
  -- 'cran' | 'degres' | 'choix' | 'texte'
  "type_valeur" text NOT NULL,
  "min" real,
  "max" real,
  "options" jsonb,
  "unite" text,
  "ordre" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "instance_reglages"
    ADD CONSTRAINT "instance_reglages_exercise_instance_id_exercise_instances_id_fk"
    FOREIGN KEY ("exercise_instance_id") REFERENCES "public"."exercise_instances"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

-- Une machine ne propose pas deux fois le même réglage.
CREATE UNIQUE INDEX IF NOT EXISTS "instance_reglages_cle_unique"
  ON "instance_reglages" ("exercise_instance_id", "cle");--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- La personne × l'appareil : ses valeurs à elle
-- ---------------------------------------------------------------------------
-- Le point central. La machine propose des crans de 1 à 10 ; Sacha met le
-- siège au 6, Maria au 3. Ces valeurs n'appartiennent ni au mouvement ni à
-- l'appareil, mais au couple — et elles ne se recopient JAMAIS d'une machine à
-- l'autre au motif que c'est le même exercice. Deux Leg Extension de marques
-- différentes n'ont pas la même numérotation.
CREATE TABLE IF NOT EXISTS "reglages_personnels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "exercise_instance_id" uuid NOT NULL,
  "cle" text NOT NULL,
  -- Stockée en texte quelle que soit sa nature : la validation contre la
  -- définition a lieu à l'écriture, et un cran comme un choix se réaffichent
  -- tels qu'ils ont été saisis.
  "valeur" text NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "reglages_personnels"
    ADD CONSTRAINT "reglages_personnels_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "reglages_personnels"
    ADD CONSTRAINT "reglages_personnels_exercise_instance_id_exercise_instances_id_fk"
    FOREIGN KEY ("exercise_instance_id") REFERENCES "public"."exercise_instances"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

-- Une valeur par personne, par appareil, par réglage. L'unicité porte
-- l'écriture : enregistrer deux fois le siège met la valeur à jour, elle n'en
-- empile pas une seconde.
CREATE UNIQUE INDEX IF NOT EXISTS "reglages_personnels_unique"
  ON "reglages_personnels" ("user_id", "exercise_instance_id", "cle");--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- La note rapide
-- ---------------------------------------------------------------------------
-- « siège 6 parfait », « 36 kg trop facile », « légère gêne épaule ». Du
-- contexte, jamais une métrique : rien de ce qui est écrit ici n'entre dans la
-- progression, les records ou le feu biologique. C'est une phrase qu'on se
-- laisse à soi-même, et le moteur ne la lit pas.
--
-- Deux portées, parce que tout exercice n'a pas d'appareil : la note d'un
-- développé couché se range sur SON banc, celle des pompes sur l'exercice.
-- Exactement une des deux références est renseignée.
CREATE TABLE IF NOT EXISTS "notes_exercice" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "exercise_instance_id" uuid,
  "exercise_id" uuid,
  "texte" text NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "notes_exercice_une_seule_portee" CHECK (
    ("exercise_instance_id" IS NOT NULL AND "exercise_id" IS NULL)
    OR ("exercise_instance_id" IS NULL AND "exercise_id" IS NOT NULL)
  )
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "notes_exercice"
    ADD CONSTRAINT "notes_exercice_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "notes_exercice"
    ADD CONSTRAINT "notes_exercice_exercise_instance_id_exercise_instances_id_fk"
    FOREIGN KEY ("exercise_instance_id") REFERENCES "public"."exercise_instances"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "notes_exercice"
    ADD CONSTRAINT "notes_exercice_exercise_id_exercises_id_fk"
    FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

-- Une note par personne et par objet, remplacée quand on la réécrit. Deux index
-- partiels plutôt qu'un seul : `NULL` n'entre pas dans une contrainte d'unicité
-- composite, et sans eux la même personne pourrait empiler dix notes sur le
-- même banc.
CREATE UNIQUE INDEX IF NOT EXISTS "notes_exercice_par_instance_unique"
  ON "notes_exercice" ("user_id", "exercise_instance_id")
  WHERE "exercise_instance_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notes_exercice_par_exercice_unique"
  ON "notes_exercice" ("user_id", "exercise_id")
  WHERE "exercise_id" IS NOT NULL;
