-- ---------------------------------------------------------------------------
-- Le débrief d'une séance se garde
-- ---------------------------------------------------------------------------
-- Il n'était conservé nulle part. Chaque ouverture de la fiche d'une séance —
-- y compris une séance vieille de six mois, consultée pour vérifier une charge
-- — relançait une génération complète : un appel au modèle, une conversation
-- de coach créée, deux messages écrits. Consulter son historique coûtait donc
-- un appel modèle par consultation, indéfiniment.
--
-- Et rien de tout cela ne s'affichait. Le composant lisait la réponse comme un
-- flux d'événements (`data: …`), alors que la route du coach répond en JSON :
-- le texte accumulé restait vide, le chargement se terminait, et l'écran
-- rendait un cadre titré sans contenu. Le coût était payé à chaque fois, le
-- résultat jamais montré.
--
-- La sémantique devient celle d'un fait daté : la séance se clôt, le débrief
-- est généré une fois, il est conservé, et les consultations suivantes le
-- LISENT. Régénérer reste possible, mais comme une action demandée — jamais
-- comme l'effet de bord d'une lecture.
--
-- La table est distincte de `weekly_debriefs`, qui porte une semaine et ses
-- statistiques agrégées : ce n'est ni la même clé, ni le même contenu.
CREATE TABLE IF NOT EXISTS "session_debriefs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  -- La séance est la clé : un débrief par séance, remplacé s'il est régénéré.
  -- ON DELETE CASCADE parce qu'un débrief n'a aucun sens sans elle — et que
  -- la réinitialisation d'un compte supprime les séances.
  "session_log_id" uuid NOT NULL REFERENCES "session_logs"("id") ON DELETE CASCADE,
  "contenu" text NOT NULL,
  "genere_le" timestamp DEFAULT now() NOT NULL,
  -- Quel modèle a écrit ce texte. Sans cette trace, un débrief ancien et un
  -- débrief récent se ressemblent, alors qu'ils n'ont pas été produits par la
  -- même chose — et on ne peut pas savoir ce qu'il faudrait régénérer après un
  -- changement de modèle.
  "modele" text,
  -- Empreinte des séries qui ont servi de source. Elle ne sert à rien
  -- automatiquement : elle permet de CONSTATER qu'un débrief ne décrit plus
  -- l'état de la séance — par exemple après correction d'une charge. Rien
  -- n'est régénéré tout seul sur cette base.
  "empreinte_source" text,
  "created_at" timestamp DEFAULT now()
);--> statement-breakpoint

-- Un seul débrief par séance : la régénération remplace, elle n'empile pas.
CREATE UNIQUE INDEX IF NOT EXISTS "session_debrief_unique"
  ON "session_debriefs" ("session_log_id");--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Cette table portait un défaut d'omission : elle était créée sans RLS, et
-- c'est Supabase qui l'a signalé au moment de l'appliquer. Un débrief contient
-- le récit d'une séance — charges, ressenti, note personnelle : exactement ce
-- que le reste du modèle protège.
--
-- La protection est reproduite ici À L'IDENTIQUE de ce qui a été appliqué en
-- production, pour que le repo cesse d'être en retard sur elle. C'est le sens
-- de cette section : sans elle, une base reconstruite depuis les migrations
-- serait ouverte là où la production est fermée, et le fossé ne se verrait
-- qu'au moment où il compte.
--
-- Le serveur applicatif n'est pas concerné : il se connecte avec un rôle qui
-- contourne la RLS (`rolbypassrls`), et son isolation vient de ses propres
-- filtres `user_id`. La RLS est la SECONDE barrière — celle qui tient si un
-- filtre applicatif est oublié un jour, et celle qui protège les accès directs
-- à la base.
ALTER TABLE "session_debriefs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

/*
 * `auth.uid()` hors de Supabase.
 *
 * La policy en dépend, et cette fonction n'existe QUE dans une base Supabase.
 * Sans ce filet, rejouer les migrations sur un Postgres nu — ce que font les
 * tests d'intégration et toute vérification de schéma — échouerait sur
 * « function auth.uid() does not exist », et la RLS ne serait jamais vérifiée
 * ailleurs qu'en production.
 *
 * Le garde porte sur la FONCTION, pas sur le schéma : en Supabase elle existe,
 * et ce bloc ne fait donc strictement rien. Il ne remplace jamais celle de
 * Supabase — pas de `CREATE OR REPLACE`, qui écraserait la vraie.
 *
 * La définition reprend la sémantique de l'originale : l'identifiant lu dans
 * les revendications du jeton. C'est ce qui permet au test de RLS d'exercer
 * la vraie policy plutôt que d'en recopier la condition.
 *
 * L'ORDRE des opérations n'est pas un détail. La chaîne vide est neutralisée
 * AVANT le transtypage, comme le fait l'originale : caster d'abord ferait
 * lever « invalid input syntax for type json » sur une session sans identité,
 * au lieu de rendre NULL. Une policy qui lève au lieu de filtrer ne protège
 * pas — elle casse. Écrit dans le mauvais ordre au premier essai, et c'est le
 * test de RLS qui l'a montré.
 */
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    CREATE SCHEMA IF NOT EXISTS auth;
    EXECUTE $fn$
      CREATE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE
      AS 'SELECT (nullif(current_setting(''request.jwt.claims'', true), '''')::json ->> ''sub'')::uuid';
    $fn$;
  END IF;
END
$$;--> statement-breakpoint

/*
 * La policy, dans un bloc conditionnel.
 *
 * `CREATE POLICY` n'accepte pas `IF NOT EXISTS` avant PostgreSQL 17 : écrite
 * telle quelle, elle ferait échouer tout rejeu de cette migration. Le reste du
 * fichier étant idempotent, c'est la seule instruction qui aurait cassé la
 * propriété — et elle ne l'aurait cassée qu'au deuxième passage, c'est-à-dire
 * au pire moment.
 */
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'session_debriefs'
      AND policyname = 'session_debriefs_all_own'
  ) THEN
    CREATE POLICY "session_debriefs_all_own"
      ON "session_debriefs"
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;
