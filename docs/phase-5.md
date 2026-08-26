> **ARCHIVE — document d'intention, pas état du code.**
> Ce document décrit ce qui était *prévu* lors de cette phase. Plusieurs éléments
> annoncés comme livrés sont en réalité du code mort ou des placeholders.
> La source de vérité est le code, et les limites connues sont listées dans le README.

---

# Phase 5 — Automatisation + Mode Live SOS

## Objectif de la phase

Ajouter les automatisations planifiées (debrief hebdo, pré-calcul séance) et le mode live SOS en séance (machine occupée, douleur, énergie, temps dépassé) avec logging d'incidents.

## Pré-requis

- Phase 4 validée (auth, coach IA fonctionnel, debrief post-séance)
- Clé API LLM configurée dans `.env.local`
- Tables `coach_conversations` et `coach_messages` créées

---

## Étapes

### Étape 1 — Table SessionIncident + schéma Drizzle

**Objectif** : Créer la table pour logger les incidents survenant pendant une séance.

#### Sous-étape 1.1 — Schéma Drizzle SessionIncident

**Mission** : Ajouter la table `session_incidents` au schéma Drizzle existant.

**Fichiers à créer/modifier** :
- `src/db/schema.ts` (ajouter la table)

**Détail technique** :

Table `session_incidents` :
| Champ | Type | Contraintes |
|---|---|---|
| `id` | uuid | PK, default gen |
| `session_log_id` | uuid | FK → session_logs.id, NOT NULL |
| `type` | text enum | `machine_occupee`, `douleur`, `energie_chute`, `temps_depasse` |
| `contexte` | jsonb | Détails spécifiques au type (voir sous-étape 1.2) |
| `decision` | text | Ce que l'app/l'utilisateur a décidé (ex: "substitution lat pulldown", "skip exercice", "stop séance") |
| `impact_programme` | text, nullable | Impact noté sur le programme (ex: "leg extension skippé, rattrapage séance C") |
| `created_at` | timestamp | default now |

Relations Drizzle : `session_incidents` → `session_logs` (many-to-one).

#### Sous-étape 1.2 — Structures jsonb par type d'incident

Le champ `contexte` a une structure différente selon le `type` :

**`machine_occupee`** :
```
{
  exercise_instance_id: string,    // l'instance occupée
  substitute_instance_id: string,  // l'instance choisie en remplacement
  substitute_exercise_name: string // nom lisible pour le log
}
```

**`douleur`** :
```
{
  zone: string,         // muscle ou zone corporelle (ex: "épaule droite", "bas du dos")
  niveau: number,       // 1-10
  type_douleur: string, // "sourde" | "aigue" | "irradiation" | "raideur"
  action: string        // "stop_seance" | "skip_zone" | "alleger"
}
```

**`energie_chute`** :
```
{
  energie_actuelle: number,    // 1-10
  exercices_restants: number,  // combien restaient
  exercices_coupes: string[]   // noms des exos skippés
}
```

**`temps_depasse`** :
```
{
  duree_actuelle_min: number,
  duree_cible_min: number,
  exercices_coupes: string[]
}
```

#### Sous-étape 1.3 — Migration

**Mission** : Pousser le schéma vers Supabase.

**Commande** : `npx drizzle-kit push`

Ajouter aussi une politique RLS pour `session_incidents` : l'utilisateur ne peut lire/écrire que les incidents de ses propres sessions. La jointure se fait via `session_logs.user_id`. Ajouter le SQL dans `supabase/migrations/002_rls_incidents.sql` (à exécuter manuellement dans le SQL Editor Supabase comme pour la migration 001).

**Check fonctionnel étape 1** :
- [ ] La table `session_incidents` existe en base avec tous les champs
- [ ] Le type TypeScript est exporté et disponible dans le schéma Drizzle
- [ ] La politique RLS est en place

---

### Étape 2 — API route incidents

**Objectif** : CRUD pour les incidents de séance.

**Fichiers à créer** :
- `src/app/api/incidents/route.ts`

**Détail technique** :

**POST `/api/incidents`** :
- Body : `{ session_log_id, type, contexte, decision, impact_programme? }`
- Validation Zod : vérifier que `type` est dans l'enum, que `session_log_id` appartient bien à l'utilisateur authentifié (jointure session_logs → user_id)
- Retourne l'incident créé

**GET `/api/incidents?session_id=xxx`** :
- Retourne tous les incidents d'une session donnée, triés par `created_at` ASC
- Vérifier que la session appartient à l'utilisateur authentifié

**Check fonctionnel étape 2** :
- [ ] POST avec un body valide crée un incident en base
- [ ] POST avec un `session_log_id` d'un autre utilisateur → 403
- [ ] GET retourne les incidents d'une session

---

### Étape 3 — Workflows SOS déterministes (logique métier)

**Objectif** : Implémenter les 4 workflows SOS comme fonctions métier pures, réutilisables par l'UI et par le coach IA.

**Fichiers à créer** :
- `src/lib/sos/machine-occupee.ts`
- `src/lib/sos/douleur.ts`
- `src/lib/sos/energie-chute.ts`
- `src/lib/sos/temps-depasse.ts`
- `src/lib/sos/index.ts` (barrel export)

#### Sous-étape 3.1 — Machine occupée

**Fichier** : `src/lib/sos/machine-occupee.ts`

**Mission** : Étant donné une `exercise_instance_id` (l'exo occupé) et un `gym_id`, retourner une liste ordonnée de substituts possibles.

**Logique de filtrage** (les critères sont cumulatifs, dans cet ordre de priorité) :
1. Même `pilier` que l'exercice de base
2. Même `profil_tension` que l'exercice de base (stretch/contract/mi_range)
3. Instance disponible dans la même salle (`gym_id`)
4. Pas déjà présent dans le template de la séance en cours (éviter les doublons)
5. Compatible avec les courbatures du jour : si le `DailyState` du jour contient des courbatures ≥ 7/10 sur un muscle, exclure les exercices dont `muscles_principaux` contient ce muscle

**Paramètres d'entrée** : `exercise_instance_id`, `gym_id`, `seance_template_id`, `daily_state_id` (nullable)
**Retour** : tableau de `{ exercise_instance_id, exercise_name, machine_nom, raison_compatibilite }`, max 3 résultats

Si aucun substitut ne satisfait tous les critères, relâcher d'abord le critère 2 (profil de tension), puis le critère 5 (courbatures). Ne jamais relâcher le critère 1 (pilier).

#### Sous-étape 3.2 — Douleur subite

**Fichier** : `src/lib/sos/douleur.ts`

**Mission** : Étant donné une zone, un niveau (1-10) et un type de douleur, retourner la décision à appliquer + les exercices impactés dans la séance en cours.

**Logique en cascade** (déterministe, pas d'IA) :
- Niveau ≥ 7 OU type = `"aigue"` OU type = `"irradiation"` → action `"stop_seance"`, message : "Douleur sévère. Arrête la séance et consulte si ça persiste."
- Niveau 4-6 → action `"skip_zone"`. Identifier tous les exercices restants dans la séance dont `muscles_principaux` contient la zone déclarée → les marquer comme skippés. Message : "Exercices sur [zone] retirés de la séance."
- Niveau 1-3 → action `"alleger"`. Même identification, mais au lieu de skip, réduire le RPE cible de 2 points et ajouter une note "douleur légère — surveiller". Message : "RPE réduit sur [X exos]. Si ça empire, arrête."

**Paramètres** : `zone` (string libre), `niveau` (1-10), `type_douleur` (enum), `exercices_restants` (tableau d'exercices de la séance avec leurs muscles_principaux et statut en_cours/à_venir)
**Retour** : `{ action, message, exercices_impactes: [{ exercise_instance_id, impact: "skip" | "alleger" }] }`

Le matching zone ↔ muscles_principaux est approximatif : comparer en lowercase et vérifier si la zone est contenue dans un des muscles_principaux ou vice-versa (ex: "épaule" match "deltoïde antérieur", "bas du dos" match "lombaires", "genou" match "quadriceps" et "ischios"). Stocker cette table de correspondance dans un objet constant dans le même fichier.

#### Sous-étape 3.3 — Énergie qui chute

**Fichier** : `src/lib/sos/energie-chute.ts`

**Mission** : Étant donné l'énergie actuelle et les exercices restants, retourner quels exercices garder et lesquels couper.

**Logique** :
- Énergie ≤ 3/10 → proposer d'arrêter la séance (mais ne pas forcer). Si l'utilisateur continue, appliquer les mêmes règles que énergie 4-6.
- Énergie 4-6/10 → garder tous les exercices piliers (catégorie_rôle = `"pilier"`), skipper tous les accessoires (catégorie_rôle = `"accessoire"`), réduire RPE cible de 1 sur les substituts.
- Énergie 7+/10 → ne rien changer (ce workflow ne devrait pas être déclenché).

**Paramètres** : `energie` (1-10), `exercices_restants` (avec catégorie_rôle, statut)
**Retour** : `{ suggestion: "stop" | "alleger" | "rien", message, exercices_coupes: string[], rpe_reduit_sur: string[] }`

#### Sous-étape 3.4 — Temps dépassé

**Fichier** : `src/lib/sos/temps-depasse.ts`

**Mission** : Étant donné la durée actuelle, la durée cible (60 min par défaut, ou 50 min si jeûne dans le DailyState) et les exercices restants, proposer des coupes.

**Logique** :
- Estimer le temps restant : chaque exercice restant ≈ `(nombre_series × (temps_serie + repos_secondes))`. `temps_serie` estimé à 45 secondes.
- Si temps estimé restant > temps disponible (durée cible - durée actuelle) :
  - Couper d'abord les accessoires (`catégorie_rôle = "accessoire"`) en commençant par le dernier dans l'ordre du template
  - Si encore trop long, couper le core/gainage
  - Ne jamais couper les piliers
- Retourner la liste des exercices coupés et le temps estimé après coupe

**Paramètres** : `duree_actuelle_min` (number), `duree_cible_min` (number), `exercices_restants` (avec séries, repos, catégorie_rôle, ordre)
**Retour** : `{ exercices_coupes: string[], temps_estime_apres_coupe_min: number, message }`

**Check fonctionnel étape 3** :
- [ ] `machine-occupee` avec un exo P1 stretch retourne des substituts P1 stretch de la même salle
- [ ] `douleur` niveau 8 retourne action `"stop_seance"`
- [ ] `douleur` niveau 5 zone "épaule" skip les exos épaules restants
- [ ] `energie-chute` énergie 4 garde les piliers et coupe les accessoires
- [ ] `temps-depasse` avec 15 min restantes et 4 exos propose des coupes logiques

---

### Étape 4 — Interface SOS en séance live

**Objectif** : Ajouter les 4 boutons SOS dans l'écran de séance en cours, avec les modals/formulaires associés.

**Fichiers à créer** :
- `src/components/session/SOSBar.tsx`
- `src/components/session/SOSMachineOccupee.tsx`
- `src/components/session/SOSDouleur.tsx`
- `src/components/session/SOSEnergie.tsx`
- `src/components/session/SOSTempsDepasse.tsx`
- `src/components/session/SOSResultat.tsx`

**Fichiers à modifier** :
- `src/app/(app)/sessions/new/[templateId]/page.tsx` (la page de séance live) — intégrer `SOSBar`

#### Sous-étape 4.1 — Barre SOS

**Fichier** : `src/components/session/SOSBar.tsx`

**Mission** : Barre fixe en haut de l'écran de séance (sous le header existant), avec 4 boutons icône + label court. La barre ne s'affiche QUE quand une séance est en cours.

Disposition : 4 boutons en ligne, taille minimum 48×48px, espacement régulier. Chaque bouton ouvre un modal/sheet dédié.

| Bouton | Label | Icône suggerée |
|---|---|---|
| Machine occupée | "Occupée" | 🔄 ou icône de remplacement |
| Douleur | "Douleur" | ⚠️ ou icône warning |
| Énergie | "Énergie ↓" | 🔋 ou icône batterie |
| Temps | "Temps ↑" | ⏱ ou icône horloge |

Style : fond sombre semi-transparent, coins arrondis, look "urgence" mais pas anxiogène. Thème sombre cohérent avec le reste de l'app.

#### Sous-étape 4.2 — Modal Machine occupée

**Fichier** : `src/components/session/SOSMachineOccupee.tsx`

**Mission** : Modal (sheet bottom sur mobile) qui :
1. Affiche le nom de l'exercice en cours
2. Appelle la fonction `machine-occupee` avec le contexte actuel
3. Affiche les substituts proposés (max 3) avec nom + machine + raison
4. Chaque substitut a un bouton "Utiliser" qui :
   - Remplace l'exercice en cours dans la séance live (côté Zustand)
   - Crée un incident via POST `/api/incidents`
   - Ferme le modal
5. Bouton "Annuler" pour revenir sans changer

Si aucun substitut trouvé → message "Aucun substitut disponible dans cette salle. Tu peux passer à l'exercice suivant."

#### Sous-étape 4.3 — Modal Douleur

**Fichier** : `src/components/session/SOSDouleur.tsx`

**Mission** : Formulaire guidé dans un modal :
1. **Zone** : champ texte libre avec suggestions autocomplete (liste : épaule, bas du dos, genou, poignet, coude, cou, hanche, cheville, quadriceps, ischios, pectoraux, dorsaux). L'utilisateur peut taper autre chose.
2. **Niveau** : slider 1-10 avec labels ("Gêne légère" à 1, "Insupportable" à 10)
3. **Type** : 4 boutons radio — Sourde / Aiguë / Irradiation / Raideur
4. Bouton "Évaluer"

Au clic sur Évaluer :
- Appel de la fonction `douleur` avec les données
- Affichage du résultat dans `SOSResultat` (voir 4.6)
- Si action = `"stop_seance"` → bouton "Terminer la séance" bien visible (redirige vers la page fin de séance)
- Si action = `"skip_zone"` ou `"alleger"` → appliquer les modifications dans le store Zustand de la séance + créer l'incident
- Dans tous les cas → créer l'incident via POST `/api/incidents`

#### Sous-étape 4.4 — Modal Énergie

**Fichier** : `src/components/session/SOSEnergie.tsx`

**Mission** : Formulaire simple :
1. **Énergie actuelle** : slider 1-10
2. Le nombre d'exercices restants est affiché automatiquement (calculé depuis le store)
3. Bouton "Adapter la séance"

Au clic :
- Appel de la fonction `energie-chute`
- Affichage résultat : quels exos sont coupés, quels RPE réduits
- Bouton "Appliquer" → met à jour le store Zustand + crée l'incident
- Si suggestion = "stop" → bouton "Terminer" en plus de "Continuer quand même"

#### Sous-étape 4.5 — Modal Temps dépassé

**Fichier** : `src/components/session/SOSTempsDepasse.tsx`

**Mission** : Pas de formulaire — calcul automatique :
1. Récupère la durée actuelle depuis le chrono de séance
2. Récupère la durée cible (60 min par défaut, 50 si jeûne dans le DailyState du jour)
3. Appelle `temps-depasse` avec les exercices restants
4. Affiche : "Tu es à X min / Y min cible. Proposition : couper [liste]."
5. Bouton "Appliquer les coupes" → store Zustand + incident
6. Bouton "Continuer sans couper"

#### Sous-étape 4.6 — Composant résultat SOS

**Fichier** : `src/components/session/SOSResultat.tsx`

**Mission** : Composant réutilisable par les 4 modals pour afficher le résultat d'un workflow SOS. Affiche :
- Le message principal (texte de la décision)
- La liste des exercices impactés avec l'action (skip/alléger/substituer)
- Les boutons d'action (Appliquer / Annuler / Terminer la séance selon le contexte)

Props : `{ message, exercicesImpactes, actions: { label, onClick, variant }[] }`

**Check fonctionnel étape 4** :
- [ ] Les 4 boutons SOS sont visibles en haut de l'écran de séance live
- [ ] "Occupée" affiche des substituts cohérents et le remplacement fonctionne
- [ ] "Douleur" niveau 8 propose d'arrêter la séance
- [ ] "Douleur" niveau 5 sur "épaule" skip les exos épaules et l'affiche
- [ ] "Énergie ↓" à 4 coupe les accessoires et le montre
- [ ] "Temps ↑" propose des coupes quand la durée cible est dépassée
- [ ] Chaque action crée un incident en base (vérifiable via GET `/api/incidents`)

---

### Étape 5 — Proactivité de l'agent au retour sur l'app

**Objectif** : Quand l'utilisateur revient sur l'app après une longue pause en séance, ou quand un RPE est anormalement élevé, afficher un message proactif du coach.

**Fichiers à créer** :
- `src/lib/coach/proactive-checks.ts`
- `src/components/coach/ProactiveAlert.tsx`

**Fichiers à modifier** :
- `src/app/(app)/sessions/new/[templateId]/page.tsx` — ajouter les vérifications proactives

#### Sous-étape 5.1 — Logique de détection

**Fichier** : `src/lib/coach/proactive-checks.ts`

**Mission** : Fonctions qui vérifient si une alerte proactive est pertinente. Appelées côté client à chaque fois que la page de séance live regagne le focus (événement `visibilitychange`, `document.visibilityState === 'visible'`).

**Checks** :
1. **Pause longue** : si `Date.now() - derniere_action_timestamp > 5 * 60 * 1000` (5 min), retourner `{ type: "pause_longue", minutes_ecoulees }`. La `derniere_action_timestamp` est la date de la dernière validation de série stockée dans le store Zustand.
2. **RPE élevé** : si la dernière série validée a un `RPE_effectif` supérieur à `RPE_cible + 1` (récupérer le RPE cible depuis le template), retourner `{ type: "rpe_eleve", rpe_effectif, rpe_cible, exercice_nom }`.

**Retour** : `null` si rien à signaler, sinon un objet `{ type, ...details }`.

Ne pas déclencher plusieurs alertes consécutives du même type sans qu'une action ait eu lieu entre-temps (stocker dans le store Zustand quel check a déjà été affiché).

#### Sous-étape 5.2 — Composant alerte proactive

**Fichier** : `src/components/coach/ProactiveAlert.tsx`

**Mission** : Bandeau ou toast en haut de l'écran de séance qui affiche un message court :
- Pause longue : "Tu es revenu après X min. Tout va bien ? Tu peux adapter la séance si besoin." + bouton "Voir SOS"
- RPE élevé : "RPE [X] sur [exo] alors que la cible était [Y]. Réduis la charge de X kg ou passe à l'exo suivant." + bouton "Réduire" (qui pré-remplit la charge -1 incrément)

Le bandeau se dismiss au tap ou après 15 secondes. Pas de call LLM ici — messages pré-écrits dans le code, pas besoin de streaming.

**Check fonctionnel étape 5** :
- [ ] Quitter l'app 5+ min pendant une séance puis revenir → bandeau "pause longue" affiché
- [ ] Valider une série avec RPE 9.5 quand la cible est 8 → bandeau RPE élevé affiché
- [ ] Le même check ne se déclenche pas deux fois de suite sans action entre-temps
- [ ] Le bandeau se dismiss au tap

---

### Étape 6 — Cron pré-calcul séance du lendemain

**Objectif** : Chaque soir, pré-générer la séance suggérée pour le lendemain via le LLM, stockée dans une table dédiée.

**Fichiers à créer** :
- `src/app/api/cron/precalc-session/route.ts`
- Table `precalc_sessions` dans le schéma Drizzle

**Fichiers à modifier** :
- `src/db/schema.ts` — ajouter la table
- `src/app/(app)/page.tsx` (dashboard) — afficher la séance pré-calculée si elle existe

#### Sous-étape 6.1 — Table precalc_sessions

Ajouter au schéma Drizzle :

| Champ | Type | Contraintes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → users.id |
| `target_date` | date | La date pour laquelle la séance est pré-calculée |
| `seance_template_id` | uuid, nullable | FK → seance_templates.id (quelle séance est suggérée) |
| `contenu` | text | Le texte généré par le LLM (résumé : séance suggérée, charges, ajustements) |
| `contexte_utilise` | jsonb | Snapshot du contexte injecté dans le prompt (pour debug/audit) |
| `created_at` | timestamp | |

Contrainte unique sur `(user_id, target_date)` — une seule pré-calc par jour par utilisateur.

`npx drizzle-kit push` après modification.

#### Sous-étape 6.2 — Route API cron

**Fichier** : `src/app/api/cron/precalc-session/route.ts`

**Mission** : Route GET protégée par un secret (`CRON_SECRET` en env var, vérifié via header `Authorization: Bearer <secret>`).

**Logique** :
1. Récupérer tous les utilisateurs actifs (qui ont au moins une session dans les 14 derniers jours)
2. Pour chaque utilisateur :
   a. Déterminer la prochaine séance logique : regarder la dernière `SessionLog`, en déduire la prochaine lettre (A→B, B→C, C→A). Si pas de session récente, prendre A.
   b. Charger le contexte complet (même `context-loader.ts` que le coach)
   c. Appeler le LLM avec un prompt spécifique : "Génère un résumé de la séance de demain pour [utilisateur]. Séance [lettre]. Inclus les charges suggérées (double progression), les exercices, et les points d'attention basés sur les dernières séances."
   d. Stocker le résultat dans `precalc_sessions` (upsert sur user_id + target_date)
3. Retourner un JSON résumé `{ processed: N, errors: [] }`

**Note Vercel** : cette route sera appelée par un Vercel Cron Job. La config cron se fait dans `vercel.json` :
```
{
  "crons": [
    { "path": "/api/cron/precalc-session", "schedule": "0 20 * * *" }
  ]
}
```
(20h UTC = 22h heure de Paris)

#### Sous-étape 6.3 — Affichage sur le dashboard

**Mission** : Sur la page dashboard (`src/app/(app)/page.tsx`), dans la card "Prochaine séance", si une `precalc_session` existe pour aujourd'hui, afficher un résumé sous le bouton "Démarrer". Le contenu est le texte généré par le LLM, affiché en markdown simple (gras, listes).

Si pas de pré-calcul disponible, ne rien afficher de plus (comportement actuel inchangé).

**Check fonctionnel étape 6** :
- [ ] `npx drizzle-kit push` crée la table `precalc_sessions`
- [ ] Appel GET `/api/cron/precalc-session` avec le bon header → génère une pré-calc en base
- [ ] Appel sans header ou mauvais secret → 401
- [ ] Le dashboard affiche le résumé pré-calculé quand il existe
- [ ] Appeler le cron deux fois le même jour → upsert (pas de doublon)

---

### Étape 7 — Cron debrief hebdomadaire

**Objectif** : Chaque dimanche soir, générer un debrief de la semaine via le LLM et le stocker.

**Fichiers à créer** :
- `src/app/api/cron/weekly-debrief/route.ts`
- Table `weekly_debriefs` dans le schéma Drizzle

**Fichiers à modifier** :
- `src/db/schema.ts`
- `src/app/(app)/page.tsx` (dashboard) — afficher le dernier debrief

#### Sous-étape 7.1 — Table weekly_debriefs

| Champ | Type | Contraintes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → users.id |
| `week_start` | date | Le lundi de la semaine analysée |
| `week_end` | date | Le dimanche |
| `contenu` | text | Le debrief généré par le LLM |
| `stats` | jsonb | Stats brutes : nb séances, volume total, feux, progressions, incidents |
| `created_at` | timestamp | |

Contrainte unique sur `(user_id, week_start)`.

#### Sous-étape 7.2 — Route API cron

**Fichier** : `src/app/api/cron/weekly-debrief/route.ts`

**Mission** : Même pattern que le pré-calcul (GET protégé par `CRON_SECRET`).

**Logique** :
1. Pour chaque utilisateur actif :
   a. Récupérer toutes les `SessionLog` de la semaine (lundi à dimanche)
   b. Calculer les stats brutes :
      - Nombre de séances réalisées vs cibles (3)
      - Volume total (somme de charge × reps sur toutes les séries)
      - Feux biologiques de la semaine (distribution vert/orange/rouge)
      - Exercices en progression (fourchette avancée ou complétée)
      - Exercices en stagnation (aucune progression sur la semaine)
      - Incidents de la semaine (depuis `session_incidents`)
   c. Injecter les stats + le contexte utilisateur dans un prompt LLM : "Génère un debrief hebdomadaire pour [utilisateur]. Semaine du [date] au [date]. Voici les stats : [stats]. Sois concis, donne 2-3 points positifs, 1-2 points d'attention, et une recommandation pour la semaine prochaine."
   d. Stocker dans `weekly_debriefs` (upsert sur user_id + week_start)

**Config Vercel cron** (ajouter dans `vercel.json`) :
```
{ "path": "/api/cron/weekly-debrief", "schedule": "0 20 * * 0" }
```
(Dimanche 20h UTC = 22h Paris)

#### Sous-étape 7.3 — Affichage sur le dashboard

**Mission** : Ajouter une card "Debrief de la semaine" sur le dashboard. Si un `weekly_debrief` existe pour la semaine en cours ou la semaine précédente (la plus récente), l'afficher. Le contenu est en markdown simple. La card est repliée par défaut (titre + 1 ligne d'aperçu), extensible au tap.

Si aucun debrief n'existe, ne pas afficher la card.

**Check fonctionnel étape 7** :
- [ ] `npx drizzle-kit push` crée la table `weekly_debriefs`
- [ ] Appel GET `/api/cron/weekly-debrief` → génère un debrief avec stats en base
- [ ] Le dashboard affiche la card debrief quand un debrief existe
- [ ] La card se déplie/replie au tap

---

### Étape 8 — Tool `log_incident` pour le coach IA

**Objectif** : Permettre au coach IA de logger un incident via function calling (le tool était listé dans la vision mais pas encore implémenté en phase 4).

**Fichiers à modifier** :
- `src/lib/coach/tools.ts` — ajouter le tool `log_incident`

**Détail technique** :

Ajouter un tool `log_incident` dans la liste des tools du coach :
- **Nom** : `log_incident`
- **Description** : "Logger un incident pendant une séance (machine occupée, douleur, énergie en chute, temps dépassé)"
- **Paramètres** : `session_log_id` (string), `type` (enum), `contexte` (object), `decision` (string), `impact_programme` (string, optionnel)
- **Exécution** : appel POST `/api/incidents` (ou directement insertion Drizzle) avec les mêmes validations

Ce tool permet au coach de logger un incident quand l'utilisateur lui décrit un problème en chat libre, sans passer par les boutons SOS.

**Check fonctionnel étape 8** :
- [ ] Dire au coach "la machine de pec fly est occupée" → le coach utilise `log_incident` et un incident apparaît en base
- [ ] Le coach peut aussi utiliser `get_available_substitutes` (déjà existant) pour proposer des substituts dans la même réponse

---

## Check final de phase

- [ ] Les 4 workflows SOS fonctionnent en séance live sur mobile (boutons visibles, modals fonctionnels, incidents loggés)
- [ ] L'alerte proactive s'affiche après 5 min d'inactivité en séance
- [ ] L'alerte RPE élevé s'affiche quand pertinent
- [ ] Le cron pré-calcul génère une séance pour le lendemain et elle s'affiche sur le dashboard
- [ ] Le cron debrief hebdo génère un résumé et il s'affiche sur le dashboard
- [ ] Le coach IA peut logger des incidents via function calling
- [ ] Les incidents sont visibles en base avec le bon `session_log_id` et le bon `type`
- [ ] Aucune régression sur les phases précédentes (auth, saisie séance, double progression, feu biologique, coach chat)
