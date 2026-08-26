> **ARCHIVE — document d'intention, pas état du code.**
> Ce document décrit ce qui était *prévu* lors de cette phase. Plusieurs éléments
> annoncés comme livrés sont en réalité du code mort ou des placeholders.
> La source de vérité est le code, et les limites connues sont listées dans le README.

---

# Phase 3 — Polish + Offline

## Objectif de la phase

L'app devient utilisable au quotidien en salle : timer de repos fiable sur iOS, reprise de séance après crash, graphiques de progression, authentification, export de données, et fonctionnement offline.

**Prérequis** : Phase 2 terminée — DailyState, ajustements auto, double progression, feux biologiques, alertes, substitutions, dashboard.

**Correctifs Phase 2 embarqués** : le feu de tendance n'est pas encore calculé/stocké en fin de séance, et l'affichage des alertes dans le dashboard est basique. Ces deux points sont corrigés dans les étapes 1 et 6.

---

## Étapes

### Étape 1 — Correctifs Phase 2 : feu tendance en fin de séance + résumé progressions

**Objectif** : câbler les deux éléments manquants de la Phase 2 pour que l'écran de fin de séance soit complet.

#### Sous-étape 1.1 — Calcul et stockage du feu de tendance à la clôture

**Mission** : À la soumission de l'écran de fin de séance, avant le POST final, appeler l'API `/api/sessions/tendency` pour le template en cours, puis calculer `computeFeuTendance` avec les données retournées (incluant la séance qui vient d'être enregistrée). Stocker le résultat dans le champ `feu_biologique_tendance` du SessionLog via le même POST (ou un PATCH immédiat après).

**Fichiers à modifier** :
- `src/app/(app)/sessions/new/[templateId]/finish/page.tsx`
- `src/app/api/sessions/route.ts` (le POST doit accepter `feuBiologiqueTendance` dans le body, ou bien le calculer côté serveur — au choix de l'agent, mais le résultat doit être stocké)

**Comportement attendu** :
- L'écran de fin affiche le feu de tendance (vert/orange/rouge) avec une phrase explicative : "Progression sur 2/3 piliers" ou "Stagnation, contexte dégradé sur 2/3 séances" ou "Régression sur Lying Chest Press, contexte normal → deload recommandé"
- Le feu de tendance est stocké dans `session_log.feu_biologique_tendance` en base

#### Sous-étape 1.2 — Résumé des progressions en fin de séance

**Mission** : Afficher un récapitulatif par exercice comparant la séance actuelle à la dernière séance sur la même ExerciseInstance.

**Fichier à créer** : `src/components/session/ProgressionSummary.tsx`

**Fichier à modifier** : `src/app/(app)/sessions/new/[templateId]/finish/page.tsx`

**Données nécessaires** : pour chaque exercice de la séance, récupérer les SetLogs de la session précédente sur la même ExerciseInstance (déjà disponible via `/api/set-logs/last-session`). Comparer :
- 1RM estimé (Epley) de la meilleure série : actuelle vs précédente
- Nombre total de reps × charge (volume total)
- Si fourchette complétée sur cet exercice (via `computeNextSets`)

**Affichage** : liste verticale, un item par exercice :
- Nom de l'exercice + badge pilier
- Delta : `80kg × 7 vs 80kg × 6 → +1 rep ↑` (vert), `= identique` (gris), `↓ régression` (rouge)
- Si fourchette complétée : bandeau "Fourchette complétée → passer à X kg ?" avec boutons Oui/Non. Le "Oui" ne modifie rien en base immédiatement — il stocke l'intention dans le SessionLog notes ou dans un champ dédié, et le pré-remplissage de la prochaine séance (`computeNextSets`) s'en chargera automatiquement puisque la fourchette est déjà détectée par l'algo.

**Check fonctionnel étape 1** :
- [ ] Terminer une séance → le feu de tendance s'affiche (pas "Non renseigné")
- [ ] Le champ `feu_biologique_tendance` est rempli dans la table `session_log` après clôture
- [ ] Le résumé des progressions affiche un delta par exercice avec la bonne couleur
- [ ] Si une fourchette est complétée (ex : Machine Lateral Raise 15/15), le bandeau s'affiche avec la suggestion de charge suivante

---

### Étape 2 — Timer de repos circulaire

**Objectif** : timer visuel qui démarre automatiquement après validation d'une série, résistant aux mises en arrière-plan iOS.

#### Sous-étape 2.1 — Composant timer

**Mission** : Créer un composant de timer de repos circulaire (arc SVG ou canvas) qui fonctionne de manière fiable sur iOS Safari en mode PWA.

**Fichier à créer** : `src/components/session/RestTimer.tsx`

**Contrainte iOS critique** : sur iOS PWA, `setInterval` / `setTimeout` sont suspendus quand l'app passe en arrière-plan. Le timer ne doit JAMAIS compter les secondes via un compteur incrémental. À la place :
- Au démarrage du timer : stocker `restStartTimestamp = Date.now()` et `restDurationSeconds` dans le store Zustand (persist)
- À chaque frame d'affichage (via `requestAnimationFrame` ou un `setInterval` de 250ms) : calculer `elapsed = Date.now() - restStartTimestamp`, afficher `restDurationSeconds - elapsed`
- Au retour au premier plan (event `visibilitychange` sur `document`) : recalculer immédiatement le delta. Si le repos est terminé, afficher "Repos terminé depuis X sec" au lieu de 0

**Props du composant** :
- `durationSeconds` : durée de repos cible (vient de `ExerciseInTemplate.repos_secondes`)
- `onComplete` : callback quand le timer atteint 0 (jouer un son si Web Audio est disponible, sinon ne rien faire — pas de vibration, pas fiable sur iOS PWA)
- `onSkip` : callback pour le bouton "Skip"
- `onExtend` : callback pour le bouton "+30s" (ajoute 30s à `restDurationSeconds` dans le store)

**Affichage** :
- Cercle SVG (rayon ~80px) avec un arc qui se remplit progressivement
- Temps restant en gros au centre (ex : `1:32`)
- Sous le cercle : deux boutons côte à côte, "Skip" et "+30s", zones tactiles 56×56px minimum
- Si repos terminé et utilisateur toujours sur cet écran : texte passe en vert, affiche le dépassement ("+ 15s")
- Couleur de l'arc : blanche tant que le repos court, verte quand terminé

#### Sous-étape 2.2 — Signal sonore fin de repos (Web Audio API)

**Mission** : Jouer un bip court quand le timer atteint 0. Utiliser la Web Audio API (pas `<audio>` HTML, qui est moins fiable sur iOS).

**Fichier à créer** : `src/lib/audio/beep.ts`

**Contrainte iOS** : un `AudioContext` doit être créé (ou resumed) suite à un geste utilisateur. La première interaction de l'utilisateur dans la séance (ex : première validation de série) doit initialiser l'AudioContext via un `audioContext.resume()`. Stocker l'instance globalement (singleton).

**Son** : un simple oscillateur sinusoïdal à 880Hz pendant 200ms, volume 0.3. Pas de fichier audio externe.

**Fallback** : si `AudioContext` n'est pas disponible ou si `resume()` échoue, ne rien faire silencieusement (pas d'erreur visible).

#### Sous-étape 2.3 — Intégration du timer dans la séance live

**Mission** : Connecter le timer au flux de saisie de séance.

**Fichiers à modifier** :
- `src/app/(app)/sessions/new/[templateId]/page.tsx`
- `src/stores/sessionStore.ts`

**Comportement** :
1. L'utilisateur valide une série → `SetLog` enregistré dans le store → le timer démarre automatiquement avec la durée de repos de l'exercice en cours (`ExerciseInTemplate.repos_secondes`)
2. Le timer est affiché en overlay ou dans une zone dédiée sous les boutons de saisie de série
3. Pendant que le timer court, les champs de saisie de la série suivante sont déjà visibles et pré-remplis (l'utilisateur peut saisir pendant le repos s'il le veut)
4. Quand le timer se termine : bip sonore + texte vert
5. Si l'utilisateur valide une série alors que le timer court encore : enregistrer `repos_réel_secondes = elapsed` dans le SetLog, redémarrer le timer pour la série suivante
6. Pas de timer après la dernière série d'un exercice (passage à l'exercice suivant)

**Données à stocker dans le sessionStore** (persist) :
- `restStartTimestamp: number | null`
- `restDurationSeconds: number | null`
- `restExerciseIndex: number | null` (pour savoir à quel exercice le timer est lié)

**Check fonctionnel étape 2** :
- [ ] Valider une série → le timer circulaire démarre automatiquement avec la bonne durée
- [ ] Mettre l'app en arrière-plan pendant 30s → revenir → le timer affiche le bon temps restant (pas un reset)
- [ ] Mettre l'app en arrière-plan pendant 3min (repos = 2min) → revenir → le timer affiche "Repos terminé depuis ~1min" en vert
- [ ] Bouton "+30s" ajoute 30s au timer en cours
- [ ] Bouton "Skip" arrête le timer immédiatement
- [ ] Bip sonore à la fin du timer (tester sur iOS Safari en PWA — peut ne pas fonctionner si app en arrière-plan, c'est attendu)
- [ ] `repos_réel_secondes` est enregistré dans chaque SetLog

---

### Étape 3 — Persistance de séance renforcée

**Objectif** : si l'app crash, est fermée par iOS, ou si le téléphone redémarre, la séance en cours reprend exactement là où elle en était.

#### Sous-étape 3.1 — Détection de séance en cours au lancement

**Mission** : Au chargement du dashboard, vérifier si le sessionStore (Zustand persist) contient une séance non terminée. Si oui, afficher un bandeau/card de reprise.

**Fichier à modifier** : `src/app/(app)/dashboard/page.tsx`

**Comportement** :
- Au montage, lire le sessionStore. Si `sessionStore.sessionId` existe ET `sessionStore.completedAt` est null → séance en cours détectée
- Afficher une card prioritaire (au-dessus de "Prochaine séance") : "Séance en cours — [Nom du template] — [X] séries enregistrées — Reprendre" avec un gros bouton vert
- Le bouton "Reprendre" redirige vers `/sessions/new/[templateId]` qui reconstruit l'état depuis le store
- Ajouter aussi un lien discret "Abandonner la séance" qui clear le store (avec confirmation dialog)

#### Sous-étape 3.2 — Robustesse du store de séance

**Mission** : S'assurer que le sessionStore couvre tous les cas de reprise.

**Fichier à modifier** : `src/stores/sessionStore.ts`

**Données minimales à persister** :
- `sessionId` : l'ID du SessionLog créé en base au démarrage
- `templateId` : pour retrouver la structure de la séance
- `gymId` : salle du jour
- `startedAt` : timestamp de début (pour calculer la durée)
- `currentExerciseIndex` : index de l'exercice en cours
- `sets` : tableau de tous les SetLogs déjà saisis (draft + validés)
- `restStartTimestamp`, `restDurationSeconds` : état du timer
- `adjustmentPct` : pourcentage d'ajustement volume appliqué
- `adjustmentReason` : raison de l'ajustement
- `dailyStateId` : pour référence
- `completedAt` : null tant que la séance n'est pas terminée

**Cas limites à gérer** :
- Si le store contient une séance vieille de plus de 6h : considérer la séance comme abandonnée, proposer de la clôturer avec les données existantes ou de l'abandonner
- Si le store contient un `sessionId` qui n'existe plus en base (ex : base reset) : clear le store silencieusement

#### Sous-étape 3.3 — Redirection automatique si séance active

**Mission** : Si l'utilisateur navigue vers `/` ou `/dashboard` alors qu'une séance est active (store non vide, pas completedAt, < 6h), le dashboard affiche la card de reprise en priorité (sous-étape 3.1). Ne PAS forcer une redirection automatique — l'utilisateur peut vouloir consulter autre chose avant de reprendre.

**Check fonctionnel étape 3** :
- [ ] Démarrer une séance, valider 2 séries → fermer l'onglet complètement → rouvrir l'app → dashboard affiche "Séance en cours, Reprendre"
- [ ] Cliquer "Reprendre" → retrouve l'exercice en cours, les 2 séries déjà enregistrées, le timer dans le bon état
- [ ] Séance vieille de 8h dans le store → le dashboard propose "Clôturer" ou "Abandonner" au lieu de "Reprendre"
- [ ] "Abandonner" → confirmation → store vidé → card disparaît
- [ ] Aucune perte de données si on kill l'app entre deux séries

---

### Étape 4 — Graphiques de progression

**Objectif** : visualiser la progression par exercice, le volume par pilier, le poids corporel, et les feux biologiques sur un calendrier.

#### Sous-étape 4.1 — Choix de la librairie de graphiques

**Mission** : Installer et configurer une librairie de graphiques compatible React, légère, mobile-friendly.

**Librairie recommandée** : Recharts (déjà dans l'écosystème React, SVG, responsive, thème sombre facile). Alternativement, Chart.js via react-chartjs-2 si des performances supérieures sont nécessaires sur mobile.

**Commande** : `npm install recharts`

**Fichier à créer** : `src/lib/chart-theme.ts` — constantes de thème pour les graphiques (couleurs des piliers, couleur de fond transparente, couleur de texte pour dark mode, taille de police minimum 12px sur mobile).

Couleurs des piliers à reprendre dans tout le code graphique :
- P1 Poussée : bleu `#3B82F6`
- P2 Tirage : vert `#22C55E`
- P3 Squat : orange `#F97316`
- P4 Hanche : rouge `#EF4444`
- Épaules : violet `#A855F7`
- Bras : cyan `#06B6D4`
- Jambes iso : jaune `#EAB308`
- Core : gris `#6B7280`

#### Sous-étape 4.2 — Page Progression et navigation

**Mission** : Créer la page `/progression` avec une navigation par onglets et l'ajouter à la navigation principale de l'app.

**Fichiers à créer** :
- `src/app/(app)/progression/page.tsx` — page avec Tabs (shadcn) : "Par exercice", "Par pilier", "Poids", "Calendrier"
- Ajouter l'entrée "Progression" dans la navigation bottom bar ou sidebar existante

#### Sous-étape 4.3 — Graphique progression par exercice/instance

**Mission** : Courbe du 1RM estimé (Epley) dans le temps pour une ExerciseInstance donnée.

**Fichier à créer** : `src/components/progression/ExerciseProgressionChart.tsx`

**API nécessaire** : `GET /api/progression/exercise?instanceId=xxx&months=3`

**Fichier à créer** : `src/app/api/progression/exercise/route.ts`

**Données retournées** : pour chaque SessionLog contenant des SetLogs sur cette instance, retourner :
- `date` : date de la session
- `best1RM` : 1RM estimé de la meilleure série (formule Epley : `charge × (1 + reps/30)`)
- `totalVolume` : somme de `charge × reps` sur toutes les séries
- `bestSet` : `{ charge, reps }` de la meilleure série

**Affichage** :
- LineChart Recharts, axe X = dates, axe Y = 1RM estimé (kg)
- Points cliquables : au tap, tooltip avec détail de la meilleure série (`80kg × 8 = 1RM estimé 101kg`)
- Toggle pour basculer entre 1RM estimé et volume total (deux modes d'affichage)
- Sélecteur de période : 1 mois / 3 mois / 6 mois / tout
- En haut du graphique : select pour choisir l'exercice puis l'instance (groupé par exercice → instances)

#### Sous-étape 4.4 — Graphique volume hebdomadaire par pilier

**Mission** : Barres empilées montrant le volume total par pilier par semaine.

**Fichier à créer** : `src/components/progression/PillarVolumeChart.tsx`

**API nécessaire** : `GET /api/progression/pillar-volume?months=3`

**Fichier à créer** : `src/app/api/progression/pillar-volume/route.ts`

**Données retournées** : pour chaque semaine (lundi à dimanche), agréger le volume total (`charge × reps` toutes séries) par pilier. Retourner un tableau :
```
[
  { week: "2026-W14", P1: 4800, P2: 3200, P3: 2400, P4: 1800, epaules: 1200, bras: 900, ... },
  ...
]
```

**Affichage** :
- BarChart Recharts empilé, une barre par semaine, segments colorés par pilier
- Légende en bas avec les couleurs
- Sélecteur de période : 1 mois / 3 mois

#### Sous-étape 4.5 — Graphique poids corporel avec moyenne mobile

**Mission** : Courbe de poids corporel avec moyenne mobile 7 jours.

**Fichier à créer** : `src/components/progression/BodyWeightChart.tsx`

**API nécessaire** : `GET /api/progression/bodyweight?months=6`

**Fichier à créer** : `src/app/api/progression/bodyweight/route.ts`

**Données retournées** : toutes les entrées BodyWeight sur la période, plus une moyenne mobile calculée côté serveur (moyenne des 7 dernières pesées, pas des 7 derniers jours — car les pesées ne sont pas quotidiennes).

**Affichage** :
- LineChart avec deux courbes : poids brut (points + ligne fine) et moyenne mobile (ligne épaisse, lissée)
- Axe Y auto-scale avec marge (ex : si poids entre 89 et 92, axe Y de 88 à 93)
- Ligne horizontale pointillée pour l'objectif si défini dans le profil user (`objectif_chiffré`)

#### Sous-étape 4.6 — Heatmap calendrier des feux biologiques

**Mission** : Calendrier type "GitHub contribution graph" avec une cellule par jour, colorée selon le feu biologique de la séance.

**Fichier à créer** : `src/components/progression/FeuHeatmap.tsx`

**API nécessaire** : `GET /api/progression/feu-heatmap?months=3`

**Fichier à créer** : `src/app/api/progression/feu-heatmap/route.ts`

**Données retournées** : pour chaque jour avec une séance, retourner `{ date, feuJour, feuTendance, templateLettre }`. Les jours sans séance ne sont pas retournés.

**Affichage** :
- Grille 7 colonnes (lun-dim) × N lignes (semaines)
- Cellule colorée : vert / orange / rouge selon `feuJour`. Bordure selon `feuTendance` (bordure verte, orange ou rouge)
- Cellule grise pour les jours sans séance
- Au tap sur une cellule : tooltip avec date, template (A/B/C), feux, et lien vers le détail de la séance

**Check fonctionnel étape 4** :
- [ ] Page `/progression` accessible depuis la navigation, 4 onglets fonctionnels
- [ ] Onglet "Par exercice" : sélectionner Lying Chest Press (Lalande) → courbe avec au moins 1 point (séance du 06/04)
- [ ] Toggle 1RM / Volume total change l'axe Y
- [ ] Onglet "Par pilier" : barres empilées visibles avec couleurs des piliers
- [ ] Onglet "Poids" : courbe avec point à 90.55 kg, moyenne mobile visible
- [ ] Onglet "Calendrier" : heatmap avec cellule orange au 06/04 (séance A), tap → tooltip
- [ ] Tous les graphiques sont lisibles en thème sombre sur mobile (texte clair, fond transparent)

---

### Étape 5 — Sparklines dans la bibliothèque d'exercices

**Objectif** : ajouter une mini-courbe de progression à côté de chaque ExerciseInstance dans la bibliothèque.

#### Sous-étape 5.1 — Composant Sparkline

**Mission** : Créer un composant sparkline minimaliste (pas de Recharts ici, trop lourd pour une liste — un simple SVG `<polyline>` suffit).

**Fichier à créer** : `src/components/ui/Sparkline.tsx`

**Props** :
- `data: number[]` — les valeurs Y (1RM estimés ou volume)
- `width?: number` (défaut 80)
- `height?: number` (défaut 24)
- `color?: string` (défaut couleur du pilier)

**Affichage** : ligne SVG simple, pas d'axes, pas de labels. Juste la tendance visuelle.

#### Sous-étape 5.2 — Intégration dans la page exercices

**Mission** : Dans la page bibliothèque d'exercices (`/exercises` ou équivalent), afficher pour chaque ExerciseInstance :
- Meilleure perf (1RM estimé le plus haut)
- Sparkline des 8 dernières séances
- Dernière date d'utilisation

**Fichier à modifier** : la page de la bibliothèque d'exercices existante

**API nécessaire** : enrichir l'API existante qui retourne les exercices/instances pour inclure `recentPerfs: { date, best1RM }[]` (8 dernières) et `bestEver1RM` par instance.

**Check fonctionnel étape 5** :
- [ ] Page exercices → chaque instance avec historique affiche une sparkline
- [ ] Sparkline monte si progression, descend si régression — tendance visuelle correcte
- [ ] Instances sans historique : pas de sparkline, texte "Aucune donnée"

---

### Étape 6 — Dashboard enrichi (alertes + sparkline poids)

**Objectif** : améliorer le dashboard avec les éléments manquants de la Phase 2.

#### Sous-étape 6.1 — Sparkline poids sur le dashboard

**Mission** : Afficher une sparkline du poids corporel (30 derniers jours) dans le header du dashboard, à côté du poids actuel.

**Fichier à modifier** : `src/app/(app)/dashboard/page.tsx`

**Données** : utiliser les données `poids30jours` déjà retournées par `/api/dashboard`. Passer les valeurs au composant `Sparkline` (sous-étape 5.1).

#### Sous-étape 6.2 — Alertes enrichies

**Mission** : Améliorer l'affichage des alertes dans le dashboard. Chaque alerte doit contenir suffisamment de contexte pour être actionnable.

**Fichier à modifier** : `src/components/alerts/AlertCard.tsx` et `src/app/(app)/dashboard/page.tsx`

**Enrichissements** :
- Alerte "Fourchette complétée" : afficher le nom de l'exercice, la charge actuelle, la charge suggérée. Ex : "Machine Lateral Raise : 6kg × 15/15 → passer à 8kg × 12"
- Alerte "Deload recommandé" : afficher le nombre de semaines depuis le dernier deload. Ex : "5 semaines sans deload — planifier cette semaine ?"
- Alerte "Stagnation" : afficher l'exercice, le nombre de semaines, et le contexte. Ex : "Lying Chest Press : pas de progression depuis 3 semaines (contexte normal)"
- Alerte "Tendance rouge" : afficher les exercices en régression

**Check fonctionnel étape 6** :
- [ ] Dashboard affiche sparkline poids à côté du poids actuel
- [ ] Alertes contiennent les détails (noms d'exercices, charges, durées)
- [ ] Tap sur une alerte ne fait rien pour l'instant (pas de navigation, juste information)

---

### Étape 7 — Authentification Supabase + RLS

**Objectif** : sécuriser l'app avec un vrai système d'authentification et des Row Level Security policies.

#### Sous-étape 7.1 — Configuration Supabase Auth

**Mission** : Activer l'authentification email/password dans Supabase et configurer le client côté app.

**Fichiers à créer** :
- `src/lib/supabase/client.ts` — client Supabase navigateur (si pas déjà créé)
- `src/lib/supabase/server.ts` — client Supabase serveur pour les API routes
- `src/lib/supabase/middleware.ts` — middleware Next.js pour rafraîchir les tokens et protéger les routes

**Fichier à créer** : `src/middleware.ts` — middleware Next.js racine qui utilise `supabase/middleware.ts`. Protège toutes les routes sous `/(app)/` : si pas de session active, redirige vers `/login`.

**Configuration Supabase** :
- Activer le provider "Email" dans le dashboard Supabase (Authentication → Providers)
- Désactiver la confirmation par email pour le MVP (pour simplifier — on est le seul utilisateur)

#### Sous-étape 7.2 — Pages login et inscription

**Mission** : Créer les pages d'authentification minimales.

**Fichiers à créer** :
- `src/app/login/page.tsx` — formulaire email + mot de passe, bouton "Se connecter", lien vers inscription
- `src/app/register/page.tsx` — formulaire email + mot de passe + nom, bouton "Créer mon compte"

**Comportement** :
- Login réussi → redirection vers `/dashboard`
- Login échoué → message d'erreur inline
- Inscription réussie → redirection vers `/dashboard` (pas de confirmation email pour le MVP)
- Si déjà connecté et navigue vers `/login` → redirection vers `/dashboard`

**Design** : minimaliste, thème sombre, centré sur mobile, logo/nom de l'app en haut.

#### Sous-étape 7.3 — Bouton déconnexion

**Mission** : Ajouter un bouton de déconnexion dans la page Paramètres (`/settings` ou équivalent) et dans le header du dashboard.

**Fichier à modifier** : `src/app/(app)/dashboard/page.tsx`, page paramètres existante

**Comportement** : appel `supabase.auth.signOut()` → clear du sessionStore Zustand → redirection vers `/login`.

#### Sous-étape 7.4 — Intégration du user_id dans toutes les API routes

**Mission** : Chaque API route sous `/api/` doit lire le `user_id` depuis la session Supabase au lieu d'utiliser un ID hardcodé.

**Fichiers à modifier** : TOUTES les routes API existantes (`/api/daily-state`, `/api/sessions`, `/api/set-logs`, `/api/dashboard`, `/api/alerts`, `/api/progression/*`, etc.)

**Pattern commun** :
1. Récupérer la session via `supabase.auth.getUser()` côté serveur
2. Si pas de session → retourner 401
3. Utiliser `user.id` dans toutes les requêtes Drizzle au lieu du user_id hardcodé

**Important** : le user_id Supabase Auth est un UUID. S'assurer que le champ `user_id` dans le schéma Drizzle est bien de type `uuid` et correspond à l'ID Supabase Auth. Si le seed a créé un user avec un ID différent, mettre à jour le seed pour utiliser l'UUID du premier compte créé (ou créer le compte Supabase Auth dans le seed).

#### Sous-étape 7.5 — Row Level Security (RLS)

**Mission** : Activer RLS sur toutes les tables contenant un `user_id` et créer les policies.

**Fichier à créer** : `supabase/migrations/XXXX_enable_rls.sql` (migration SQL)

**Tables concernées** : `daily_state`, `session_log`, `set_log`, `body_weight`, `programme_bloc`, `seance_template`, `exercise_in_template`, `user` (lecture de son propre profil)

**Policy pattern** pour chaque table avec `user_id` direct :
- SELECT : `auth.uid() = user_id`
- INSERT : `auth.uid() = user_id`
- UPDATE : `auth.uid() = user_id`
- DELETE : `auth.uid() = user_id`

**Tables sans user_id direct** (ex : `exercise`, `gym`, `exercise_instance`) : ces tables sont partagées ou scopées indirectement. Pour le MVP mono-utilisateur, on peut soit les laisser sans RLS (elles ne contiennent pas de données sensibles), soit les rendre lisibles par tous les utilisateurs authentifiés (`auth.uid() IS NOT NULL`).

**Tables chaînées** (ex : `set_log` → `session_log.user_id`) : le `set_log` n'a pas de `user_id` direct. Deux options :
1. Ajouter un `user_id` au `set_log` (dénormalisation, plus simple pour RLS)
2. Faire une policy avec sous-requête : `EXISTS (SELECT 1 FROM session_log WHERE session_log.id = set_log.session_log_id AND session_log.user_id = auth.uid())`

L'option 1 est recommandée pour la performance. Si l'agent choisit l'option 2, s'assurer que la sous-requête est performante (index sur `session_log.id`).

**Check fonctionnel étape 7** :
- [ ] Accéder à `/dashboard` sans être connecté → redirection vers `/login`
- [ ] Créer un compte → arrivée sur le dashboard
- [ ] Se déconnecter → retour au login, impossible d'accéder au dashboard
- [ ] Toutes les API routes retournent 401 si pas de session
- [ ] Créer un 2e compte → aucune donnée du 1er compte visible (RLS fonctionne)
- [ ] Le seed crée le user Sacha avec un compte Supabase Auth valide

---

### Étape 8 — Export des données

**Objectif** : permettre d'exporter toutes les données en JSON et CSV.

#### Sous-étape 8.1 — API d'export

**Mission** : Créer une route API qui génère un export complet des données utilisateur.

**Fichier à créer** : `src/app/api/export/route.ts`

**Endpoint** : `GET /api/export?format=json` ou `GET /api/export?format=csv`

**Données exportées** :
- Profil utilisateur (sans mot de passe)
- Toutes les SessionLogs avec leurs SetLogs
- Tous les DailyStates
- Tous les BodyWeights
- Les ProgrammeBlocs et SeanceTemplates
- Les ExerciseInstances utilisées

**Format JSON** : un seul objet avec des clés par table (`{ user: {...}, sessions: [...], sets: [...], ... }`).

**Format CSV** : un fichier ZIP contenant un CSV par table. Utiliser une librairie comme `papaparse` côté serveur (ou `json2csv`) pour la conversion. Le ZIP peut être généré avec `archiver` ou `jszip`.

**Commande** : `npm install papaparse jszip` (ou équivalents choisis par l'agent)

#### Sous-étape 8.2 — Bouton d'export dans les paramètres

**Mission** : Ajouter les boutons d'export dans la page paramètres.

**Fichier à modifier** : page paramètres existante

**Affichage** : section "Mes données" avec deux boutons : "Exporter en JSON" et "Exporter en CSV". Au clic, téléchargement du fichier via `window.open('/api/export?format=json')` ou déclenchement via fetch + blob + `URL.createObjectURL`.

**Check fonctionnel étape 8** :
- [ ] Bouton "Exporter JSON" → télécharge un fichier `.json` contenant toutes les données
- [ ] Le JSON contient les sessions, sets, daily states, body weights
- [ ] Bouton "Exporter CSV" → télécharge un `.zip` contenant un CSV par table
- [ ] Les CSV s'ouvrent correctement dans Excel/Google Sheets

---

### Étape 9 — Offline-first avec service worker amélioré

**Objectif** : l'app fonctionne en salle même sans réseau. La séance en cours peut être saisie et sauvegardée localement, puis synchronisée au retour du réseau.

#### Sous-étape 9.1 — Évaluation et choix de la stratégie offline

**Mission** : L'agent doit évaluer les deux options et choisir celle qui convient le mieux au projet actuel.

**Option A — PowerSync** (recommandée dans la vision) :
- SDK conçu pour Supabase, sync bidirectionnelle automatique
- Gère les conflits, le cache local, les mutations offline
- Nécessite un PowerSync Service (self-hosted ou cloud)
- Plus lourd à setup mais plus robuste à long terme

**Option B — Service Worker cache + mutation queue** (plus simple pour le MVP) :
- Service worker (via `next-pwa` ou `serwist`) qui cache les assets et les pages
- Pour les données : le sessionStore Zustand (déjà persisté en localStorage) sert de cache de séance
- Les mutations (POST/PATCH) sont mises en queue dans IndexedDB quand offline
- Au retour du réseau (event `online`), la queue est rejouée séquentiellement
- Pas de sync bidirectionnelle complète — juste les écritures de séance

**Critère de choix** : pour le MVP mono-utilisateur, l'option B est suffisante. La séance en cours est le seul cas d'usage critique offline. La consultation de l'historique et des graphiques peut nécessiter le réseau. L'agent choisit, mais doit justifier dans un commentaire en haut du fichier principal.

#### Sous-étape 9.2 — Service worker et cache des assets

**Mission** : Configurer un service worker qui met en cache les pages de l'app et les assets statiques pour que l'app se charge même sans réseau.

**Commande** : `npm install @serwist/next serwist` (ou `next-pwa` — au choix de l'agent, `serwist` est le successeur maintenu de `next-pwa`)

**Fichiers à créer/modifier** :
- `src/app/sw.ts` (ou `public/sw.js`) — service worker
- `next.config.js` — configuration du plugin PWA
- `src/app/manifest.ts` (ou `public/manifest.json`) — vérifier/compléter le manifest PWA

**Stratégies de cache** :
- Pages HTML et JS/CSS : "stale-while-revalidate" (afficher le cache, mettre à jour en background)
- API GET (dashboard, exercices, historique) : "network-first" avec fallback cache (affiche des données potentiellement stale si offline, c'est OK)
- API POST/PATCH/DELETE : voir sous-étape 9.3
- Images et fonts : "cache-first"

#### Sous-étape 9.3 — Queue de mutations offline

**Mission** : Quand une mutation (POST, PATCH, DELETE) échoue à cause du réseau, la stocker dans une queue et la rejouer au retour du réseau.

**Fichier à créer** : `src/lib/offline/mutation-queue.ts`

**Mécanisme** :
1. Créer un wrapper `fetchWithQueue(url, options)` qui remplace les `fetch` des API routes côté client
2. Si le fetch échoue avec une erreur réseau (`TypeError: Failed to fetch` ou `navigator.onLine === false`) :
   - Stocker `{ url, method, headers, body, timestamp }` dans IndexedDB (table `offline_mutations`)
   - Retourner une réponse synthétique avec un flag `{ offline: true, queued: true }`
3. Écouter l'event `online` sur `window` : quand le réseau revient, rejouer toutes les mutations de la queue dans l'ordre (FIFO)
4. Si une mutation rejouée échoue (ex : conflit serveur), la logger et la retirer de la queue (pas de retry infini)
5. Afficher un indicateur visuel dans le header de l'app : "Hors ligne — X mutations en attente" (badge orange)

**Fichier à créer** : `src/components/ui/OfflineIndicator.tsx` — petit bandeau ou badge dans le layout principal. Visible seulement quand offline ou quand la queue n'est pas vide.

**Mutations critiques à couvrir** :
- `POST /api/sessions` (création de SessionLog)
- `POST /api/set-logs` (enregistrement de séries — si les sets sont envoyés au fur et à mesure)
- `POST /api/daily-state` (enregistrement de l'état du jour)
- `PATCH /api/sessions/[id]` (clôture de séance)

**Note** : si les sets sont uniquement stockés dans le Zustand store et envoyés en batch à la fin de la séance (POST unique), alors seul ce POST final doit être queueable. Vérifier le flux actuel avant d'implémenter.

#### Sous-étape 9.4 — Test offline complet

**Mission** : Vérifier le flux complet en simulant une perte de réseau.

**Procédure de test** (à documenter dans un commentaire ou README) :
1. Ouvrir l'app en mode PWA installée (Add to Home Screen)
2. Charger le dashboard (tout est caché)
3. Activer le mode avion
4. Naviguer vers DailyState → remplir → valider
5. Démarrer la séance → saisir 3 séries
6. Désactiver le mode avion
7. Vérifier que les données remontent en base

**Check fonctionnel étape 9** :
- [ ] App installée en PWA → couper le réseau → l'app se charge quand même (page blanche = échec)
- [ ] En mode offline : remplir le DailyState → pas d'erreur visible, indicateur "Hors ligne" affiché
- [ ] En mode offline : saisir des séries → les séries sont sauvegardées localement (Zustand)
- [ ] Rétablir le réseau → les mutations en attente sont envoyées automatiquement
- [ ] Indicateur "Hors ligne" disparaît quand le réseau revient et la queue est vide
- [ ] Après sync : les données sont bien en base (vérifier dans Supabase dashboard)

---

### Étape 10 — UX Polish

**Objectif** : rendre l'expérience fluide et agréable en salle, avec les micro-interactions qui font la différence.

#### Sous-étape 10.1 — Transitions et animations

**Mission** : Ajouter des transitions douces sur les changements d'état clés.

**Fichiers à modifier** : composants de séance, dashboard, navigation

**Animations à implémenter** (CSS transitions ou `framer-motion` si l'agent le juge nécessaire — pas obligatoire) :
- Exercice terminé → collapse vers la version condensée (transition height + opacity)
- Exercice suivant → expand vers la version complète
- Validation de série → flash vert bref sur la ligne validée
- Timer de repos → animation de l'arc SVG fluide (pas saccadée)
- Feu biologique → légère animation de pulse sur le changement de couleur
- Cards du dashboard → fade-in au chargement

**Contrainte** : aucune animation ne doit bloquer l'interaction. Toutes les transitions doivent être < 300ms. Utiliser `will-change` et `transform` pour rester sur le GPU.

#### Sous-étape 10.2 — États vides et loading

**Mission** : Ajouter des skeletons de chargement et des états vides explicites partout.

**Fichier à créer** : `src/components/ui/Skeleton.tsx` (si pas déjà fourni par shadcn)

**Endroits à couvrir** :
- Dashboard : skeleton pour chaque card pendant le chargement
- Graphiques : skeleton rectangle pendant le chargement des données
- Bibliothèque d'exercices : skeleton list
- Séance live : skeleton pour le pré-remplissage des charges

**États vides** :
- Bibliothèque sans exercice après filtre : "Aucun exercice trouvé pour ces filtres"
- Graphique sans données : "Pas encore de données. Enregistre ta première séance !"
- Alertes vides : ne pas afficher la card du tout (pas de "Aucune alerte")
- Historique vide sur un exercice : "Première séance sur cette machine"

#### Sous-étape 10.3 — Améliorations tactiles en séance

**Mission** : Optimiser les zones tactiles et les interactions pour une utilisation en salle avec les doigts moites.

**Fichiers à modifier** : composants de saisie de séance

**Améliorations** :
- Boutons +/- pour charge et reps : taille minimale 56×56px, espacement 12px entre eux, texte 20px+
- Bouton "Valider série" : pleine largeur, hauteur 56px, texte 18px, contraste fort
- Affichage de la charge actuelle : taille 32px+ pour être visible de loin
- Affichage du tempo : taille 24px, position bien visible (pas en small text)
- Slider RPE : hauteur du thumb augmentée pour faciliter le drag sur écran mouillé (s'assurer que le composant shadcn permet cette customisation — sinon, utiliser un input numérique avec boutons +/-)
- Scroll de la liste d'exercices : `-webkit-overflow-scrolling: touch` et `overscroll-behavior: contain` pour un scroll natif fluide

#### Sous-étape 10.4 — Dual-Weight Display pour poulies doubles

**Mission** : Quand un exercice utilise une poulie double (2:1), afficher les deux valeurs de charge.

**Fichier à modifier** : composant de saisie de charge dans la séance live

**Comportement** :
- Si `exerciseInstance.type_poulie === 'double'` : afficher la charge pile en gros (c'est ce que l'utilisateur règle) + en dessous, en plus petit et grisé : "Tension réelle ≈ X/2 kg"
- Si `exerciseInstance.type_poulie === 'simple'` ou `'NA'` : affichage normal
- Si `exerciseInstance.convention_charge === 'disques_ajoutés'` ET `exerciseInstance.poids_non_compté` est défini : afficher en petit sous la charge "Plateforme X kg non comptée"

**Check fonctionnel étape 10** :
- [ ] Transitions visibles et fluides entre les exercices en séance (pas de saut brutal)
- [ ] Skeletons affichés pendant le chargement sur toutes les pages
- [ ] Boutons de saisie en séance assez gros pour être tapés sans précision (56px+)
- [ ] Charge affichée en gros (32px+), tempo en 24px+
- [ ] Exercice avec poulie double : affichage dual-weight (charge pile + tension réelle)
- [ ] Hack Squat (Matrix Perfect Squat) : note "Plateforme 30.4 kg non comptée" visible

---

## Check final de phase

- [ ] **Timer de repos** : démarre auto après validation de série, survit à la mise en arrière-plan iOS, bip sonore fonctionnel, boutons Skip et +30s
- [ ] **Persistance séance** : fermer l'app mid-séance → rouvrir → card "Reprendre" sur le dashboard → reprise exacte (exercice, séries, timer)
- [ ] **Graphiques** : 4 onglets fonctionnels (exercice, pilier, poids, calendrier) avec données réelles, lisibles en dark mode sur mobile
- [ ] **Sparklines** : visibles dans la bibliothèque d'exercices et sur le dashboard (poids)
- [ ] **Auth** : login/register/logout fonctionnels, RLS activé, impossible d'accéder aux données d'un autre utilisateur
- [ ] **Export** : JSON et CSV téléchargeables, données complètes et correctes
- [ ] **Offline** : l'app se charge sans réseau, une séance peut être saisie offline et se synchronise au retour du réseau
- [ ] **UX** : zones tactiles 56px+, charge en 32px+, transitions fluides, skeletons, dual-weight display
- [ ] **Aucune régression Phase 1-2** : CRUD exercices, saisie séance, double progression, feux, alertes, substitutions, dashboard — tout fonctionne encore
- [ ] **Tests sur iOS Safari PWA** : installer l'app sur l'écran d'accueil, saisir une séance complète, vérifier timer + persistance + offline
