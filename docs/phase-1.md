# Phase 1 — Fondations + saisie de séance

## Objectif de la phase

Mettre en place le squelette technique complet (Next.js + Supabase + Drizzle + PWA) et permettre la saisie d'une séance de bout en bout sur mobile, avec le bon modèle de données. Pas d'intelligence métier (ajustements auto, feu biologique, double progression) — uniquement la fondation et la saisie brute.

---

## Étapes

### Étape 1 — Initialisation du projet et stack

**Objectif** : avoir un projet Next.js 14 fonctionnel avec toutes les dépendances de base, Tailwind, shadcn/ui, et un thème sombre par défaut.

#### Sous-étape 1.1 — Création du projet Next.js

**Mission** : Initialiser un projet Next.js 14 (App Router) en TypeScript strict, avec Tailwind CSS préconfiguré.

**Commandes à exécuter** :
```bash
npx create-next-app@latest app-sport-perso --typescript --tailwind --app --src-dir --eslint --no-import-alias
cd app-sport-perso
```

Répondre aux prompts : `Yes` pour App Router, `src/` directory, `@/*` import alias.

**Fichiers à créer/modifier** :
- `tsconfig.json` : forcer `"strict": true`, `"noUncheckedIndexedAccess": true`, `"noImplicitAny": true`
- `next.config.mjs` : ajouter `reactStrictMode: true`
- `.env.local` : créer le fichier vide (sera rempli plus tard)
- `.env.example` : créer avec les clés attendues : `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

#### Sous-étape 1.2 — Installation des dépendances de base

**Mission** : Installer toutes les dépendances qui seront utilisées en Phase 1.

**Commandes à exécuter** :
```bash
npm install drizzle-orm postgres @supabase/supabase-js
npm install zustand react-hook-form @hookform/resolvers zod
npm install date-fns clsx tailwind-merge lucide-react
npm install -D drizzle-kit @types/node tsx dotenv
```

#### Sous-étape 1.3 — Setup shadcn/ui + thème sombre par défaut

**Mission** : Initialiser shadcn/ui, configurer le thème sombre OLED par défaut (pas de toggle), installer les composants de base nécessaires.

**Commandes à exécuter** :
```bash
npx shadcn@latest init
```

Répondre : style `Default`, base color `Zinc`, CSS variables `Yes`.

```bash
npx shadcn@latest add button input label card dialog drawer select slider switch toast sonner badge separator skeleton
```

**Fichiers à créer/modifier** :
- `src/app/layout.tsx` : forcer la classe `dark` sur `<html>`, fond `bg-black text-white`, viewport meta `width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no`
- `src/app/globals.css` : surcharger les variables CSS shadcn pour OLED (`--background: 0 0% 0%`)

**Détail technique** — `src/app/layout.tsx` :
```tsx
export const metadata = {
  title: "Sport Perso",
  description: "Suivi de musculation perso",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  userScalable: false,
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="dark">
      <body className="bg-black text-white min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
```

#### Sous-étape 1.4 — Structure de dossiers

**Mission** : Créer la structure de dossiers complète qui servira pour toute la Phase 1.

**Fichiers/dossiers à créer** (vides ou avec un index) :
```
src/
├── app/
│   ├── (app)/
│   │   ├── layout.tsx           # layout avec navigation bottom mobile
│   │   ├── page.tsx              # dashboard
│   │   ├── exercises/
│   │   ├── sessions/
│   │   ├── gyms/
│   │   ├── bodyweight/
│   │   └── settings/
│   └── api/
├── components/
│   ├── ui/                        # shadcn (déjà créé)
│   ├── layout/
│   ├── exercises/
│   ├── sessions/
│   ├── gyms/
│   └── bodyweight/
├── db/
│   ├── schema.ts
│   ├── client.ts
│   └── migrations/
├── lib/
│   ├── utils.ts                   # déjà créé par shadcn
│   ├── constants.ts
│   └── types.ts
├── hooks/
├── stores/
└── scripts/
    └── seed.ts
```

**Check fonctionnel étape 1** :
- [ ] `npm run dev` lance le serveur sans erreur, page d'accueil accessible sur `http://localhost:3000`
- [ ] La page s'affiche en thème sombre (fond noir) sur mobile (DevTools responsive)
- [ ] `npx tsc --noEmit` ne renvoie aucune erreur
- [ ] Un composant shadcn (`<Button>` par exemple) s'affiche correctement sur la page d'accueil de test

---

### Étape 2 — Base de données : Supabase + schéma Drizzle complet

**Objectif** : avoir un projet Supabase opérationnel et le schéma Drizzle complet correspondant à la vision globale, avec migrations appliquées.

#### Sous-étape 2.1 — Création du projet Supabase

**Mission** : Créer un projet Supabase et récupérer les clés de connexion.

**Étapes manuelles** (à faire par l'utilisateur, pas par l'agent) :
1. Créer un projet sur https://supabase.com
2. Récupérer dans Settings → API : `Project URL`, `anon public key`, `service_role key`
3. Récupérer dans Settings → Database : `Connection string` (mode `Transaction`, port 6543) pour `DATABASE_URL`
4. Renseigner ces valeurs dans `.env.local`

**Fichiers à créer/modifier** :
- `.env.local` : remplir les 4 variables

#### Sous-étape 2.2 — Schéma Drizzle complet

**Mission** : Créer le fichier `src/db/schema.ts` avec TOUTES les tables de la vision globale (sauf `SessionIncident` qui est Phase 4 et `CoachConversation`/`CoachMessage` qui sont Phase 4).

**Fichiers à créer/modifier** :
- `src/db/schema.ts`
- `src/db/client.ts`
- `drizzle.config.ts`

**Détail technique — `drizzle.config.ts`** :
```ts
import type { Config } from "drizzle-kit";
import "dotenv/config";

export default {
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config;
```

**Détail technique — `src/db/client.ts`** :
```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
export const db = drizzle(client, { schema });
```

**Détail technique — `src/db/schema.ts`** : créer les tables suivantes en utilisant `pgTable`, avec les types Drizzle appropriés. Toutes les tables ont une PK `id` en `uuid` (`defaultRandom()`) et des timestamps `createdAt` / `updatedAt` (`defaultNow()`). Toutes les tables métier ont une FK `userId` (même si l'auth est mockée en Phase 1).

Tables à créer :

1. **`users`** : `id`, `email` (unique), `nom`, `dateNaissance` (date), `taille` (integer cm), `phaseNutritionnelle` (text enum : `seche` / `maintien` / `lean_bulk`), `objectifChiffre` (text), `dateCible` (date), `prefSalleParDefautId` (uuid nullable, FK gyms), timestamps.

2. **`gyms`** : `id`, `userId` (FK users), `nom`, `horairesOuverture` (text), `est24h` (boolean), `notes` (text), timestamps.

3. **`exercises`** : `id`, `userId` (FK), `nom`, `pilier` (text enum : `P1_poussee` / `P2_tirage` / `P3_squat` / `P4_hanche` / `epaules` / `bras_biceps` / `bras_triceps` / `jambes_iso` / `core`), `profilTension` (text enum : `stretch` / `contract` / `mi_range`), `type` (text enum : `polyarticulaire` / `isolation`), `categorieRole` (text enum : `pilier` / `substitut` / `accessoire`), `musclesPrincipaux` (jsonb : `string[]`), timestamps.

4. **`exerciseInstances`** : `id`, `userId` (FK), `exerciseId` (FK exercises), `gymId` (FK gyms), `machineNom` (text), `typePoulie` (text enum : `simple` / `double` / `na`), `conventionCharge` (text enum : `disques_ajoutes` / `pile_affichee` / `poids_total`), `incrementsPossibles` (jsonb : `number[]`), `poidsNonCompte` (real, nullable), `notesMachine` (text), timestamps.

5. **`programmeBlocs`** : `id`, `userId` (FK), `nom`, `dateDebut` (date), `dateFinPrevue` (date, nullable), `typeCycle` (text enum : `mecanique` / `metabolique` / `overreach` / `deload`), `semaineActuelle` (integer), `actif` (boolean), timestamps.

6. **`seanceTemplates`** : `id`, `blocId` (FK programmeBlocs), `lettre` (text : `A` / `B` / `C` / `D`), `nom`, `ordreDansSemaine` (integer), timestamps.

7. **`exerciseInTemplate`** : `id`, `seanceTemplateId` (FK), `exerciseInstanceId` (FK), `ordre` (integer), `seriesCibles` (integer), `fourchetteRepsMin` (integer), `fourchetteRepsMax` (integer), `rpeCible` (real), `tempo` (text), `reposSecondes` (integer), `notes` (text), timestamps.

8. **`dailyStates`** : `id`, `userId` (FK), `date` (date), `sommeilHeures` (real), `jeuneBool` (boolean), `shiftRecentBool` (boolean), `shiftType` (text enum : `jour` / `nuit` / `aucun`), `energieDepart` (integer 1-10), `courbatures` (jsonb : `[{muscle: string, intensite: number}]`), `dernierRepasHeure` (text, nullable, format `HH:MM`), `horaireSeancePrevu` (text, nullable, format `HH:MM`), timestamps. **Contrainte unique sur `(userId, date)`**.

9. **`sessionLogs`** : `id`, `userId` (FK), `seanceTemplateId` (FK, nullable), `dailyStateId` (FK dailyStates, nullable), `date` (date), `gymId` (FK gyms), `dureeMinutes` (integer, nullable), `energieFin` (integer 0-100, nullable), `feuBiologiqueJour` (text enum : `vert` / `orange` / `rouge`, nullable), `feuBiologiqueTendance` (text, nullable), `volumeAjustePct` (integer, nullable), `volumeAjusteRaison` (text, nullable), `notesSeance` (text), timestamps.

10. **`setLogs`** : `id`, `sessionLogId` (FK), `exerciseInstanceId` (FK), `numeroSerie` (integer), `repsEffectuees` (integer), `charge` (real), `rpeEffectif` (real, nullable), `tempoRespecte` (boolean, nullable), `reposReelSecondes` (integer, nullable), `notes` (text), timestamps.

11. **`bodyWeights`** : `id`, `userId` (FK), `date` (date), `poids` (real), `notes` (text), timestamps. **Contrainte unique sur `(userId, date)`**.

Exporter tous les types inférés :
```ts
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
// ... pour chaque table
```

#### Sous-étape 2.3 — Génération et application de la migration

**Mission** : Générer la première migration Drizzle et l'appliquer sur Supabase.

**Commandes à exécuter** :
```bash
npx drizzle-kit generate
npx drizzle-kit push
```

Vérifier dans le dashboard Supabase (Table Editor) que toutes les tables sont créées avec les bonnes colonnes.

**Check fonctionnel étape 2** :
- [ ] `npx drizzle-kit push` s'exécute sans erreur
- [ ] Dans Supabase Table Editor, les 11 tables sont visibles avec leurs colonnes
- [ ] Les FK et contraintes uniques sont bien posées (vérifiable dans le SQL editor : `\d table_name`)
- [ ] `npx tsc --noEmit` ne renvoie aucune erreur sur le schema

---

### Étape 3 — Script de seed

**Objectif** : remplir la base avec les données réelles de Sacha à partir des fichiers `.md` de référence.

#### Sous-étape 3.1 — Constantes et user mock

**Mission** : Créer un fichier de constantes contenant le `userId` mocké pour la Phase 1 (avant l'auth Supabase qui arrivera en Phase 3).

**Fichiers à créer/modifier** :
- `src/lib/constants.ts`

**Détail technique** :
```ts
// Phase 1 : un seul user hardcodé. Sera remplacé par auth Supabase en Phase 3.
export const MOCK_USER_ID = "00000000-0000-0000-0000-000000000001";
export const MOCK_USER_EMAIL = "sacha@local";
```

#### Sous-étape 3.2 — Script de seed exhaustif

**Mission** : Écrire `src/scripts/seed.ts` qui insère :
1. Le user Sacha
2. Les 2 gyms (Lalande, Sesquière)
3. Les ~30 exercices de `exercise-library.md` (avec pilier, profil tension, rôle, type)
4. Les ExerciseInstances pour Lalande (machines connues + incréments)
5. Le Bloc 1 / Cycle 1 Mécanique actif
6. 3 SeanceTemplates A/B/C avec leurs ExerciseInTemplate (basés sur la structure hebdomadaire de `coach-sacha.md`)
7. Le SessionLog du 06/04/2026 + tous ses SetLogs (séance A nouveau format, sommeil 4h, volume -25%)
8. Le SessionLog du 04/04/2026 + ses SetLogs (séance B ancien format, sans DailyState)
9. Le BodyWeight initial : 90,55 kg au 05/04/2026

**Fichiers à créer/modifier** :
- `src/scripts/seed.ts`
- `package.json` : ajouter le script `"seed": "tsx src/scripts/seed.ts"`

**Détail technique** : le script doit être idempotent (TRUNCATE des tables avant insertion, sauf `users` qui utilise un `onConflictDoNothing`). Charger les variables d'env via `dotenv/config` en haut du fichier. Utiliser le `db` exporté de `src/db/client.ts`.

Structure du fichier :
```ts
import "dotenv/config";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import { MOCK_USER_ID, MOCK_USER_EMAIL } from "@/lib/constants";
import { sql } from "drizzle-orm";

async function main() {
  // 1. Reset (sauf users)
  await db.execute(sql`TRUNCATE TABLE
    set_logs, session_logs, daily_states,
    exercise_in_template, seance_templates, programme_blocs,
    exercise_instances, exercises, gyms, body_weights
    RESTART IDENTITY CASCADE`);

  // 2. User
  await db.insert(s.users).values({
    id: MOCK_USER_ID,
    email: MOCK_USER_EMAIL,
    nom: "Sacha",
    dateNaissance: "2001-02-22",
    taille: 193,
    phaseNutritionnelle: "seche",
    objectifChiffre: "93 kg masse propre été 2026",
    dateCible: "2026-08-01",
  }).onConflictDoNothing();

  // 3. Gyms
  const [lalande, sesquiere] = await db.insert(s.gyms).values([
    { userId: MOCK_USER_ID, nom: "BasicFit Lalande", horairesOuverture: "ferme 22h", est24h: false, notes: "Proche domicile, défaut" },
    { userId: MOCK_USER_ID, nom: "BasicFit Sesquière", horairesOuverture: "24/24", est24h: true, notes: "Tardives, jours fériés" },
  ]).returning();

  // 4. Exercises (extraire de exercise-library.md)
  // 5. Instances (au moins toutes celles présentes dans lift-log.md pour Lalande)
  // 6. Bloc + Templates + ExerciseInTemplate
  // 7. SessionLogs historiques + SetLogs
  // 8. BodyWeight

  console.log("✅ Seed terminé");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

**Données à insérer pour les exercices** (liste minimale exigée, à compléter depuis `exercise-library.md`) :

| nom | pilier | profilTension | type | categorieRole |
|---|---|---|---|---|
| Lying Machine Chest Press | P1_poussee | mi_range | polyarticulaire | pilier |
| Bench Press Barre | P1_poussee | mi_range | polyarticulaire | pilier |
| Seated Pec Fly | P1_poussee | stretch | isolation | accessoire |
| Seated Row Machine | P2_tirage | mi_range | polyarticulaire | pilier |
| Wide-Grip Seated Cable Row | P2_tirage | mi_range | polyarticulaire | substitut |
| Close-Grip Front Lat Pulldown | P2_tirage | stretch | polyarticulaire | accessoire |
| Wide Stance Hack Squat (Matrix Perfect Squat) | P3_squat | stretch | polyarticulaire | pilier |
| Hack Squat Machine | P3_squat | stretch | polyarticulaire | pilier |
| Leg Press | P3_squat | stretch | polyarticulaire | pilier |
| Seated Leg Extension | jambes_iso | contract | isolation | accessoire |
| Romanian Deadlift | P4_hanche | stretch | polyarticulaire | pilier |
| Hip Thrust Barre | P4_hanche | contract | polyarticulaire | pilier |
| Seated Leg Curl | jambes_iso | contract | isolation | accessoire |
| Standing Military Press Machine | epaules | mi_range | polyarticulaire | pilier |
| Machine Lateral Raise | epaules | contract | isolation | accessoire |
| Cable Lateral Raise | epaules | stretch | isolation | accessoire |
| Face Pull Cable | epaules | contract | isolation | accessoire |
| EZ-Bar Preacher Curl | bras_biceps | contract | isolation | accessoire |
| Incline DB Twist Curl | bras_biceps | stretch | isolation | accessoire |
| Overhead Cable Triceps Extension | bras_triceps | stretch | isolation | accessoire |
| Triceps Pushdown | bras_triceps | contract | isolation | accessoire |
| Pallof Press | core | mi_range | isolation | accessoire |
| Back Extension | P4_hanche | mi_range | polyarticulaire | substitut |

**Données à insérer pour les ExerciseInstances Lalande** :

| exercise | machineNom | typePoulie | conventionCharge | incrementsPossibles | poidsNonCompte |
|---|---|---|---|---|---|
| Lying Machine Chest Press | Lying Machine Chest Press | na | pile_affichee | [5] | null |
| Wide Stance Hack Squat | Matrix Perfect Squat | na | disques_ajoutes | [2.5, 5, 10, 15, 20] | 30.4 |
| Seated Pec Fly | Seated Pec Fly réglage 1 | na | pile_affichee | [5] | null |
| Machine Lateral Raise | Machine Lateral Raise Lalande | na | pile_affichee | [6] | null |
| Overhead Cable Triceps Extension | Cable poulie simple | simple | pile_affichee | [2.3, 4.5, 6.8, 9, 11.3, 13.5] | null |
| Pallof Press | Cable poulie simple | simple | pile_affichee | [2.3, 4.5, 6.8, 9, 11.3, 13.5] | null |
| Standing Military Press Machine | Standing Military Press | na | pile_affichee | [5] | null |
| Wide-Grip Seated Cable Row | Cable Row | simple | pile_affichee | [2.5, 5] | null |
| EZ-Bar Preacher Curl | Preacher Curl | na | poids_total | [1.25, 2.5, 5] | null |

**Templates A / B / C** : structurer selon `coach-sacha.md` section "Structure hebdomadaire (3 séances)".

**Check fonctionnel étape 3** :
- [ ] `npm run seed` s'exécute sans erreur et affiche `✅ Seed terminé`
- [ ] Dans Supabase Table Editor : 1 user, 2 gyms, ≥ 20 exercises, ≥ 9 exercise_instances, 1 bloc actif, 3 templates, 1 BodyWeight, 2 sessionLogs, ≥ 10 setLogs
- [ ] Le SessionLog du 06/04 a `volumeAjustePct = -25` et `feuBiologiqueJour = 'orange'`
- [ ] Relancer `npm run seed` 2x ne crée pas de doublons (idempotent)

---

### Étape 4 — Layout app + navigation mobile

**Objectif** : avoir une coquille d'app avec navigation bottom mobile entre les sections principales.

#### Sous-étape 4.1 — Layout `(app)` avec bottom nav

**Mission** : Créer le layout du groupe `(app)` qui contient une bottom navigation mobile-first avec 5 onglets : Dashboard, Séance, Exercices, Salles, Plus.

**Fichiers à créer/modifier** :
- `src/app/(app)/layout.tsx`
- `src/components/layout/BottomNav.tsx`

**Détail technique** : la bottom nav fait `h-16`, fond `bg-zinc-950`, bordure haut `border-zinc-800`, fixed bottom, safe-area-inset-bottom respecté. Chaque item : icône lucide `48x48` minimum (zone tactile), label texte 12px sous l'icône. État actif = couleur `text-white`, inactif = `text-zinc-500`. Utiliser `usePathname()` pour détecter l'onglet actif.

Items :
- `/` → Dashboard (icône `LayoutDashboard`)
- `/sessions/new` → Séance (icône `Dumbbell`)
- `/exercises` → Exercices (icône `BookOpen`)
- `/gyms` → Salles (icône `MapPin`)
- `/settings` → Plus (icône `Menu`)

Le `<main>` du layout doit avoir `pb-20` pour ne pas être caché par la bottom nav.

#### Sous-étape 4.2 — Page dashboard minimale

**Mission** : Créer une page dashboard provisoire (sera enrichie en Phase 2) qui affiche le nom du user, le bloc actif, la dernière séance enregistrée et le poids actuel.

**Fichiers à créer/modifier** :
- `src/app/(app)/page.tsx`
- `src/lib/queries/dashboard.ts` (ou directement dans la page si Server Component)

**Détail technique** : page Server Component, fait des requêtes Drizzle directes :
- `db.query.users.findFirst({ where: eq(users.id, MOCK_USER_ID) })`
- Bloc actif : `db.query.programmeBlocs.findFirst({ where: and(eq(actif, true), eq(userId, MOCK_USER_ID)) })`
- Dernière séance : `db.query.sessionLogs.findFirst({ orderBy: desc(date) })`
- Dernier poids : `db.query.bodyWeights.findFirst({ orderBy: desc(date) })`

Affichage en `<Card>` shadcn empilées, espacement `gap-4`, padding mobile `p-4`.

**Check fonctionnel étape 4** :
- [ ] `/` affiche le nom "Sacha", bloc "Bloc 1 Cycle 1 Mécanique", dernière séance du 06/04, poids 90,55 kg
- [ ] La bottom nav est visible en bas, accessible au pouce, et ne cache pas le contenu
- [ ] Naviguer entre les 5 onglets fonctionne (même si les autres pages sont vides)
- [ ] Sur DevTools mobile (iPhone 13), tout est lisible et tactile

---

### Étape 5 — CRUD Salles

**Objectif** : pouvoir lister, créer, modifier et supprimer les salles depuis l'app.

#### Sous-étape 5.1 — Page liste des salles

**Mission** : Créer `/gyms` qui liste toutes les salles du user avec leurs infos clés.

**Fichiers à créer/modifier** :
- `src/app/(app)/gyms/page.tsx`
- `src/components/gyms/GymCard.tsx`

**Détail technique** : Server Component, requête Drizzle, affichage en cards (nom, badge `24h` si applicable, horaires, notes en preview). Bouton flottant `+` en bas à droite (au-dessus de la bottom nav, `bottom-24 right-4`) qui ouvre `/gyms/new`. Chaque card est cliquable et mène à `/gyms/[id]`.

#### Sous-étape 5.2 — Formulaire de création/édition de salle

**Mission** : Créer un formulaire réutilisable pour créer ou éditer une salle, avec validation Zod.

**Fichiers à créer/modifier** :
- `src/app/(app)/gyms/new/page.tsx`
- `src/app/(app)/gyms/[id]/page.tsx`
- `src/components/gyms/GymForm.tsx`
- `src/lib/schemas/gym.ts`
- `src/app/api/gyms/route.ts` (POST)
- `src/app/api/gyms/[id]/route.ts` (PATCH, DELETE)

**Détail technique** :

`src/lib/schemas/gym.ts` :
```ts
import { z } from "zod";
export const gymSchema = z.object({
  nom: z.string().min(1, "Nom requis"),
  horairesOuverture: z.string().optional(),
  est24h: z.boolean().default(false),
  notes: z.string().optional(),
});
export type GymInput = z.infer<typeof gymSchema>;
```

`GymForm.tsx` : Client Component, React Hook Form + zodResolver, champs Input/Switch/Textarea shadcn. Props : `defaultValues?: Partial<GymInput>`, `gymId?: string`, `onSuccess: () => void`. Au submit, fait un `fetch` vers `/api/gyms` (POST) ou `/api/gyms/[id]` (PATCH). Toast sonner sur succès/erreur.

Routes API : insertion/update Drizzle simple, retourne le row inséré/modifié. Pas d'auth en Phase 1, le `userId` est forcé à `MOCK_USER_ID`.

#### Sous-étape 5.3 — Suppression de salle

**Mission** : Permettre la suppression d'une salle depuis sa page de détail, avec confirmation modale.

**Détail technique** : sur `/gyms/[id]`, bouton "Supprimer" rouge en bas, ouvre un `<AlertDialog>` shadcn. Au confirm, DELETE `/api/gyms/[id]` puis redirect `/gyms`. Toast de confirmation.

⚠️ La suppression doit être bloquée si la salle a des `exerciseInstances` associées (FK constraint). Gérer l'erreur côté API et afficher un toast explicite.

**Check fonctionnel étape 5** :
- [ ] `/gyms` liste BasicFit Lalande et BasicFit Sesquière
- [ ] Cliquer `+` ouvre le formulaire, créer "Test Gym" → apparaît dans la liste après redirection
- [ ] Cliquer sur "Test Gym" → page de détail, modifier le nom → mise à jour visible
- [ ] Supprimer "Test Gym" → disparaît de la liste après confirmation
- [ ] Tenter de supprimer Lalande → erreur explicite (instances liées)

---

### Étape 6 — CRUD Exercices et Instances (bibliothèque)

**Objectif** : avoir la bibliothèque d'exercices fonctionnelle avec filtres, et pouvoir gérer les instances par salle.

#### Sous-étape 6.1 — Page liste exercices avec filtres

**Mission** : Créer `/exercises` qui liste tous les exercices avec filtres par pilier, profil de tension et rôle.

**Fichiers à créer/modifier** :
- `src/app/(app)/exercises/page.tsx`
- `src/components/exercises/ExerciseList.tsx`
- `src/components/exercises/ExerciseFilters.tsx`
- `src/components/exercises/PilierBadge.tsx`
- `src/lib/constants.ts` : ajouter les enums `PILIERS`, `PROFILS_TENSION`, `ROLES`, `TYPES_EXO`

**Détail technique** :

`PilierBadge.tsx` : composant qui affiche un badge coloré selon le pilier (P1=bleu, P2=vert, P3=orange, P4=rouge, autres=zinc). Utiliser `<Badge variant="outline">` shadcn avec une classe custom.

`ExerciseFilters.tsx` : Client Component, état local (useState) pour les filtres sélectionnés, expose un callback `onChange`. UI : 3 rangées de boutons Toggle (multi-select). Compact pour mobile.

`ExerciseList.tsx` : Client Component qui reçoit la liste complète + applique le filtre côté client (la liste fait < 50 items, pas besoin de SSR refetch). Chaque item : badge pilier + nom + petit label profil tension (ex : "STRETCH"). Tap → `/exercises/[id]`.

`page.tsx` : Server Component qui fait `db.query.exercises.findMany()` puis passe à `<ExerciseList>`.

#### Sous-étape 6.2 — Page détail exercice + instances

**Mission** : Sur `/exercises/[id]`, afficher les infos de l'exercice et la liste de ses instances (machines × salles).

**Fichiers à créer/modifier** :
- `src/app/(app)/exercises/[id]/page.tsx`
- `src/components/exercises/ExerciseInstanceCard.tsx`

**Détail technique** : Server Component qui fait une requête avec join sur `exerciseInstances` et `gyms`. Affichage : header avec nom + pilier badge + profil tension + muscles, puis section "Instances" avec une card par instance. Chaque card : nom de la machine, salle (badge), convention de charge, incréments. Bouton "Ajouter une instance" en bas qui ouvre un dialog.

#### Sous-étape 6.3 — Création d'exercice et d'instance

**Mission** : Créer les formulaires pour ajouter un exercice puis ses instances, avec validation Zod et routes API.

**Fichiers à créer/modifier** :
- `src/app/(app)/exercises/new/page.tsx`
- `src/components/exercises/ExerciseForm.tsx`
- `src/components/exercises/ExerciseInstanceForm.tsx`
- `src/lib/schemas/exercise.ts`
- `src/app/api/exercises/route.ts`
- `src/app/api/exercises/[id]/route.ts`
- `src/app/api/exercise-instances/route.ts`
- `src/app/api/exercise-instances/[id]/route.ts`

**Détail technique** :

`exercise.ts` (schémas Zod) :
```ts
export const PILIERS = ["P1_poussee","P2_tirage","P3_squat","P4_hanche","epaules","bras_biceps","bras_triceps","jambes_iso","core"] as const;
export const PROFILS = ["stretch","contract","mi_range"] as const;
export const ROLES = ["pilier","substitut","accessoire"] as const;
export const TYPES = ["polyarticulaire","isolation"] as const;

export const exerciseSchema = z.object({
  nom: z.string().min(1),
  pilier: z.enum(PILIERS),
  profilTension: z.enum(PROFILS),
  type: z.enum(TYPES),
  categorieRole: z.enum(ROLES),
  musclesPrincipaux: z.array(z.string()).default([]),
});

export const exerciseInstanceSchema = z.object({
  exerciseId: z.string().uuid(),
  gymId: z.string().uuid(),
  machineNom: z.string().min(1),
  typePoulie: z.enum(["simple","double","na"]).default("na"),
  conventionCharge: z.enum(["disques_ajoutes","pile_affichee","poids_total"]),
  incrementsPossibles: z.array(z.number().positive()).min(1),
  poidsNonCompte: z.number().nullable().optional(),
  notesMachine: z.string().optional(),
});
```

`ExerciseInstanceForm.tsx` : champ `incrementsPossibles` géré comme un input texte qui parse `"2.5, 5, 10"` en `[2.5, 5, 10]`. Affichage de chips visuelles pour confirmer le parsing.

**Check fonctionnel étape 6** :
- [ ] `/exercises` affiche les ≥ 20 exercices seedés
- [ ] Filtrer par pilier P1 → seuls les exos de poussée s'affichent
- [ ] Filtrer par profil "stretch" → seuls les stretch-biased s'affichent
- [ ] Cliquer sur "Wide Stance Hack Squat" → page détail avec instance "Matrix Perfect Squat" liée à Lalande, incréments visibles, plateforme 30,4 kg notée
- [ ] Créer un nouvel exercice via `/exercises/new` → apparaît dans la liste
- [ ] Ajouter une instance à cet exercice → visible sur la page détail

---

### Étape 7 — Saisie de séance (cœur de la phase)

**Objectif** : pouvoir démarrer une séance depuis un template, saisir chaque série, et enregistrer le tout.

#### Sous-étape 7.1 — Page sélection de template

**Mission** : Sur `/sessions/new`, lister les templates du bloc actif et permettre d'en choisir un pour démarrer une séance.

**Fichiers à créer/modifier** :
- `src/app/(app)/sessions/new/page.tsx`
- `src/components/sessions/TemplateSelector.tsx`

**Détail technique** : Server Component, query : bloc actif + ses seanceTemplates ordonnés par `ordreDansSemaine`. Affichage : cards avec lettre A/B/C en gros, nom, nombre d'exercices. Tap → `/sessions/new/[templateId]`.

Champ "Salle du jour" : Select shadcn préremplis avec la salle préférée du user (`prefSalleParDefautId`) ou Lalande par défaut. La sélection est passée en query param vers la page suivante.

#### Sous-étape 7.2 — Store Zustand pour la séance en cours

**Mission** : Créer un store Zustand qui gère l'état de la séance en cours, avec persistance localStorage.

**Fichiers à créer/modifier** :
- `src/stores/sessionStore.ts`

**Détail technique** :
```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DraftSet = {
  exerciseInstanceId: string;
  numeroSerie: number;
  repsEffectuees: number | null;
  charge: number | null;
  rpeEffectif: number | null;
  notes?: string;
  validatedAt?: number; // timestamp
};

export type ActiveSession = {
  id: string; // uuid client-side
  seanceTemplateId: string;
  gymId: string;
  startedAt: number;
  sets: DraftSet[];
  currentExerciseIndex: number;
  notesSeance: string;
};

type SessionStore = {
  active: ActiveSession | null;
  start: (s: Omit<ActiveSession, "id" | "startedAt" | "sets" | "currentExerciseIndex" | "notesSeance">) => void;
  upsertSet: (set: DraftSet) => void;
  setCurrentExerciseIndex: (i: number) => void;
  setNotes: (notes: string) => void;
  clear: () => void;
};

export const useSessionStore = create<SessionStore>()(
  persist(
    (set, get) => ({
      active: null,
      start: (data) => set({
        active: {
          ...data,
          id: crypto.randomUUID(),
          startedAt: Date.now(),
          sets: [],
          currentExerciseIndex: 0,
          notesSeance: "",
        },
      }),
      upsertSet: (newSet) => set((state) => {
        if (!state.active) return state;
        const existing = state.active.sets.findIndex(
          s => s.exerciseInstanceId === newSet.exerciseInstanceId && s.numeroSerie === newSet.numeroSerie
        );
        const sets = [...state.active.sets];
        if (existing >= 0) sets[existing] = newSet;
        else sets.push(newSet);
        return { active: { ...state.active, sets } };
      }),
      setCurrentExerciseIndex: (i) => set((state) =>
        state.active ? { active: { ...state.active, currentExerciseIndex: i } } : state
      ),
      setNotes: (notes) => set((state) =>
        state.active ? { active: { ...state.active, notesSeance: notes } } : state
      ),
      clear: () => set({ active: null }),
    }),
    { name: "active-session" }
  )
);
```

#### Sous-étape 7.3 — Page séance en cours (mode live)

**Mission** : Sur `/sessions/new/[templateId]`, afficher la séance en cours avec saisie série par série.

**Fichiers à créer/modifier** :
- `src/app/(app)/sessions/new/[templateId]/page.tsx`
- `src/components/sessions/LiveSession.tsx`
- `src/components/sessions/ExerciseBlock.tsx`
- `src/components/sessions/SetInput.tsx`
- `src/components/sessions/HistoryPreview.tsx`

**Détail technique** :

`page.tsx` : Server Component qui charge le template avec ses `exerciseInTemplate` joints aux `exerciseInstances` joints aux `exercises` et `gyms`. Charge aussi les SetLogs précédents pour chaque ExerciseInstance (les 6 derniers, pour preview). Passe tout à `<LiveSession>`.

`LiveSession.tsx` : Client Component qui :
1. Au mount, vérifie si une session est déjà active dans le store. Si oui ET pour le même templateId → reprend. Si pour un autre templateId → demande confirmation (continuer / abandonner et démarrer nouvelle).
2. Sinon, appelle `start()` du store.
3. Affiche la liste des exercices avec accordéon (terminé / actif / à venir). Seul l'actif est étendu.
4. Bouton "Terminer la séance" en bas.

`ExerciseBlock.tsx` (en cours) : affiche
- Nom + machine + salle + badge pilier
- Tempo en gros (text-3xl)
- `<HistoryPreview>` : derniers SetLogs sur cette ExerciseInstance, affichage compact `80kg × 6/6/6`
- Pour chaque série (de 1 à `seriesCibles`) : un `<SetInput>`
- Bouton "Exercice suivant" qui passe `currentExerciseIndex + 1`

`SetInput.tsx` :
- Affiche `Série N`
- Champ Charge : grosse zone, boutons `−` et `+` qui décrémentent/incrémentent selon `incrementsPossibles` de l'instance (sélectionner le plus petit incrément par défaut). Affichage : `80,0 kg` (gros, 32px+).
- Champ Reps : `−` et `+` simples (incrément 1).
- Champ RPE : Slider shadcn de 6 à 10, pas 0.5.
- Bouton "Valider série" plein largeur, hauteur min `56px`. Au tap : appelle `upsertSet()` du store, marque la série visuellement comme validée (vert), ouvre la série suivante.
- Pas de pré-remplissage intelligent en Phase 1 (ce sera Phase 2 — double progression). Pré-remplissage simple : reprendre la charge/reps de la dernière série validée du même exercice si elle existe, sinon reprendre la dernière séance historique.

#### Sous-étape 7.4 — Fin de séance et persistance en base

**Mission** : Permettre de clôturer la séance, saisir les notes finales, et persister tout en base via une route API.

**Fichiers à créer/modifier** :
- `src/app/(app)/sessions/new/[templateId]/finish/page.tsx`
- `src/components/sessions/FinishSessionForm.tsx`
- `src/app/api/sessions/route.ts` (POST)

**Détail technique** :

Le bouton "Terminer la séance" de la page live mène à `/sessions/new/[templateId]/finish`. Cette page lit le store, affiche un récap (nombre d'exercices faits, durée écoulée), un textarea pour les notes finales, un slider énergie fin (0-100), et un bouton "Enregistrer".

Au submit, POST `/api/sessions` avec le payload :
```ts
{
  seanceTemplateId: string;
  gymId: string;
  date: string; // YYYY-MM-DD aujourd'hui
  dureeMinutes: number;
  energieFin: number;
  notesSeance: string;
  sets: DraftSet[]; // depuis le store
}
```

Côté API : transaction Drizzle qui insère le `sessionLog` puis tous les `setLogs` liés. Retourne l'ID du sessionLog créé. Au succès côté client : `clear()` du store, redirect `/sessions/[id]` (page récap).

⚠️ Validation : refuser un payload avec 0 set. Refuser des sets avec `repsEffectuees === null` ou `charge === null` (filtrer côté client avant envoi, prévenir l'utilisateur).

#### Sous-étape 7.5 — Page récap de séance

**Mission** : Sur `/sessions/[id]`, afficher la séance enregistrée en lecture seule.

**Fichiers à créer/modifier** :
- `src/app/(app)/sessions/[id]/page.tsx`

**Détail technique** : Server Component, query avec joins, affichage des exos et de leurs sets en tableau compact. Header avec date, salle, durée, énergie fin, notes.

**Check fonctionnel étape 7** :
- [ ] `/sessions/new` liste les 3 templates A/B/C
- [ ] Démarrer la Séance A → on arrive sur la page live avec le 1er exercice étendu
- [ ] Le bloc affiche l'historique de la dernière séance pour cet exercice (data du seed)
- [ ] Saisir 3 séries, valider chacune → elles passent en vert, la suivante s'ouvre auto
- [ ] Fermer l'app et la rouvrir → la séance est toujours en cours, on reprend où on en était
- [ ] Passer au 2e exercice, puis cliquer "Terminer la séance"
- [ ] Saisir des notes + énergie 60 → "Enregistrer" → redirect vers page récap
- [ ] Le sessionLog et ses setLogs sont visibles dans Supabase Table Editor
- [ ] Le store Zustand est vidé (localStorage `active-session` reset)

---

### Étape 8 — Historique par exercice

**Objectif** : sur la fiche d'une instance, voir l'historique chronologique de tous les SetLogs.

#### Sous-étape 8.1 — Composant historique

**Mission** : Sur la page détail d'un exercice, ajouter pour chaque instance un bloc "Historique" listant les SetLogs groupés par séance, du plus récent au plus ancien.

**Fichiers à créer/modifier** :
- `src/components/exercises/InstanceHistory.tsx`
- Mise à jour de `src/app/(app)/exercises/[id]/page.tsx` pour charger les setLogs joints aux sessionLogs

**Détail technique** : query Drizzle qui fait :
```ts
const setLogs = await db.query.setLogs.findMany({
  where: eq(setLogs.exerciseInstanceId, instanceId),
  with: { sessionLog: true },
  orderBy: [desc(setLogs.createdAt)],
  limit: 50,
});
```

Affichage : groupé par `sessionLogId`, format `JJ/MM — 80 kg × 6/6/6 — RPE 8`. Compact, lisible mobile.

**Check fonctionnel étape 8** :
- [ ] Sur `/exercises/[id]` du Lying Machine Chest Press, le bloc historique de l'instance Lalande affiche `06/04 — 80 kg × 6/6/6 — RPE 8`
- [ ] Après avoir saisi une nouvelle séance contenant cet exercice, l'historique affiche la nouvelle entrée en tête

---

### Étape 9 — Poids corporel

**Objectif** : pouvoir saisir son poids et voir une courbe simple.

#### Sous-étape 9.1 — Saisie du poids

**Mission** : Sur `/bodyweight`, lister les poids enregistrés et permettre d'en ajouter un.

**Fichiers à créer/modifier** :
- `src/app/(app)/bodyweight/page.tsx`
- `src/components/bodyweight/BodyWeightForm.tsx`
- `src/app/api/bodyweight/route.ts` (POST, GET)
- `src/lib/schemas/bodyweight.ts`

**Détail technique** :
```ts
export const bodyWeightSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  poids: z.number().positive().max(300),
  notes: z.string().optional(),
});
```

Le POST gère le upsert sur `(userId, date)` (contrainte unique) : `onConflictDoUpdate`.

Affichage : liste compacte des dernières entrées + un input rapide en haut (date par défaut = aujourd'hui, champ poids, bouton "Ajouter").

#### Sous-étape 9.2 — Courbe simple

**Mission** : Afficher une courbe simple (sparkline) du poids sur 30 jours en haut de la page.

**Fichiers à créer/modifier** :
- `src/components/bodyweight/WeightSparkline.tsx`

**Détail technique** : pas de librairie de chart en Phase 1. Construire un SVG inline avec `<polyline>`. Hauteur 80px, largeur full. Calculer min/max sur les données et normaliser. Stroke blanc 2px, fond transparent. Affichage du dernier poids en gros au-dessus.

**Check fonctionnel étape 9** :
- [ ] `/bodyweight` affiche `90,55 kg` (entrée seedée du 05/04/2026)
- [ ] Ajouter une entrée `91,0 kg` aujourd'hui → apparaît dans la liste, sparkline mise à jour
- [ ] Réajouter une entrée pour la même date → met à jour au lieu de dupliquer
- [ ] Le dashboard affiche bien la dernière valeur saisie

---

### Étape 10 — Configuration PWA

**Objectif** : l'app est installable sur l'écran d'accueil iOS/Android et fonctionne en mode standalone.

#### Sous-étape 10.1 — Manifest et icônes

**Mission** : Créer le manifest PWA et les icônes nécessaires (192, 512, maskable, apple-touch).

**Fichiers à créer/modifier** :
- `public/manifest.json`
- `public/icons/icon-192.png` (placeholder noir avec lettre "S" blanche, à remplacer plus tard)
- `public/icons/icon-512.png`
- `public/icons/apple-touch-icon.png` (180x180)
- `src/app/layout.tsx` : ajouter les meta tags PWA et la référence au manifest

**Détail technique — `public/manifest.json`** :
```json
{
  "name": "Sport Perso",
  "short_name": "Sport",
  "description": "Suivi de musculation perso",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#000000",
  "orientation": "portrait",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

**Meta tags à ajouter dans `layout.tsx`** :
```tsx
export const metadata = {
  title: "Sport Perso",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Sport",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};
```

Pour les icônes : générer des PNG basiques noir avec un "S" blanc centré. L'agent peut utiliser un script Node avec `sharp` ou simplement créer des fichiers SVG convertis. Ou laisser des placeholders à remplacer manuellement plus tard.

#### Sous-étape 10.2 — Service worker minimal

**Mission** : Mettre en place un service worker basique pour rendre l'app "installable" (critère PWA). Pas de logique de cache offline en Phase 1 (ce sera Phase 3).

**Fichiers à créer/modifier** :
- `public/sw.js` : service worker minimal qui s'enregistre mais ne fait rien d'agressif
- `src/components/layout/ServiceWorkerRegister.tsx` : composant client qui enregistre le SW
- `src/app/(app)/layout.tsx` : importer ce composant

**Détail technique — `public/sw.js`** :
```js
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", (e) => { /* passthrough Phase 1 */ });
```

**`ServiceWorkerRegister.tsx`** :
```tsx
"use client";
import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(console.error);
    }
  }, []);
  return null;
}
```

**Check fonctionnel étape 10** :
- [ ] Lighthouse PWA audit (DevTools) : "Installable" ✓
- [ ] Sur Chrome desktop : icône d'installation visible dans la barre d'adresse
- [ ] Sur iOS Safari : Partager → "Sur l'écran d'accueil" → ajout possible → ouverture en mode standalone (sans barre Safari)
- [ ] Service worker visible dans DevTools → Application → Service Workers, statut "activated"

---

## Check final de phase

- [ ] Le seed remplit la base avec toutes les données réelles de Sacha (gyms, exercices, instances, bloc, templates, historique 06/04 et 04/04, poids initial)
- [ ] On peut naviguer entre Dashboard / Séance / Exercices / Salles / Plus via la bottom nav, sur mobile, sans clavier
- [ ] On peut créer/éditer/supprimer une salle
- [ ] On peut filtrer la bibliothèque d'exercices par pilier, profil de tension, rôle
- [ ] On peut ajouter un exercice et lui attacher une instance machine × salle
- [ ] **Une séance complète peut être saisie de bout en bout sur mobile** : sélection template → exercice par exercice → série par série → notes → enregistrement → récap visible
- [ ] L'historique d'un exercice affiche les SetLogs précédents groupés par séance
- [ ] On peut saisir et visualiser son poids corporel avec une sparkline
- [ ] L'app est installable sur iPhone (testée réellement, pas seulement Lighthouse) et s'ouvre en mode standalone
- [ ] Toute la séance survit à un crash app / redémarrage téléphone via la persistance Zustand
- [ ] `npx tsc --noEmit` passe sans erreur sur tout le projet
- [ ] Aucune ligne de code métier "intelligent" n'a été introduite (pas de feu biologique, pas de double progression auto, pas d'ajustement de volume — tout ça est Phase 2)
