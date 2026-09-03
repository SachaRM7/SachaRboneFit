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
  ON "session_debriefs" ("session_log_id");
