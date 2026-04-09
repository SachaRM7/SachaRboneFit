# Phase 2 — Intelligence déterministe

## Objectif de la phase

L'app prend des décisions automatiques sans IA : état du jour, ajustement du volume, double progression avec pré-remplissage, feu biologique (jour + tendance), alertes, substitutions déterministes, et un dashboard fonctionnel.

**Prérequis** : Phase 1 terminée — schéma Drizzle complet, seed fonctionnel, CRUD exercices/instances/salles, saisie de séance basique, historique par exercice, poids corporel, PWA installable.

---

## Étapes

### Étape 1 — DailyState : modèle + API + formulaire

**Objectif** : pouvoir remplir l'état du jour avant chaque séance, et le stocker en base.

#### Sous-étape 1.1 — Table DailyState (si pas déjà en Phase 1)

**Mission** : Vérifier que la table `daily_state` existe dans le schéma Drizzle. Si elle a été créée en Phase 1 comme partie du schéma complet, passer directement à 1.2. Sinon, la créer.

**Fichiers à créer/modifier** : `src/db/schema/daily-state.ts` (si absent), `src/db/schema/index.ts`

**Détail technique** :

```typescript
// src/db/schema/daily-state.ts
import { pgTable, uuid, date, real, boolean, text, integer, time, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './user';

export const dailyStates = pgTable('daily_state', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  date: date('date').notNull(),
  sommeilHeures: real('sommeil_heures'), // 0-12, pas de 0.5
  jeuneBool: boolean('jeune_bool').default(false),
  shiftRecentBool: boolean('shift_recent_bool').default(false),
  shiftType: text('shift_type', { enum: ['jour', 'nuit', 'aucun'] }).default('aucun'),
  energieDepart: integer('energie_depart'), // 1-10
  courbatures: jsonb('courbatures').$type<Array<{ muscle: string; intensite: number }>>().default([]),
  dernierRepasHeure: time('dernier_repas_heure'),
  horaireSeancePrevu: time('horaire_seance_prevu'),
}, (table) => ({
  uniqueUserDate: uniqueIndex('daily_state_user_date_idx').on(table.userId, table.date),
}));
```

**Commandes** : `npx drizzle-kit generate` puis `npx drizzle-kit push`

#### Sous-étape 1.2 — API routes DailyState

**Mission** : Créer les routes CRUD pour DailyState.

**Fichiers à créer** :
- `src/app/api/daily-state/route.ts` — GET (par date + userId) et POST (upsert)
- `src/lib/validators/daily-state.ts` — schéma Zod

**Détail technique** :

```typescript
// src/lib/validators/daily-state.ts
import { z } from 'zod';

export const dailyStateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sommeilHeures: z.number().min(0).max(12).step(0.5),
  jeuneBool: z.boolean(),
  shiftRecentBool: z.boolean(),
  shiftType: z.enum(['jour', 'nuit', 'aucun']),
  energieDepart: z.number().int().min(1).max(10),
  courbatures: z.array(z.object({
    muscle: z.string(),
    intensite: z.number().int().min(1).max(10),
  })).default([]),
  dernierRepasHeure: z.string().nullable().optional(),
  horaireSeancePrevu: z.string().nullable().optional(),
});
```

Route GET `/api/daily-state?date=2026-04-08` retourne le DailyState du jour (ou null).
Route POST `/api/daily-state` fait un upsert (insert on conflict update) sur la contrainte unique (userId, date).

#### Sous-étape 1.3 — Écran "État du jour"

**Mission** : Créer l'écran obligatoire pré-séance. Un seul écran, pas de wizard.

**Fichiers à créer** :
- `src/app/session/daily-state/page.tsx`
- `src/components/daily-state/DailyStateForm.tsx`
- `src/components/daily-state/CourbaturesModal.tsx`

**Détail technique** :

Le formulaire utilise React Hook Form + Zod (`dailyStateSchema`). Champs :

| Champ | Composant | Défaut |
|---|---|---|
| Salle du jour | `<Select>` (shadcn) — liste des salles depuis API `/api/gyms` | Dernière salle utilisée (lue depuis le dernier SessionLog) |
| Sommeil | Slider shadcn 0-12, pas de 0.5 | 7 |
| Jeûne | Switch shadcn | false |
| Shift récent 48h | Switch. Si activé → RadioGroup jour/nuit | false |
| Énergie réveil | Slider 1-10 | 5 |
| Courbatures | Bouton "Ajouter" → ouvre `CourbaturesModal` | [] |
| Dernier repas | Select heures (6h-23h, pas de 30min) | null |

**CourbaturesModal** : modal shadcn avec Select (liste muscles) + Slider intensité 1-10 + bouton Ajouter. Liste muscles :

```typescript
export const MUSCLES = [
  'Pectoraux', 'Dorsaux', 'Trapèzes', 'Épaules (deltoïdes)',
  'Biceps', 'Triceps', 'Avant-bras',
  'Quadriceps', 'Ischio-jambiers', 'Fessiers', 'Adducteurs',
  'Mollets', 'Abdominaux', 'Lombaires',
] as const;
```

**Pré-remplissage intelligent des courbatures** : à la validation du formulaire, si le dernier SessionLog date de < 72h, lire les muscles ciblés par les exercices de cette séance (via `exercises.muscles_principaux`) et pré-cocher ces muscles dans la modal avec intensité 3 par défaut. L'utilisateur ajuste ou supprime.

**Bouton "Valider → Voir la séance ajustée"** : POST le DailyState, puis redirige vers `/session/start?date=2026-04-08&dailyStateId=xxx`.

**Check fonctionnel étape 1** :
- [ ] Ouvrir `/session/daily-state` → formulaire complet affiché, thème sombre
- [ ] Remplir tous les champs, ajouter 2 courbatures → POST réussi, DailyState créé en base
- [ ] Recharger la page → le DailyState du jour est rechargé (upsert fonctionne)
- [ ] Bouton "Valider" redirige vers `/session/start` avec les bons query params

---

### Étape 2 — Algorithme d'ajustement automatique du volume

**Objectif** : calculer les ajustements de volume à partir du DailyState, AVANT que la séance ne démarre.

#### Sous-étape 2.1 — Fonction métier pure `computeVolumeAdjustment`

**Mission** : Implémenter la logique d'ajustement comme une fonction pure (pas de DB, pas d'API — juste entrée → sortie).

**Fichier à créer** : `src/lib/engine/volume-adjustment.ts`

**Détail technique** :

```typescript
// src/lib/engine/volume-adjustment.ts

export interface DailyStateInput {
  sommeilHeures: number;
  jeuneBool: boolean;
  shiftRecentBool: boolean;
  shiftType: 'jour' | 'nuit' | 'aucun';
  energieDepart: number; // 1-10
  courbatures: Array<{ muscle: string; intensite: number }>;
}

export interface VolumeAdjustment {
  totalPct: number; // ex: -25. 0 = pas d'ajustement. Plafond à -40.
  raisons: string[]; // ex: ["Sommeil 4h → -25%"]
  proposeDeloadImprovise: boolean; // true si énergie ≤ 4
  proposeReport: boolean; // true si courbatures > 7 sur muscle ciblé
  musclesAReporter: string[]; // muscles avec courbatures > 7
}

export function computeVolumeAdjustment(
  state: DailyStateInput,
  musclesCiblesSéance: string[] // muscles ciblés par le template du jour
): VolumeAdjustment {
  // ...
}
```

**Règles exactes** (cf. AppSportPerso-v2.md) :

| Condition | Ajustement |
|---|---|
| `sommeilHeures <= 5` | -25% |
| `jeuneBool === true` | -15% |
| `shiftRecentBool && shiftType === 'nuit'` | -20% |
| `energieDepart <= 4` | `proposeDeloadImprovise = true` (pas de % auto, proposition) |
| Courbature > 7/10 sur un muscle dans `musclesCiblesSéance` | `proposeReport = true` pour ce muscle |

Cumul : additionner les %, plafonner à -40%.

Exemple : sommeil 4h + jeûne = -25 + -15 = -40% (pile au plafond).

**Important** : les ajustements ne touchent JAMAIS les exercices dont le `catégorie_rôle` est `pilier`. Seuls les `substitut` et `accessoire` voient leurs séries réduites. La réduction de séries = arrondi au supérieur (`Math.ceil(séries * (1 + totalPct/100))`), minimum 1 série par exercice.

#### Sous-étape 2.2 — Fonction `applyVolumeAdjustment` sur un template

**Mission** : Prendre un template de séance + un VolumeAdjustment et retourner le template modifié (séries réduites sur les non-piliers).

**Fichier à créer** : `src/lib/engine/apply-adjustment.ts`

```typescript
export interface AdjustedExercise {
  exerciseInTemplateId: string;
  exerciseInstanceId: string;
  exerciseName: string;
  categorieRole: 'pilier' | 'substitut' | 'accessoire';
  seriesOriginales: number;
  seriesAjustees: number; // = seriesOriginales si pilier, sinon réduit
  fourchetteRepsMin: number;
  fourchetteRepsMax: number;
  rpeCible: number;
  tempo: string;
  reposSecondes: number;
}

export function applyVolumeAdjustment(
  templateExercises: ExerciseInTemplateWithDetails[], // jointure template + exercise + instance
  adjustment: VolumeAdjustment,
): AdjustedExercise[] {
  // Pour chaque exercice :
  // - Si categorieRole === 'pilier' → garder séries intactes
  // - Sinon → Math.ceil(séries * (1 + adjustment.totalPct / 100)), min 1
}
```

#### Sous-étape 2.3 — Bandeau d'ajustement dans l'écran séance

**Mission** : Afficher un bandeau en haut de la séance quand le volume est ajusté.

**Fichier à créer** : `src/components/session/AdjustmentBanner.tsx`

**Détail technique** : composant shadcn `Alert` avec variant `warning`. Affiche :
- "Volume -25% appliqué : sommeil 4h" (ou les raisons concaténées)
- Si `proposeDeloadImprovise` : bouton "Passer en deload improvisé" (pour Phase 3, juste afficher le message pour l'instant)
- Si `proposeReport` : "Courbatures fortes sur [muscles]. Reporter ces exercices ?" (pour l'instant informatif)

Le bandeau est visible tant que la séance est active.

**Check fonctionnel étape 2** :
- [ ] `computeVolumeAdjustment({ sommeilHeures: 4, jeuneBool: false, ... })` retourne `{ totalPct: -25, raisons: ["Sommeil 4h → -25%"] }`
- [ ] `computeVolumeAdjustment({ sommeilHeures: 4, jeuneBool: true, ... })` retourne `{ totalPct: -40, ... }` (plafond)
- [ ] `applyVolumeAdjustment` sur un template avec 3 séries accessoire + adjustment -25% → accessoire passe à 3 séries (ceil(3 × 0.75) = 3) ; avec -40% → passe à 2 séries (ceil(3 × 0.6) = 2)
- [ ] Piliers restent intacts quel que soit l'ajustement
- [ ] Bandeau visible en haut de séance quand ajustement ≠ 0

---

### Étape 3 — Algorithme de double progression + pré-remplissage

**Objectif** : à l'ouverture de chaque exercice en séance, pré-remplir la charge et les reps suggérées selon la logique de double progression.

#### Sous-étape 3.1 — Fonction `computeNextSet`

**Mission** : Implémenter l'algorithme de double progression comme fonction pure.

**Fichier à créer** : `src/lib/engine/double-progression.ts`

```typescript
export interface LastSessionSets {
  sets: Array<{ numero: number; reps: number; charge: number }>;
}

export interface ExerciseTarget {
  fourchetteRepsMin: number;
  fourchetteRepsMax: number;
  seriesCibles: number; // déjà ajusté par volume si applicable
  incrementsPossibles: number[]; // ex: [2.3, 4.5, 6.8] ou [2.5] par défaut
}

export interface SuggestedSets {
  charge: number;
  reps: number[]; // tableau de reps suggérées par série, ex: [7, 6, 6]
  fourchetteCompletee: boolean; // true si TOUTES les séries de la dernière session étaient à max
  messageProgression: string | null; // ex: "Fourchette complétée ! +2.5 kg → 82.5 kg"
}

export function computeNextSets(
  lastSession: LastSessionSets | null, // null = première fois
  target: ExerciseTarget,
): SuggestedSets {
  // Cas 1 : pas d'historique → charge 0, reps = min sur toutes les séries
  // (l'utilisateur devra saisir manuellement sa charge de départ)
  
  // Cas 2 : historique existant
  // Vérifier si TOUTES les séries sont à fourchetteRepsMax
  //   → OUI : fourchetteCompletee = true
  //           charge = dernière charge + premier incrément disponible
  //           reps = [min, min, min, ...]
  //   → NON : charge = même charge que dernière session
  //           Trouver la première série (par ordre) qui n'est pas à max
  //           → +1 rep sur cette série
  //           Les séries AVANT gardent leurs reps (déjà à max ou en cours)
  //           Les séries APRÈS gardent les reps de la dernière session
}
```

**Logique détaillée pour le cas "NON — pas toutes à max"** :

Exemple concret : fourchette 6-8, dernière session = [7, 6, 6]
- Série 1 : 7 (pas à 8) → c'est la première non-max → suggérer 8
- Série 2 : 6 → garder 6
- Série 3 : 6 → garder 6
- Résultat : [8, 6, 6]

Autre exemple : dernière = [8, 7, 6]
- Série 1 : 8 (à max) → OK
- Série 2 : 7 (pas à 8) → suggérer 8
- Série 3 : 6 → garder 6
- Résultat : [8, 8, 6]

#### Sous-étape 3.2 — Intégration dans l'écran de saisie de série

**Mission** : Modifier le composant de saisie de série (créé en Phase 1) pour pré-remplir via `computeNextSets`.

**Fichiers à modifier** :
- `src/components/session/SetInput.tsx` (ou le nom utilisé en Phase 1)
- `src/app/session/[sessionId]/page.tsx` (ou équivalent)

**Détail technique** :

Au chargement de chaque exercice dans la séance :
1. Appeler l'API `GET /api/set-logs?exerciseInstanceId=xxx&limit=last-session` pour récupérer les sets de la dernière SessionLog de cette ExerciseInstance
2. Appeler `computeNextSets(lastSession, target)` avec les paramètres du template
3. Pré-remplir les champs charge et reps avec les valeurs suggérées
4. Si `fourchetteCompletee === true`, afficher un badge vert "Fourchette complétée !" + la nouvelle charge suggérée
5. L'utilisateur peut toujours modifier manuellement (les suggestions sont des défauts, pas des contraintes)

**API route à créer** : `src/app/api/set-logs/last-session/route.ts`

```
GET /api/set-logs/last-session?exerciseInstanceId=xxx
```

Retourne les SetLogs de la dernière SessionLog qui contient cette ExerciseInstance, ordonnés par `numéro_série` ASC. Requête SQL :

```sql
SELECT sl.* FROM set_log sl
JOIN session_log sess ON sl.session_log_id = sess.id
WHERE sl.exercise_instance_id = $1
ORDER BY sess.date DESC, sl.numéro_série ASC
LIMIT 20 -- sécurité, jamais plus de 20 séries
```

Puis filtrer côté serveur pour ne garder que les sets du premier `session_log_id` retourné (= la session la plus récente).

#### Sous-étape 3.3 — Affichage de l'historique dernière séance

**Mission** : Afficher sous le nom de l'exercice un résumé compact de la dernière session sur cette ExerciseInstance exacte.

**Fichier à créer** : `src/components/session/LastSessionSummary.tsx`

**Détail technique** :

Composant affichant par exemple :
```
Dernière : 06/04 — 80 kg × 6/6/6 — RPE 8
```

Format : `[date courte] — [charge] kg × [reps séparées par /] — RPE [moy ou max]`

Affiché en texte gris clair (muted) sous le nom de l'exercice quand celui-ci est "en cours" dans la séance live.

**Check fonctionnel étape 3** :
- [ ] `computeNextSets` avec dernière session [6, 6, 6] fourchette 6-8 → suggère [7, 6, 6] même charge
- [ ] `computeNextSets` avec dernière session [8, 8, 8] fourchette 6-8, incréments [2.5] → suggère charge +2.5, reps [6, 6, 6], `fourchetteCompletee = true`
- [ ] `computeNextSets` avec `null` (pas d'historique) → reps = [min, min, min], charge = 0
- [ ] Ouvrir un exercice en séance → charge et reps pré-remplis automatiquement
- [ ] Badge "Fourchette complétée" visible quand applicable
- [ ] Historique "Dernière : 06/04 — 80 kg × 6/6/6" affiché sous le nom de l'exercice

---

### Étape 4 — Feu biologique du jour

**Objectif** : calculer le feu du jour (vert/orange/rouge) à partir du DailyState et l'afficher.

#### Sous-étape 4.1 — Fonction `computeFeuJour`

**Mission** : Implémenter le calcul du feu biologique du jour.

**Fichier à créer** : `src/lib/engine/feu-biologique.ts`

```typescript
export type FeuBiologique = 'vert' | 'orange' | 'rouge';

export interface FeuJourResult {
  feu: FeuBiologique;
  criteresSommeil: boolean;  // true = OK (≥ 6h)
  criteresEnergie: boolean;  // true = OK (≥ 7)
  criteresCourbatures: boolean; // true = OK (max < 5)
  nbEchecs: number;
}

export function computeFeuJour(state: DailyStateInput): FeuJourResult {
  const criteresSommeil = state.sommeilHeures >= 6;
  const criteresEnergie = state.energieDepart >= 7;
  const maxCourbature = state.courbatures.length > 0
    ? Math.max(...state.courbatures.map(c => c.intensite))
    : 0;
  const criteresCourbatures = maxCourbature < 5;

  const nbEchecs = [criteresSommeil, criteresEnergie, criteresCourbatures]
    .filter(c => !c).length;

  let feu: FeuBiologique;
  if (state.energieDepart <= 3) {
    feu = 'rouge'; // énergie ≤ 3 = rouge immédiat
  } else if (nbEchecs >= 2) {
    feu = 'rouge';
  } else if (nbEchecs === 1) {
    feu = 'orange';
  } else {
    feu = 'vert';
  }

  return { feu, criteresSommeil, criteresEnergie, criteresCourbatures, nbEchecs };
}
```

#### Sous-étape 4.2 — Composant FeuBiologique + stockage dans SessionLog

**Mission** : Afficher le feu du jour et le persister dans le SessionLog.

**Fichiers à créer** :
- `src/components/ui/FeuBiologique.tsx` — composant réutilisable (🟢🟡🔴 avec label)

**Fichiers à modifier** :
- Le composant `AdjustmentBanner.tsx` de l'étape 2 — ajouter le feu à côté de l'ajustement
- La logique de création de SessionLog (Phase 1) — stocker `feu_biologique_jour` calculé

**Détail technique du composant** :

```tsx
// src/components/ui/FeuBiologique.tsx
interface Props {
  feu: 'vert' | 'orange' | 'rouge';
  label?: string; // "Jour" ou "Tendance"
  size?: 'sm' | 'md' | 'lg';
}
```

Affiche un cercle coloré (vert = `bg-green-500`, orange = `bg-yellow-500`, rouge = `bg-red-500`) + texte du label. Taille `lg` = 48px pour le dashboard, `sm` = 24px pour les listes.

**Stockage** : quand le SessionLog est créé (au moment du "Valider → Voir la séance ajustée" ou au premier SetLog), écrire `feu_biologique_jour` avec la valeur calculée.

**Check fonctionnel étape 4** :
- [ ] `computeFeuJour({ sommeilHeures: 7, energieDepart: 8, courbatures: [] })` → `vert`
- [ ] `computeFeuJour({ sommeilHeures: 4, energieDepart: 8, courbatures: [] })` → `orange` (1 échec)
- [ ] `computeFeuJour({ sommeilHeures: 4, energieDepart: 5, courbatures: [{ muscle: 'Quads', intensite: 6 }] })` → `rouge` (2 échecs)
- [ ] `computeFeuJour({ sommeilHeures: 7, energieDepart: 3, courbatures: [] })` → `rouge` (énergie ≤ 3)
- [ ] Feu affiché dans le bandeau de séance active
- [ ] Feu stocké dans le SessionLog en base

---

### Étape 5 — Feu biologique de tendance

**Objectif** : calculer le feu de tendance post-séance à partir de l'historique des 3 dernières séances du même template.

#### Sous-étape 5.1 — Fonction `computeFeuTendance`

**Mission** : Analyser la progression sur les exercices piliers des 3 dernières séances du même template.

**Fichier à modifier** : `src/lib/engine/feu-biologique.ts` (ajouter dans le même fichier)

```typescript
export interface SessionPilierPerf {
  exerciseInstanceId: string;
  exerciseName: string;
  categorieRole: 'pilier' | 'substitut' | 'accessoire';
  // Métrique de comparaison : volume total = somme(charge × reps) par exo
  volumeTotal: number;
  // Ou alternativement : 1RM estimé = charge × (1 + reps/30) pour la meilleure série
  estimated1RM: number;
}

export interface FeuTendanceInput {
  // Les 3 dernières sessions du MÊME template (A, B ou C), la plus récente en premier
  sessions: Array<{
    date: string;
    feuJour: FeuBiologique;
    pilierPerfs: SessionPilierPerf[]; // uniquement les exercices piliers
  }>;
}

export interface FeuTendanceResult {
  feu: FeuBiologique;
  raison: string;
  contexteNormal: boolean; // au moins 2/3 sessions avaient feu jour vert
}

export function computeFeuTendance(input: FeuTendanceInput): FeuTendanceResult {
  // Si < 3 sessions disponibles → retourner 'vert' avec raison "Pas assez de données"
  
  // Étape 1 : déterminer le contexte
  // contexteNormal = au moins 2 des 3 sessions avaient feuJour === 'vert'
  
  // Étape 2 : pour chaque pilier présent dans les 3 sessions,
  //   comparer le estimated1RM de la session la plus récente vs la plus ancienne
  //   - hausse (> 0) = progression
  //   - identique (=== 0) = stagnation
  //   - baisse (< 0) = régression
  
  // Étape 3 : calculer le feu
  // - Progression sur ≥ 50% des piliers → vert
  // - Stagnation (pas de prog, pas de régression) → orange
  // - Régression sur ≥ 1 pilier ET contexteNormal → rouge
  // - Régression sur ≥ 1 pilier ET contexte PAS normal → orange
  //   (la régression est expliquée par la fatigue de vie, pas un vrai plateau)
}
```

**Calcul du estimated1RM** (formule d'Epley simplifiée) :

```typescript
function estimated1RM(charge: number, reps: number): number {
  if (reps <= 0 || charge <= 0) return 0;
  if (reps === 1) return charge;
  return charge * (1 + reps / 30);
}
```

Pour chaque exercice pilier dans une session, prendre la série avec le 1RM estimé le plus élevé.

#### Sous-étape 5.2 — API pour récupérer l'historique de tendance

**Mission** : Créer une route qui retourne les données nécessaires au calcul du feu de tendance.

**Fichier à créer** : `src/app/api/sessions/tendency/route.ts`

```
GET /api/sessions/tendency?seanceTemplateId=xxx&limit=3
```

Retourne les N dernières SessionLogs pour ce template, avec pour chacune :
- `date`, `feu_biologique_jour`
- Les SetLogs des exercices piliers uniquement (jointure sur `exercise.categorie_role = 'pilier'`)

#### Sous-étape 5.3 — Intégration dans l'écran de fin de séance

**Mission** : Modifier l'écran de fin de séance (créé en Phase 1) pour afficher le feu de tendance calculé et le stocker.

**Fichiers à modifier** :
- `src/app/session/[sessionId]/end/page.tsx` (ou équivalent Phase 1)

À la fin de séance :
1. Appeler l'API tendency pour les 3 dernières sessions de ce template (inclure la session actuelle)
2. Calculer `computeFeuTendance`
3. Afficher le feu de tendance à côté du feu du jour
4. Stocker `feu_biologique_tendance` dans le SessionLog (UPDATE)

**Check fonctionnel étape 5** :
- [ ] `computeFeuTendance` avec < 3 sessions → retourne `vert` + "Pas assez de données"
- [ ] 3 sessions avec progression sur 2/3 piliers → `vert`
- [ ] 3 sessions avec stagnation partout, contexte normal → `orange`
- [ ] 3 sessions avec régression 1 pilier, contexte normal → `rouge`
- [ ] 3 sessions avec régression 1 pilier, contexte dégradé (2+ feux jour orange/rouge) → `orange` (pas rouge)
- [ ] Feu de tendance affiché à l'écran fin de séance
- [ ] Feu de tendance stocké dans SessionLog

---

### Étape 6 — Système d'alertes

**Objectif** : générer des alertes automatiques basées sur l'état du programme.

#### Sous-étape 6.1 — Fonction `computeAlerts`

**Mission** : Centraliser toute la logique d'alertes dans une fonction pure.

**Fichier à créer** : `src/lib/engine/alerts.ts`

```typescript
export type AlertType = 'fourchette_completee' | 'deload_recommande' | 'stagnation' | 'tendance_rouge';
export type AlertTiming = 'pre_seance' | 'post_seance';

export interface Alert {
  type: AlertType;
  timing: AlertTiming;
  exerciseName?: string;
  message: string;
  actionLabel?: string; // ex: "Augmenter à 82.5 kg ?"
  priority: 'info' | 'warning' | 'danger';
}

export interface AlertsInput {
  // Pour fourchette_completee :
  completedRanges: Array<{
    exerciseName: string;
    currentCharge: number;
    nextCharge: number; // calculé via incrementsPossibles
  }>;
  // Pour deload_recommande :
  semainesSansDeload: number; // compter depuis le dernier bloc de type 'deload'
  // Pour stagnation :
  stagnations: Array<{
    exerciseName: string;
    semainesSansProgression: number; // basé sur estimated1RM constant sur N sessions
    contexteNormal: boolean;
  }>;
  // Pour tendance_rouge :
  feuTendance: FeuBiologique | null;
}

export function computeAlerts(input: AlertsInput): Alert[] {
  const alerts: Alert[] = [];

  // Fourchette complétée (post-séance)
  for (const cr of input.completedRanges) {
    alerts.push({
      type: 'fourchette_completee',
      timing: 'post_seance',
      exerciseName: cr.exerciseName,
      message: `Fourchette complétée sur ${cr.exerciseName}. +${cr.nextCharge - cr.currentCharge} kg la prochaine fois ?`,
      actionLabel: `Passer à ${cr.nextCharge} kg`,
      priority: 'info',
    });
  }

  // Deload recommandé (pré-séance)
  if (input.semainesSansDeload >= 5) {
    alerts.push({
      type: 'deload_recommande',
      timing: 'pre_seance',
      message: `Pas de deload depuis ${input.semainesSansDeload} semaines. Deload conseillé.`,
      priority: 'warning',
    });
  }

  // Stagnation (pré-séance)
  for (const stag of input.stagnations) {
    if (stag.semainesSansProgression >= 2 && stag.contexteNormal) {
      alerts.push({
        type: 'stagnation',
        timing: 'pre_seance',
        exerciseName: stag.exerciseName,
        message: `Pas de progression sur ${stag.exerciseName} depuis ${stag.semainesSansProgression} semaines. Revoir nutrition/sommeil ou changer d'exo ?`,
        priority: 'warning',
      });
    }
  }

  // Tendance rouge (post-séance)
  if (input.feuTendance === 'rouge') {
    alerts.push({
      type: 'tendance_rouge',
      timing: 'post_seance',
      message: 'Tendance à la baisse. Deload recommandé.',
      priority: 'danger',
    });
  }

  return alerts;
}
```

#### Sous-étape 6.2 — API alertes + collecte des données

**Mission** : Créer une route API qui agrège les données nécessaires et retourne les alertes.

**Fichier à créer** : `src/app/api/alerts/route.ts`

```
GET /api/alerts?timing=pre_seance&seanceTemplateId=xxx
GET /api/alerts?timing=post_seance&sessionLogId=xxx
```

Pour `pre_seance` :
1. Compter les semaines depuis le dernier ProgrammeBloc de type `deload` (ou depuis `date_début` du bloc actif si aucun deload)
2. Pour chaque pilier du template : comparer les 2-3 dernières sessions pour détecter stagnation (1RM estimé identique ± 1%)
3. Appeler `computeAlerts` et retourner

Pour `post_seance` :
1. Analyser les SetLogs de la session pour détecter les fourchettes complétées (via `computeNextSets`)
2. Récupérer le feu de tendance calculé en étape 5
3. Appeler `computeAlerts` et retourner

#### Sous-étape 6.3 — Composant AlertCard + intégration

**Mission** : Afficher les alertes aux bons moments.

**Fichiers à créer** :
- `src/components/alerts/AlertCard.tsx` — card individuelle
- `src/components/alerts/AlertList.tsx` — liste empilée

**Fichiers à modifier** :
- Écran de fin de séance — afficher les alertes post-séance
- Page de démarrage de séance (après DailyState) — afficher les alertes pré-séance

**Détail** : chaque AlertCard utilise les variants shadcn Alert (`default` pour info, `destructive` pour danger). Le `actionLabel` est un bouton (pour l'instant non fonctionnel — juste visuel. L'action sera branchée en Phase 3).

**Check fonctionnel étape 6** :
- [ ] `computeAlerts` avec une fourchette complétée → alerte "Fourchette complétée" avec la bonne charge
- [ ] `computeAlerts` avec 5 semaines sans deload → alerte "Deload conseillé"
- [ ] `computeAlerts` avec stagnation 2 semaines contexte normal → alerte stagnation
- [ ] Alertes pré-séance affichées après validation du DailyState
- [ ] Alertes post-séance affichées à l'écran de fin de séance

---

### Étape 7 — Substitutions déterministes

**Objectif** : proposer des exercices de remplacement filtrés par pilier + profil de tension + salle.

#### Sous-étape 7.1 — Fonction `findSubstitutes`

**Mission** : Filtrer la bibliothèque d'exercices pour trouver des substituts compatibles.

**Fichier à créer** : `src/lib/engine/substitutions.ts`

```typescript
export interface SubstitutionCriteria {
  pilier: string; // ex: 'P1_poussee'
  profilTension: string; // ex: 'stretch'
  gymId: string;
  excludeExerciseIds: string[]; // exos déjà dans le template (éviter doublons)
  musclesAvecCourbatures?: string[]; // muscles à éviter si courbatures > 7
}

export interface SubstituteResult {
  exerciseInstanceId: string;
  exerciseName: string;
  machineName: string | null;
  categorieRole: 'pilier' | 'substitut' | 'accessoire';
  profilTension: string;
}

export function findSubstitutes(
  allInstances: ExerciseInstanceWithExercise[], // toutes les instances disponibles
  criteria: SubstitutionCriteria,
): SubstituteResult[] {
  // Filtrer par :
  // 1. Même pilier
  // 2. Même profil de tension (ou compatible : mi_range est compatible avec tout)
  // 3. Même salle (gymId)
  // 4. Pas dans excludeExerciseIds
  // 5. Si musclesAvecCourbatures fourni : exclure les exos ciblant ces muscles
  // Trier par : catégorie_rôle (pilier > substitut > accessoire)
  // Retourner max 5 résultats
}
```

#### Sous-étape 7.2 — Composant + modale de substitution

**Mission** : Ajouter un bouton "Remplacer" sur chaque exercice dans la séance active.

**Fichiers à créer** :
- `src/components/session/SubstitutionModal.tsx`

**Détail** : modale shadcn Sheet (bottom sheet sur mobile). Affiche la liste des substituts avec : nom, machine, profil de tension, badge pilier/sub/acc. Au tap sur un substitut → remplace l'exercice dans la séance en cours (dans le state Zustand). L'ExerciseInstance d'origine est notée comme "substituée" dans le SessionLog (champ `notes_séance`).

**Fichiers à modifier** :
- Le composant d'exercice en cours dans la séance live — ajouter bouton "Remplacer" (icône swap)

**Check fonctionnel étape 7** :
- [ ] `findSubstitutes` avec pilier P1 + stretch + salle Lalande → retourne les Pec Fly, Cable Crossover etc.
- [ ] `findSubstitutes` avec pilier P1 + stretch + salle Sesquière → résultats différents (si instances différentes)
- [ ] Bouton "Remplacer" visible sur chaque exercice en séance
- [ ] Modal affiche les substituts filtrés
- [ ] Sélection d'un substitut → exercice remplacé dans la séance

---

### Étape 8 — Dashboard

**Objectif** : page d'accueil fonctionnelle avec les informations clés.

#### Sous-étape 8.1 — Layout dashboard + cards

**Mission** : Créer la page d'accueil avec les cards principales.

**Fichier à créer** : `src/app/dashboard/page.tsx`

**Fichiers à créer** :
- `src/components/dashboard/NextSessionCard.tsx`
- `src/components/dashboard/FeuBioCard.tsx`
- `src/components/dashboard/AlertsCard.tsx`
- `src/components/dashboard/WeightSparkline.tsx`

**Détail de chaque card** :

**Header** : "Salut Sacha" + poids actuel (dernier BodyWeight) + "Bloc 1 / Cycle 1 Mécanique / Semaine X"

**Card "Prochaine séance"** :
- Lettre du prochain template (A/B/C) basé sur le dernier SessionLog. Logique : si dernier = A → prochain = B ; si B → C ; si C → A. Si aucun SessionLog dans le bloc actif → A.
- Date prévue : aujourd'hui si pas de séance aujourd'hui, sinon demain (heuristique simple)
- Bouton "Démarrer" → redirige vers `/session/daily-state`

**Card "Feu biologique"** :
- Feu du jour : affiché si un DailyState existe pour aujourd'hui, sinon "Non renseigné"
- Feu de tendance : dernier feu de tendance stocké dans le SessionLog le plus récent
- Utilise le composant `FeuBiologique.tsx` de l'étape 4

**Card "Alertes"** :
- Appel `GET /api/alerts?timing=pre_seance&seanceTemplateId=nextTemplateId`
- Affiche les 3 premières alertes, lien "Voir tout" si plus

**WeightSparkline** :
- Récupère les BodyWeight des 30 derniers jours
- Affiche un sparkline minimal (SVG inline ou bibliothèque légère type `recharts` si déjà dans les dépendances)
- Ligne + point pour le dernier poids

#### Sous-étape 8.2 — API agrégation dashboard

**Mission** : Créer une route API qui retourne toutes les données du dashboard en un seul appel.

**Fichier à créer** : `src/app/api/dashboard/route.ts`

```
GET /api/dashboard
```

Retourne :
```typescript
{
  user: { nom: string; poidsActuel: number | null },
  blocActif: { nom: string; typeCycle: string; semaineActuelle: number } | null,
  prochaineSeance: { lettre: string; templateId: string; templateNom: string },
  feuJour: FeuBiologique | null, // du DailyState d'aujourd'hui
  feuTendance: FeuBiologique | null, // du dernier SessionLog
  alertesPreSeance: Alert[],
  poids30jours: Array<{ date: string; poids: number }>,
}
```

Ceci évite N appels séparés au chargement du dashboard.

#### Sous-étape 8.3 — Redirection page d'accueil

**Mission** : Faire en sorte que `/` redirige vers `/dashboard`.

**Fichier à modifier** : `src/app/page.tsx` — redirect vers `/dashboard` (ou renommer directement).

**Check fonctionnel étape 8** :
- [ ] Ouvrir `/dashboard` → header avec nom, poids, bloc/cycle/semaine affichés
- [ ] Card "Prochaine séance" affiche la bonne lettre (B si la dernière séance était A)
- [ ] Bouton "Démarrer" redirige vers `/session/daily-state`
- [ ] Card "Feu biologique" affiche les feux ou "Non renseigné"
- [ ] Card "Alertes" affiche les alertes pré-séance (ex: deload si > 5 semaines)
- [ ] Sparkline poids visible avec les données seed
- [ ] Tout en thème sombre, mobile-first, zones tactiles 48px+

---

### Étape 9 — Intégration du flux complet DailyState → Séance ajustée → Fin

**Objectif** : câbler le parcours bout en bout pour que toutes les pièces fonctionnent ensemble.

#### Sous-étape 9.1 — Flux de démarrage de séance

**Mission** : Relier le DailyState → calcul ajustement → création SessionLog → affichage séance ajustée.

**Fichiers à modifier** :
- `src/app/session/start/page.tsx` (ou équivalent) — la page vers laquelle on redirige après validation du DailyState

**Logique** :

1. Lire le `dailyStateId` et `date` depuis les query params
2. Récupérer le DailyState depuis l'API
3. Déterminer le prochain template (même logique que dashboard)
4. Récupérer les exercices du template avec jointures (exercise + instance + gym)
5. Appeler `computeVolumeAdjustment(dailyState, musclesCibles)`
6. Appeler `applyVolumeAdjustment(templateExercises, adjustment)`
7. Appeler `computeFeuJour(dailyState)`
8. Créer le SessionLog en base avec : `daily_state_id`, `seance_template_id`, `gym_id`, `feu_biologique_jour`, `volume_ajusté_pct`, `volume_ajusté_raison`
9. Rediriger vers `/session/[sessionId]` avec la séance pré-remplie

#### Sous-étape 9.2 — Flux de fin de séance enrichi

**Mission** : Ajouter les calculs Phase 2 à l'écran de fin de séance existant.

**Fichiers à modifier** :
- `src/app/session/[sessionId]/end/page.tsx`

**Ajouts** :
1. Calcul et affichage du feu de tendance (étape 5)
2. Résumé des progressions : pour chaque exercice, delta de 1RM estimé vs dernière séance
3. Détection des fourchettes complétées via `computeNextSets` sur chaque exercice
4. Affichage des alertes post-séance (étape 6)
5. Stocker `feu_biologique_tendance` et `énergie_fin` dans le SessionLog (UPDATE)

**Résumé des progressions** — composant `src/components/session/ProgressionSummary.tsx` :

Pour chaque exercice de la séance :
- Calculer le 1RM estimé de la meilleure série de cette session
- Comparer au 1RM estimé de la meilleure série de la session précédente sur la même ExerciseInstance
- Afficher : `Lying Chest Press: 80×6 → 80×7 (+1 rep) ↑` ou `Hack Squat: 20×8 → 20×8 (=)` 
- Couleur : vert si progression, gris si stable, rouge si régression

**Check fonctionnel étape 9** :
- [ ] Parcours complet : Dashboard → Démarrer → DailyState (sommeil 4h) → Séance ajustée avec bandeau "-25%" + feu orange → Saisie séries → Fin de séance avec feu tendance + progressions + alertes
- [ ] Parcours complet : Dashboard → Démarrer → DailyState (tout OK) → Séance normale sans bandeau + feu vert → Saisie → Fin
- [ ] Les charges sont pré-remplies par double progression sur chaque exercice
- [ ] Les séries des accessoires sont réduites quand l'ajustement est actif
- [ ] Les séries des piliers ne sont JAMAIS réduites
- [ ] Le SessionLog final contient : feu jour, feu tendance, volume ajusté %, énergie fin

---

## Check final de phase

- [ ] **Flux complet testable sur mobile** : Dashboard → État du jour → Séance ajustée → Saisie série par série avec pré-remplissage → Fin de séance avec feux + alertes + progressions
- [ ] **Double progression fonctionnelle** : les charges/reps suggérées suivent exactement l'algorithme décrit (pas de surprise)
- [ ] **Ajustements automatiques** : sommeil 4h → volume -25% visible, jeûne → -15%, cumul plafonné à -40%, piliers intacts
- [ ] **Feu biologique jour** : calculé correctement depuis le DailyState, affiché et stocké
- [ ] **Feu biologique tendance** : calculé post-séance sur les 3 dernières sessions du même template, tient compte du contexte
- [ ] **Alertes** : fourchette complétée, deload, stagnation, tendance rouge — affichées au bon moment
- [ ] **Substitutions** : modal fonctionnelle avec filtres pilier/tension/salle, remplacement effectif en séance
- [ ] **Dashboard** : toutes les cards affichées avec données réelles (pas de mock)
- [ ] **Aucune régression Phase 1** : CRUD exercices, saisie basique, historique, poids corporel, PWA — tout fonctionne encore
- [ ] **Thème sombre + mobile-first** : tous les nouveaux écrans sont en dark mode, zones tactiles ≥ 48px, text ≥ 16px
