-- ---------------------------------------------------------------------------
-- Qui s'entraîne
-- ---------------------------------------------------------------------------
-- `date_naissance` et `taille` existaient déjà, et n'étaient écrites par aucun
-- écran : l'onboarding ne les demandait pas, et le profil ne les proposait pas.
-- Le poids, lui, était DEMANDÉ par le schéma de validation de l'onboarding
-- — `poids: z.number().min(30).max(300).optional()` — puis jeté : la route ne
-- l'écrivait ni dans `users`, ni dans `body_weights`. Aucun écran ne l'envoyait
-- non plus, ce qui explique que personne ne s'en soit aperçu.
--
-- Il manquait le sexe, seule colonne réellement nouvelle ici.
--
-- Trois valeurs, dont « non précisé ». Ce n'est pas une politesse : le moteur
-- doit fonctionner sans, et une colonne à deux valeurs obligatoires forcerait
-- une valeur fausse sur les comptes existants — qui n'ont jamais été
-- interrogés. `NULL` et `non_precise` disent deux choses différentes : jamais
-- demandé, et demandé sans réponse.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "sexe" text;--> statement-breakpoint

-- Le poids ne prend PAS de colonne dans `users`.
--
-- Il en existe déjà une source : `body_weights`, datée, qui porte la courbe et
-- la moyenne mobile. Ajouter `users.poids_actuel` à côté créerait deux endroits
-- où lire le poids du jour, qui divergeraient dès la deuxième pesée — celle
-- saisie depuis l'écran Poids de corps ne mettant pas l'autre à jour. Le poids
-- de l'onboarding devient donc la PREMIÈRE PESÉE, datée du jour.
--
-- Rien à faire ici : `body_weights` existe. Cette section est là pour que la
-- migration porte la raison de ce qui n'a pas été ajouté.
