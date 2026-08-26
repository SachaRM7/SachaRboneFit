> **ARCHIVE — document d'intention, pas état du code.**
> Ce document décrit ce qui était *prévu* lors de cette phase. Plusieurs éléments
> annoncés comme livrés sont en réalité du code mort ou des placeholders.
> La source de vérité est le code, et les limites connues sont listées dans le README.

---

# Phase 4 — Authentification Supabase + Agent IA Coach

## Objectif de la phase

Sécuriser l'app avec une vraie authentification (login, RLS, user_id dynamique) puis ajouter la couche conversationnelle du coach IA par-dessus la logique déterministe existante.

**Prérequis** : Phase 3 terminée — timer de repos, persistance séance, graphiques, export, offline, UX polish.

**Report Phase 3 inclus** : l'étape 1 couvre l'intégralité de l'authentification Supabase (login/register, middleware, RLS, user_id dynamique dans les routes API) qui n'a pas été implémentée en Phase 3.

---

## Étapes

### Étape 1 — Configuration Supabase Auth (toi, manuellement)

**Objectif** : configurer Supabase pour que l'auth fonctionne. Cette étape est faite PAR TOI dans le dashboard Supabase, pas par l'agent de coding.

#### Sous-étape 1.1 — Activer l'authentification email/password dans Supabase

**Mission** : toi (Sacha), tu fais ces étapes manuellement dans le navigateur.

1. Aller sur https://supabase.com/dashboard
2. Sélectionner ton projet
3. Menu gauche → **Authentication** → **Providers**
4. Trouver **Email** dans la liste → cliquer dessus
5. Activer **Enable Email provider** (toggle ON)
6. **Désactiver "Confirm email"** (toggle OFF) — on ne veut pas de confirmation par email pour le MVP, c'est toi le seul utilisateur
7. **Désactiver "Secure email change"** (toggle OFF) — pas nécessaire pour le MVP
8. Sauvegarder

#### Sous-étape 1.2 — Récupérer les variables d'environnement

**Mission** : toi, dans le dashboard Supabase.

1. Menu gauche → **Settings** → **API**
2. Copier les valeurs suivantes :
   - **Project URL** : c'est `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** (sous "Project API keys") : c'est `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** (sous "Project API keys", cliquer "Reveal") : c'est `SUPABASE_SERVICE_ROLE_KEY`

3. Ouvrir le fichier `.env.local` à la racine du projet et vérifier que ces 3 variables sont présentes :

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
```

Si elles y sont déjà (probable depuis la Phase 1), vérifier qu'elles sont correctes. Si `.env.local` n'existe pas, le créer à partir de `.env.example`.

#### Sous-étape 1.3 — Créer ton compte utilisateur manuellement

**Mission** : toi, dans le dashboard Supabase.

1. Menu gauche → **Authentication** → **Users**
2. Bouton **"Add user"** → **"Create new user"**
3. Remplir :
   - Email : ton adresse email
   - Password : ton mot de passe
   - Cocher **"Auto Confirm User"**
4. Cliquer "Create user"
5. **Copier l'UUID** qui apparaît dans la colonne "UID" de l'utilisateur créé — tu en auras besoin à l'étape 2

**Note** : cet UUID deviendra le `user_id` utilisé partout dans l'app. Il remplacera l'ID hardcodé actuel.

**Check fonctionnel étape 1** :
- [ ] Dans Supabase dashboard → Authentication → Providers → Email est activé, Confirm email est OFF
- [ ] `.env.local` contient les 3 variables Supabase (URL, anon key, service role key)
- [ ] Un utilisateur existe dans Authentication → Users avec un UUID visible

---

### Étape 2 — Mise à jour du seed et du user_id

**Objectif** : aligner le user existant en base avec le compte Supabase Auth créé à l'étape 1.

#### Sous-étape 2.1 — Mettre à jour le seed pour utiliser l'UUID Supabase

**Mission** : Le script de seed crée actuellement un user avec un ID généré (probablement un UUID random ou un ID séquentiel). Il faut que le seed utilise l'UUID du compte Supabase Auth créé à l'étape 1.3.

**Fichier à modifier** : le script de seed (probablement `src/lib/seed.ts` ou `scripts/seed.ts`)

**Changement** : ajouter une variable d'environnement `SEED_USER_ID` dans `.env.local` avec l'UUID copié à l'étape 1.3. Le seed doit lire cette variable et l'utiliser comme `id` pour le user Sacha. Si la variable n'est pas définie, garder le comportement actuel (UUID random) pour ne pas casser le dev.

**Fichier à modifier** : `.env.local` — ajouter :
```
SEED_USER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

#### Sous-étape 2.2 — Re-seeder la base

**Mission** : relancer le seed pour que le user en base ait le bon UUID.

**Commandes** :
1. `npx drizzle-kit push` (s'assurer que le schéma est à jour)
2. `npm run seed` (relancer le seed — il doit d'abord vider les tables ou faire un upsert)

**Point d'attention** : si le seed ne vide pas les tables avant d'insérer, il faut le modifier pour faire un `DELETE FROM` sur toutes les tables dans l'ordre inverse des FK, puis re-seeder. Sinon les anciennes données avec l'ancien user_id resteront et ne seront pas accessibles via RLS.

**Check fonctionnel étape 2** :
- [ ] Après le seed, la table `user` contient un user dont l'`id` correspond exactement à l'UUID du compte Supabase Auth
- [ ] Les SessionLogs, DailyStates, BodyWeights ont tous le bon `user_id`

---

### Étape 3 — Pages login/register + middleware + déconnexion

**Objectif** : les pages d'authentification et la protection des routes.

#### Sous-étape 3.1 — Client Supabase navigateur et serveur

**Mission** : créer (ou vérifier/corriger) les helpers de création du client Supabase pour le navigateur et pour les API routes côté serveur.

**Fichiers à créer/vérifier** :
- `src/lib/supabase/client.ts` — client navigateur. Utilise `createBrowserClient` du package `@supabase/ssr`. Ce client est utilisé dans les composants React côté client.
- `src/lib/supabase/server.ts` — client serveur. Utilise `createServerClient` du package `@supabase/ssr` avec les cookies Next.js. Ce client est utilisé dans les API routes et les Server Components.

**Package nécessaire** : `npm install @supabase/ssr @supabase/supabase-js` (si pas déjà installé)

**Le client navigateur** doit être créé avec `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

**Le client serveur** doit être créé avec les mêmes variables + accès aux cookies Next.js (`cookies()` de `next/headers`). Pour les opérations admin (ex : seed), utiliser `SUPABASE_SERVICE_ROLE_KEY` à la place de l'anon key.

#### Sous-étape 3.2 — Middleware Next.js de protection des routes

**Mission** : créer le middleware qui vérifie la session et redirige vers /login si non connecté.

**Fichier à créer** : `src/middleware.ts`

**Comportement** :
- Pour toute requête vers une route sous `/(app)/` (dashboard, sessions, exercises, progression, settings) : vérifier qu'une session Supabase existe. Si non → rediriger vers `/login`
- Pour `/login` et `/register` : si une session existe déjà → rediriger vers `/dashboard`
- Pour les routes API `/api/*` : ne PAS rediriger (les API gèrent elles-mêmes le 401), MAIS rafraîchir le token si nécessaire
- Le middleware doit rafraîchir le token Supabase (via `supabase.auth.getUser()`) à chaque requête pour éviter les expirations silencieuses

**Config matcher** dans `middleware.ts` :
```
export const config = {
  matcher: ['/(app)/:path*', '/login', '/register', '/api/:path*']
}
```

#### Sous-étape 3.3 — Page login

**Fichier à créer** : `src/app/login/page.tsx`

**Contenu** :
- Titre "App Sport Perso" ou logo
- Formulaire : champ email + champ mot de passe + bouton "Se connecter"
- Lien "Pas de compte ? Créer un compte" vers `/register`
- En cas d'erreur (mauvais identifiants) : message rouge sous le formulaire
- En cas de succès : redirection vers `/dashboard`
- Design : thème sombre, centré verticalement, mobile-first

**Authentification** : utiliser `supabase.auth.signInWithPassword({ email, password })` depuis le client navigateur.

#### Sous-étape 3.4 — Page register

**Fichier à créer** : `src/app/register/page.tsx`

**Contenu** :
- Formulaire : champ nom + champ email + champ mot de passe + bouton "Créer mon compte"
- Lien "Déjà un compte ? Se connecter" vers `/login`
- En cas de succès : créer le user dans la table `user` de l'app (via POST `/api/user`) avec l'UUID Supabase Auth, puis rediriger vers `/dashboard`
- En cas d'erreur : message rouge

**Authentification** : utiliser `supabase.auth.signUp({ email, password })`. Après le signUp, récupérer le `user.id` retourné et créer l'entrée correspondante dans la table `user` de l'app (nom, email, id = UUID Supabase).

**Point important** : le signUp Supabase crée le user dans `auth.users` (table interne Supabase). Il faut AUSSI créer le user dans la table `user` de l'app (table Drizzle). Ces deux tables ont le même UUID comme clé.

#### Sous-étape 3.5 — Déconnexion

**Mission** : ajouter un bouton de déconnexion.

**Fichier à modifier** : page paramètres existante (`/settings`)

**Comportement** : bouton "Se déconnecter" qui appelle `supabase.auth.signOut()`, vide le sessionStore Zustand (pour ne pas garder une séance d'un autre user), puis redirige vers `/login`.

**Check fonctionnel étape 3** :
- [ ] Naviguer vers `/dashboard` sans session → redirigé vers `/login`
- [ ] Se connecter avec les identifiants créés à l'étape 1.3 → arrivée sur le dashboard avec les données seedées
- [ ] Se déconnecter → retour au login, `/dashboard` inaccessible
- [ ] Naviguer vers `/login` en étant connecté → redirigé vers `/dashboard`
- [ ] Créer un nouveau compte via `/register` → le user est créé en base (table `user` + Supabase Auth)

---

### Étape 4 — User_id dynamique dans toutes les API routes

**Objectif** : remplacer le user_id hardcodé par le user_id de la session Supabase dans toutes les routes API.

#### Sous-étape 4.1 — Helper d'extraction du user_id

**Mission** : créer un helper réutilisable qui extrait le user_id depuis la session Supabase dans une API route.

**Fichier à créer** : `src/lib/supabase/auth-helper.ts`

**Comportement** : fonction `getAuthenticatedUserId()` qui :
1. Crée un client Supabase serveur
2. Appelle `supabase.auth.getUser()`
3. Si pas de user → throw ou retourne null
4. Si user → retourne `user.id` (UUID string)

**Usage dans chaque route** :
```
const userId = await getAuthenticatedUserId()
if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```

#### Sous-étape 4.2 — Migration de toutes les routes API

**Mission** : remplacer chaque occurrence du user_id hardcodé par l'appel à `getAuthenticatedUserId()` dans TOUTES les routes API.

**Fichiers à modifier** (liste exhaustive à vérifier par l'agent — voici les routes connues) :
- `src/app/api/daily-state/route.ts`
- `src/app/api/sessions/route.ts`
- `src/app/api/sessions/last/route.ts`
- `src/app/api/sessions/tendency/route.ts`
- `src/app/api/set-logs/route.ts`
- `src/app/api/set-logs/last-session/route.ts`
- `src/app/api/alerts/route.ts`
- `src/app/api/dashboard/route.ts`
- `src/app/api/progression/exercise/route.ts`
- `src/app/api/progression/pillar-volume/route.ts`
- `src/app/api/progression/bodyweight/route.ts`
- `src/app/api/progression/feu-heatmap/route.ts`
- `src/app/api/export/route.ts`
- Toute autre route API existante

**Pattern** : dans chaque route, remplacer la ligne qui définit le userId hardcodé (ex : `const userId = "xxx"` ou `const userId = HARDCODED_USER_ID`) par `const userId = await getAuthenticatedUserId()` + guard 401.

**Check fonctionnel étape 4** :
- [ ] Être connecté → toutes les pages et API fonctionnent normalement (pas de régression)
- [ ] Se déconnecter → appeler n'importe quelle route API → retourne 401
- [ ] Vérifier dans le code : aucune occurrence du user_id hardcodé ne reste

---

### Étape 5 — Row Level Security (RLS)

**Objectif** : activer RLS sur toutes les tables pour que même un accès direct à Supabase ne permette pas de lire les données d'un autre user.

#### Sous-étape 5.1 — Toi : identifier le type du champ user_id

**Mission** : avant que l'agent crée la migration RLS, tu dois vérifier le type du champ `user_id` dans le schéma Drizzle.

Ouvrir le fichier de schéma (probablement `src/db/schema.ts` ou `src/lib/db/schema.ts`) et regarder si `user_id` est de type `uuid` ou `text`. L'UUID Supabase Auth est de type `uuid`. Si le schéma utilise `text`, il faudra une migration pour changer le type — l'agent s'en chargera.

#### Sous-étape 5.2 — Migration SQL pour activer RLS

**Mission** : créer une migration SQL qui active RLS et crée les policies.

**Fichier à créer** : `supabase/migrations/XXXX_enable_rls.sql` (ou via `npx drizzle-kit generate` si possible — sinon SQL brut exécuté manuellement dans le SQL Editor de Supabase)

**Tables avec user_id direct** (policy directe) :
- `user` → SELECT/UPDATE : `auth.uid() = id`
- `daily_state` → CRUD : `auth.uid() = user_id`
- `session_log` → CRUD : `auth.uid() = user_id`
- `body_weight` → CRUD : `auth.uid() = user_id`
- `programme_bloc` → CRUD : `auth.uid() = user_id`

**Tables sans user_id direct** :

- `set_log` : chaîné via `session_log`. Deux options pour l'agent :
  - Option A (recommandée) : ajouter un champ `user_id` à `set_log` (dénormalisation), remplir via migration `UPDATE set_log SET user_id = session_log.user_id FROM session_log WHERE set_log.session_log_id = session_log.id`, puis policy directe
  - Option B : policy avec sous-requête `EXISTS (SELECT 1 FROM session_log WHERE session_log.id = set_log.session_log_id AND session_log.user_id = auth.uid())`

- `seance_template` : chaîné via `programme_bloc.user_id`. Même pattern que set_log.
- `exercise_in_template` : chaîné via `seance_template` → `programme_bloc`. Même pattern.

**Tables partagées** (pas de user_id, pas sensibles) :
- `exercise` → policy : `auth.uid() IS NOT NULL` (lecture pour tout utilisateur authentifié)
- `gym` → policy : `auth.uid() IS NOT NULL`
- `exercise_instance` → policy : `auth.uid() IS NOT NULL`

**Comment exécuter la migration** : si Drizzle ne gère pas bien les RLS policies (c'est du DDL Supabase spécifique), l'agent peut :
1. Générer le SQL dans un fichier
2. Tu l'exécutes manuellement dans Supabase Dashboard → SQL Editor → New Query → coller le SQL → Run

L'agent doit fournir le SQL complet prêt à coller, pas juste les principes.

**Check fonctionnel étape 5** :
- [ ] Se connecter avec le compte Sacha → toutes les données visibles
- [ ] Créer un 2e compte (via /register) → dashboard vide, aucune donnée de Sacha visible
- [ ] Revenir sur le compte Sacha → les données sont toujours là
- [ ] Dans Supabase Dashboard → Table Editor → sélectionner `session_log` → "RLS enabled" visible

---

### Étape 6 — Tables coach + schéma de données

**Objectif** : créer les tables pour stocker les conversations du coach.

#### Sous-étape 6.1 — Tables CoachConversation et CoachMessage

**Mission** : ajouter les tables au schéma Drizzle et pousser la migration.

**Fichier à modifier** : le fichier de schéma Drizzle existant

**Table `coach_conversation`** :
- `id` : UUID, primary key, default random
- `user_id` : UUID, FK vers user.id, NOT NULL
- `title` : text, nullable (généré automatiquement après le 1er message)
- `session_log_id` : UUID, FK vers session_log.id, nullable (si la conversation est liée à une séance)
- `created_at` : timestamp, default now
- `updated_at` : timestamp, default now

**Table `coach_message`** :
- `id` : UUID, primary key, default random
- `conversation_id` : UUID, FK vers coach_conversation.id, NOT NULL, CASCADE DELETE
- `role` : text, NOT NULL — valeurs : 'user', 'assistant', 'system'
- `content` : text, NOT NULL
- `tool_calls` : jsonb, nullable — les appels de tools si le message est un assistant avec function calling
- `tool_results` : jsonb, nullable — les résultats des tools
- `created_at` : timestamp, default now

**Commande** : `npx drizzle-kit push` après modification du schéma

**RLS** : ajouter les policies sur ces 2 tables (même pattern : `auth.uid() = user_id` sur conversation, sous-requête via conversation pour message).

**Check fonctionnel étape 6** :
- [ ] Les tables `coach_conversation` et `coach_message` existent dans Supabase
- [ ] `npx drizzle-kit push` passe sans erreur

---

### Étape 7 — Route API `/api/coach/chat` avec streaming

**Objectif** : créer la route backend du coach avec streaming SSE et injection de contexte.

#### Sous-étape 7.1 — Configuration du provider LLM

**Mission** : créer la configuration pour appeler un LLM via API.

**Fichier à créer** : `src/lib/coach/llm-client.ts`

**Comportement** :
- Lire la variable d'environnement `LLM_PROVIDER` (valeurs possibles : `anthropic`, `openai`, `minimax` — défaut `anthropic`)
- Lire la clé API correspondante : `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, ou `MINIMAX_API_KEY`
- Exporter une fonction `callLLM({ messages, tools, system })` qui :
  - Construit la requête dans le format du provider choisi
  - Retourne un stream lisible (ReadableStream)
  - Gère le function calling / tool use selon le format du provider

**Packages nécessaires** : `npm install @anthropic-ai/sdk` (ou `openai` si provider OpenAI, ou les deux pour la flexibilité). L'agent choisit le SDK approprié.

**Note** : pour Anthropic, le modèle à utiliser est `claude-sonnet-4-20250514` (bon compromis coût/qualité pour un coach). Pour OpenAI, `gpt-4o-mini`. Variable d'env `LLM_MODEL` pour override.

#### Sous-étape 7.2 — System prompt du coach

**Mission** : créer le system prompt basé sur `coach-sacha.md`, enrichi avec le contexte dynamique injecté à chaque requête.

**Fichier à créer** : `src/lib/coach/system-prompt.ts`

**Structure du system prompt** :
1. **Partie statique** : le contenu de `coach-sacha.md` (identité, profil athlète, principes de programmation, structure séances, méthode de progression, conventions de charge, comment répondre). Ce texte est inclus tel quel dans le system prompt.
2. **Partie dynamique** (injectée à chaque message) :
   - Date du jour
   - Profil user (nom, poids actuel, phase nutritionnelle, objectif)
   - Bloc en cours (nom, type cycle, semaine actuelle)
   - DailyState du jour (s'il existe)
   - Feu biologique jour + tendance (derniers calculés)
   - 5 dernières SessionLogs avec résumé (date, template, feux, volume ajusté, notes)
   - Alertes actives (fourchettes complétées, stagnation, deload)

**Fonction** : `buildSystemPrompt(context: CoachContext): string` qui assemble les deux parties.

**Fichier à créer** : `src/lib/coach/context-loader.ts` — fonction `loadCoachContext(userId: string): Promise<CoachContext>` qui va chercher toutes les données nécessaires en base (un seul appel ou quelques requêtes parallèles).

#### Sous-étape 7.3 — Définition des tools

**Mission** : définir les tools que le LLM peut appeler.

**Fichier à créer** : `src/lib/coach/tools.ts`

**Tools de lecture** :

| Nom | Paramètres | Description | Source |
|---|---|---|---|
| `get_exercise_history` | `exerciseInstanceId: string, limit?: number` | Retourne les N derniers SetLogs d'une ExerciseInstance avec dates et perfs | Query DB |
| `get_weekly_summary` | `weekOffset?: number` | Volume total par pilier, nombre de séances, feux, pour la semaine donnée (0 = courante) | Query DB + engine |
| `get_current_session` | — | Séance en cours (si active) : exercices, séries faites, séries restantes | sessionStore ou DB |
| `get_available_substitutes` | `exerciseInstanceId: string, gymId: string` | Liste des exercices compatibles (même pilier, même profil tension, même salle) | `findSubstitutes` de `src/lib/engine/substitutions.ts` |
| `suggest_next_sets` | `exerciseInstanceId: string` | Calcul de la prochaine charge/reps via double progression | `computeNextSets` de `src/lib/engine/double-progression.ts` |

**Tools d'écriture** :

| Nom | Paramètres | Description | Source |
|---|---|---|---|
| `log_set` | `sessionLogId, exerciseInstanceId, reps, charge, rpe?, tempo?` | Enregistre une série | Même validation que le POST `/api/set-logs` |
| `end_session` | `sessionLogId, energieFin, notes?` | Clôture la séance | Même logique que le finish |
| `log_incident` | `sessionLogId, type, contexte, decision` | Logger un incident de séance | Insert dans `session_incident` (table Phase 5, mais on peut la créer maintenant) |

**Format des tools** : chaque tool est un objet avec `name`, `description`, `parameters` (JSON Schema), et `execute(params, userId)` qui exécute la logique et retourne le résultat en texte.

#### Sous-étape 7.4 — Route API streaming

**Mission** : créer la route `/api/coach/chat` qui gère le streaming SSE avec function calling.

**Fichier à créer** : `src/app/api/coach/chat/route.ts`

**Endpoint** : `POST /api/coach/chat`

**Body** :
```
{
  conversationId?: string,    // null pour nouvelle conversation
  message: string             // message de l'utilisateur
}
```

**Logique** :
1. Authentifier le user (via `getAuthenticatedUserId`)
2. Si `conversationId` fourni → charger l'historique des messages depuis `coach_message`
3. Si pas de `conversationId` → créer une nouvelle `coach_conversation`
4. Charger le contexte dynamique via `loadCoachContext(userId)`
5. Construire le system prompt via `buildSystemPrompt(context)`
6. Ajouter le message de l'user dans `coach_message` (role: 'user')
7. Appeler le LLM en streaming avec : system prompt, historique, tools
8. **Boucle de tool calling** : si le LLM retourne un tool_use → exécuter le tool → renvoyer le résultat au LLM → continuer jusqu'à obtenir une réponse texte finale. Chaque appel de tool et son résultat sont loggés dans `coach_message` (ou dans le champ `tool_calls`/`tool_results` du message assistant)
9. Sauvegarder le message assistant final dans `coach_message` (role: 'assistant')
10. Streamer la réponse au client via `ReadableStream` + headers SSE

**Format du stream** : Server-Sent Events. Chaque chunk est un event SSE :
- `event: text\ndata: {"content": "..."}\n\n` pour le texte progressif
- `event: tool_call\ndata: {"name": "...", "params": {...}}\n\n` pour informer le client qu'un tool est appelé
- `event: done\ndata: {"conversationId": "..."}\n\n` à la fin

**Check fonctionnel étape 7** :
- [ ] `curl -X POST /api/coach/chat -d '{"message": "Salut coach"}' -H 'Cookie: ...'` → retourne un stream SSE avec une réponse du coach
- [ ] Le coach connaît le profil de Sacha (nom, poids, bloc en cours) sans qu'on le lui dise
- [ ] Demander "Quelles sont mes charges sur le Lying Chest Press ?" → le coach appelle `get_exercise_history` et retourne les données réelles
- [ ] La conversation est persistée en base (tables coach_conversation + coach_message)
- [ ] Sans cookie d'auth → 401

---

### Étape 8 — Interface chat du coach

**Objectif** : créer l'interface mobile du coach accessible depuis toutes les pages.

#### Sous-étape 8.1 — Bouton flottant coach

**Mission** : ajouter un bouton flottant "Coach" visible sur toutes les pages de l'app.

**Fichier à créer** : `src/components/coach/CoachFAB.tsx`

**Fichier à modifier** : `src/app/(app)/layout.tsx` — ajouter le bouton flottant dans le layout

**Affichage** :
- Bouton rond, 56×56px, position fixe en bas à droite (au-dessus de la BottomNav, décalé de ~80px du bas)
- Icône : un emoji 🤖 ou une icône de chat (lucide-react `MessageCircle`)
- Z-index élevé pour être au-dessus de tout
- Ne PAS afficher le bouton sur la page de login/register

#### Sous-étape 8.2 — Drawer chat plein écran

**Mission** : créer le drawer de chat qui s'ouvre au tap sur le bouton coach.

**Fichiers à créer** :
- `src/components/coach/CoachDrawer.tsx` — le drawer lui-même (Drawer shadcn ou div plein écran avec animation slide-up)
- `src/components/coach/ChatMessages.tsx` — liste des messages
- `src/components/coach/ChatInput.tsx` — zone de saisie

**Comportement du drawer** :
- S'ouvre en plein écran sur mobile (bottom sheet qui remonte à 100% de la hauteur)
- Header fixe : "Coach" + bouton fermer (X)
- Zone de messages scrollable au milieu
- Zone de saisie fixe en bas : input texte + bouton envoyer (56×56px)

**Affichage des messages** :
- Messages user : bulle alignée à droite, couleur accentuée
- Messages assistant : bulle alignée à gauche, couleur neutre
- Pendant le streaming : affichage progressif du texte (lettre par lettre ou chunk par chunk)
- Si un tool est appelé : afficher un badge discret "Consultation des données..." pendant l'appel, puis le résultat est intégré dans la réponse du coach (pas affiché brut)

**Streaming côté client** :
- Utiliser `fetch` avec `response.body.getReader()` pour lire le stream SSE
- Parser les events SSE manuellement (split par `\n\n`, parser `event:` et `data:`)
- Mettre à jour l'état local à chaque chunk reçu (React state, pas Zustand — pas besoin de persister le stream)

#### Sous-étape 8.3 — Historique des conversations

**Mission** : permettre de voir les conversations passées et d'en démarrer une nouvelle.

**Fichier à créer** : `src/components/coach/ConversationList.tsx`

**API nécessaire** : `GET /api/coach/conversations` — retourne les conversations de l'user, triées par date desc, avec le dernier message de chaque conversation en preview.

**Fichier à créer** : `src/app/api/coach/conversations/route.ts`

**API nécessaire** : `GET /api/coach/conversations/[id]/messages` — retourne tous les messages d'une conversation.

**Fichier à créer** : `src/app/api/coach/conversations/[id]/messages/route.ts`

**Comportement** :
- En haut du drawer, bouton "Nouvelle conversation" + liste des conversations récentes (5 dernières)
- Tap sur une conversation → charge les messages et les affiche
- La conversation active est mise en évidence
- Auto-scroll vers le dernier message au chargement et à chaque nouveau message

**Check fonctionnel étape 8** :
- [ ] Bouton flottant coach visible sur le dashboard, la séance, les exercices, la progression
- [ ] Tap → drawer plein écran s'ouvre avec zone de chat
- [ ] Envoyer "Salut" → réponse du coach en streaming (texte apparaît progressivement)
- [ ] Fermer le drawer → rouvrir → la conversation est toujours là
- [ ] "Nouvelle conversation" → conversation vierge, l'ancienne reste accessible dans la liste
- [ ] Demander "Résume ma dernière séance" → le coach utilise le contexte injecté et/ou un tool pour répondre avec des données réelles

---

### Étape 9 — Debrief post-séance automatique

**Objectif** : générer automatiquement un debrief du coach à la fin de chaque séance.

#### Sous-étape 9.1 — Génération du debrief

**Mission** : à la clôture d'une séance (quand l'utilisateur clique "Enregistrer" sur l'écran de fin), déclencher un appel au coach pour générer un debrief.

**Fichier à modifier** : `src/app/(app)/sessions/new/[templateId]/finish/page.tsx`

**Logique** :
1. Après le POST réussi de la séance (les données sont en base), appeler `POST /api/coach/chat` avec :
   - `conversationId` : null (nouvelle conversation liée à la séance)
   - `message` : un message système interne (pas affiché) qui demande le debrief : "Génère un debrief de la séance que je viens de terminer. Séance [A/B/C] du [date]. Résume les progressions, les points positifs, les points d'attention, et ce qu'il faut préparer pour la prochaine séance."
   - Le body doit aussi inclure `sessionLogId` pour que la conversation soit liée à la séance

2. La réponse du coach est streamée et affichée dans une section "Debrief Coach" en bas de l'écran de fin de séance
3. La conversation créée a son champ `session_log_id` rempli

#### Sous-étape 9.2 — Affichage du debrief

**Fichier à créer** : `src/components/coach/SessionDebrief.tsx`

**Affichage** :
- Section en bas de l'écran de fin de séance, après le résumé des progressions
- Titre "🤖 Debrief Coach"
- Texte du debrief en streaming (même affichage progressif que le chat)
- Si le debrief échoue (erreur API, pas de clé LLM configurée) : ne rien afficher, pas d'erreur visible. Le debrief est un bonus, pas une fonctionnalité critique.

**Fichier à modifier** : `src/app/api/coach/chat/route.ts` — accepter `sessionLogId` optionnel dans le body. Si fourni, lier la conversation à la séance.

**Check fonctionnel étape 9** :
- [ ] Terminer une séance → section "Debrief Coach" apparaît en bas avec un texte personnalisé
- [ ] Le debrief mentionne les exercices faits, les progressions, et donne des conseils pour la suite
- [ ] Si la variable `ANTHROPIC_API_KEY` (ou autre) n'est pas définie → pas de debrief, pas d'erreur
- [ ] La conversation de debrief est visible dans la liste des conversations du coach

---

### Étape 10 — Variables d'environnement LLM (toi, manuellement)

**Objectif** : configurer la clé API du LLM pour que le coach fonctionne.

**Mission** : toi (Sacha), manuellement.

1. **Choisir le provider** :
   - Anthropic : créer un compte sur https://console.anthropic.com, aller dans API Keys, créer une clé
   - OpenAI : créer un compte sur https://platform.openai.com, aller dans API Keys, créer une clé

2. **Ajouter dans `.env.local`** :
```
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-xxx...
LLM_MODEL=claude-sonnet-4-20250514
```
Ou pour OpenAI :
```
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-xxx...
LLM_MODEL=gpt-4o-mini
```

3. **Si déployé sur Vercel** : aller dans Vercel Dashboard → ton projet → Settings → Environment Variables → ajouter les mêmes variables.

4. Relancer le serveur de dev (`npm run dev`)

**Check fonctionnel étape 10** :
- [ ] Ouvrir le chat coach → envoyer un message → réponse reçue (= la clé API fonctionne)
- [ ] Si la clé est incorrecte → le chat affiche une erreur user-friendly ("Le coach n'est pas disponible pour le moment")

---

## Check final de phase

- [ ] **Auth complète** : login/register/logout fonctionnels, middleware de protection, user_id dynamique dans toutes les routes API
- [ ] **RLS actif** : un 2e compte ne voit pas les données de Sacha
- [ ] **Coach fonctionnel** : chat avec streaming, contexte injecté (le coach connaît le profil, le bloc, les dernières séances), tools de lecture opérationnels
- [ ] **Debrief post-séance** : généré automatiquement à la fin de chaque séance
- [ ] **Historique coach** : conversations persistées, accessibles depuis le drawer
- [ ] **Bouton flottant** : visible sur toutes les pages, drawer plein écran mobile
- [ ] **Aucune régression Phase 1-2-3** : saisie séance, double progression, feux, alertes, timer, persistance, graphiques, export, offline — tout fonctionne encore
- [ ] **Tests sur mobile** : coach utilisable pendant une séance (bouton accessible, drawer s'ouvre, réponse lisible)
