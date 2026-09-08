-- ---------------------------------------------------------------------------
-- L'ordre des INTENTIONS, qui n'est pas l'ordre des requêtes
-- ---------------------------------------------------------------------------
-- Le lot 17 a fait arriver les séries en base au fil de la séance. L'écriture
-- était atomique — DELETE puis INSERT dans une transaction — et cela suffisait
-- à ne pas créer de doublon sur des appels SÉQUENTIELS. Cela ne dit rien de
-- l'ordre dans lequel les requêtes arrivent.
--
--   t0  la série part à 40 kg, la requête se perd, une reprise est armée
--   t1  l'athlète corrige à 45 kg, cette requête-là aboutit
--   t2  la reprise de t0 aboutit enfin
--
-- La base revenait à 40. Même chose pour une suppression : un vieux POST en
-- reprise ressuscitait une série décochée. Ce n'est pas un cas rare — c'est
-- exactement ce que produit un réseau de sous-sol, qui est le réseau de la
-- salle de sport.
--
-- CE QUE CETTE TABLE APPORTE
--
-- Une RÉVISION par clé logique de série, décidée par le client au moment de
-- l'intention et transportée telle quelle par les reprises. Le serveur refuse
-- toute écriture dont la révision n'est pas strictement supérieure à celle
-- déjà enregistrée. Une reprise ancienne devient donc inoffensive : elle porte
-- la révision de son intention d'origine, pas celle de son arrivée.
--
-- `supprime` est la pierre tombale. Sans elle, effacer la ligne de `set_logs`
-- effacerait aussi la mémoire de la suppression, et le prochain POST retardé
-- n'aurait plus rien à quoi se comparer.
--
-- LA CONTRAINTE D'UNICITÉ FAIT LE RESTE. Deux requêtes concurrentes sur la
-- même clé se sérialisent sur cette ligne : la première la crée ou la
-- verrouille, la seconde attend puis compare sa révision. C'est ce qui manquait
-- — deux transactions DELETE+INSERT parallèles n'ont jamais eu de point de
-- rendez-vous.
--
-- POURQUOI UNE TABLE À PART, ET PAS DEUX COLONNES SUR `set_logs`
--
-- `set_logs` est lue par une douzaine de chemins — progression, bilan, coach,
-- export, débriefs. Y ajouter une suppression logique aurait obligé chacun à
-- filtrer, et le premier oubli aurait compté une série effacée dans un volume.
-- Ici, `set_logs` garde exactement le sens qu'elle a toujours eu : une ligne
-- présente est une série réalisée.
--
-- BACKWARD COMPATIBLE. Table nouvelle, aucune colonne modifiée, aucune ligne
-- réécrite. Une séance dont aucune série n'a de révision — tout l'historique —
-- se comporte comme avant : la première écriture crée sa révision et part de
-- là. La clôture (`terminerSeance`) continue de réécrire la liste complète
-- sans consulter cette table : c'est l'état final du brouillon qui fait foi.
CREATE TABLE IF NOT EXISTS "set_log_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_log_id" uuid NOT NULL REFERENCES "session_logs"("id") ON DELETE CASCADE,
  "exercise_instance_id" uuid NOT NULL REFERENCES "exercise_instances"("id"),
  "numero_serie" integer NOT NULL,
  -- Horloge du client au moment de l'intention. `bigint` : des millisecondes
  -- depuis 1970 débordent un `integer` depuis 1970 + 24 jours.
  "revision" bigint NOT NULL,
  -- La pierre tombale : cette clé a été supprimée à cette révision.
  "supprime" boolean NOT NULL DEFAULT false,
  "updated_at" timestamp DEFAULT now()
);--> statement-breakpoint

-- Le point de rendez-vous des écritures concurrentes, et la clé logique d'une
-- série : une séance, une entrée d'exercice, un numéro.
CREATE UNIQUE INDEX IF NOT EXISTS "set_log_revisions_cle_unique"
  ON "set_log_revisions" ("session_log_id", "exercise_instance_id", "numero_serie");
