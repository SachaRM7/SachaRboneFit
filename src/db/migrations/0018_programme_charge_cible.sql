-- ---------------------------------------------------------------------------
-- La charge PROGRAMMEE, et la difference entre « choisi » et « par defaut »
-- ---------------------------------------------------------------------------
-- `exercise_in_template` ne portait aucune charge. Une ligne de programme
-- disait combien de series, quelle fourchette de repetitions, quel effort et
-- quel repos — jamais « avec combien de kilos ». L'application demandait donc
-- de choisir une charge a chaque premiere seance, alors que l'utilisateur
-- savait deja, au moment ou il programmait sa seance, sur quel poids il
-- comptait la faire.
--
-- CHARGE_CIBLE EST NULLABLE, ET LE RESTE. `NULL` veut dire « rien n'a ete
-- programme », jamais « 0 kg ». Un nombre est une INTENTION declaree, pas une
-- mesure : il n'entre dans aucun moteur de progression. La double progression
-- continue de lire `set_logs`, et des qu'une serie existe sur l'appareil, c'est
-- elle qui fait reference — la charge programmee ne fait que remplir le premier
-- repere affichable quand l'historique est vide. C'est exactement pour ca que
-- cette colonne ne peut pas etre NOT NULL avec un defaut numerique : un 0 ecrit
-- par defaut s'afficherait comme une charge.
--
-- POURQUOI UNE VALEUR PAR DEFAUT EXISTE AILLEURS SUR CETTE TABLE
--
-- `series_cibles`, `fourchette_reps_min` et `fourchette_reps_max` sont NOT NULL.
-- Elles le restent : le calcul de volume en series et la double progression
-- consomment un nombre, et rendre ces colonnes nullables obligerait chaque
-- lecture du moteur a gerer une absence — plusieurs modules, un risque de
-- divergence, pour un gain nul. Une ligne de programme creee sans ces
-- informations recoit donc les valeurs par defaut historiques de l'application
-- (3 series, 8 a 12 repetitions), ECRITES au moment de la creation. Le repos
-- reste nullable ; le Live utilise son repli historique de 120 s tant que
-- personne ne l'a choisi.
--
-- Mais un defaut ecrit ne doit pas se faire passer pour une prescription.
-- `prescription_par_defaut` conserve la LISTE des champs que personne n'a
-- choisis. L'ecran peut alors demander de les confirmer au lieu de presenter
-- « 3 x 8-12 » comme une decision de l'utilisateur. La liste se vide au fur et
-- a mesure que les champs sont renseignes.
--
-- NULLABLE ET SANS DEFAUT : les lignes existantes n'ont rien a declarer, et
-- aucune n'est reecrite. `NULL` et `[]` veulent tous deux dire « rien a
-- confirmer » ; le code lit les deux de la meme facon.
--
-- `session_plan_items` recoit les DEUX MEMES COLONNES. Ce n'est pas une
-- duplication de confort : cette table est la DECISION prise pour la seance du
-- jour, et elle porte deja sa propre copie de la prescription (series,
-- fourchette, effort, tempo, repos). Lire la charge programmee sur le gabarit
-- courant ferait changer une seance deja construite quand l'utilisateur
-- modifie son programme, et un exercice retire (`archive_le`) priverait le
-- plan en cours de son premier repere. Les deux colonnes y sont donc
-- NULLABLES, sans defaut ni reecriture des lignes existantes.
ALTER TABLE "exercise_in_template"
  ADD COLUMN IF NOT EXISTS "charge_cible" real;--> statement-breakpoint

ALTER TABLE "exercise_in_template"
  ADD COLUMN IF NOT EXISTS "prescription_par_defaut" jsonb;--> statement-breakpoint

ALTER TABLE "session_plan_items"
  ADD COLUMN IF NOT EXISTS "charge_cible" real;--> statement-breakpoint

ALTER TABLE "session_plan_items"
  ADD COLUMN IF NOT EXISTS "prescription_par_defaut" jsonb;
