-- L'ordre des INTENTIONS, pas l'ordre des paquets.
--
-- La feuille d'exécution enregistre toute seule, sans bouton. Deux modifications
-- rapprochées produisent donc deux requêtes concurrentes, et rien jusqu'ici ne
-- disait laquelle des deux l'utilisateur avait voulue en dernier : le serveur
-- appliquait celle qui arrivait en dernier. Or l'ordre d'ARRIVÉE n'est pas
-- l'ordre d'INTENTION — c'est l'ordre du réseau.
--
-- Reproduit sur base réelle avant correction :
--
--   note « A » puis note « B », B appliqué le premier -> la base finit sur A
--   siège 8 puis siège 6, 8 appliqué le dernier       -> la base finit sur 8
--   deux premières écritures simultanées              -> 20/20 en violation
--                                                        d'unicité, donc 500
--
-- Le remède tient en une colonne. Chaque écriture porte l'instant où
-- l'utilisateur a formé son intention, horodaté chez lui et strictement
-- croissant. La ligne ne bouge que si l'intention entrante est plus récente que
-- celle déjà en base. Une requête tardive et périmée ne devient alors plus
-- qu'une écriture sans effet.
--
-- Le comparateur vit dans la base, pas dans React : un jeton en mémoire de
-- l'onglet ne protège pas PostgreSQL, et un verrou qui ignore l'ordre
-- d'intention se contenterait de sérialiser proprement les écritures dans le
-- mauvais ordre.

-- `bigint` parce que c'est un instant en millisecondes depuis 1970, et que
-- `integer` déborde en 1970 + 24 jours. DEFAULT 0 : toute ligne déjà écrite est
-- réputée plus ancienne que n'importe quelle intention à venir, donc la
-- première écriture après migration gagne — ce qui est le comportement voulu.
ALTER TABLE "notes_exercice"
  ADD COLUMN IF NOT EXISTS "intention" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages_personnels"
  ADD COLUMN IF NOT EXISTS "intention" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Effacer devient une écriture comme une autre
-- ---------------------------------------------------------------------------
-- Effacer par DELETE détruisait le repère : la ligne partie, plus rien ne
-- retenait l'intention la plus récente, et une requête ancienne arrivée après
-- coup réinsérait la note qu'on venait de vider. Le vide est donc désormais une
-- VALEUR — la chaîne vide — et il se compare comme les autres.
--
-- Les lectures traduisent cette chaîne vide en « pas de valeur » ; rien ne
-- remonte jusqu'à l'écran. Aucune ligne existante n'est concernée : jusqu'ici
-- les valeurs vides étaient supprimées, il n'y en a donc aucune en base.
--
-- Rien à faire ici : aucune contrainte n'interdit la chaîne vide, les deux
-- colonnes sont simplement `text NOT NULL`. Le changement est dans le service,
-- et cette section existe pour que la migration porte la raison.
