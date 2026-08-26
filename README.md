# SachaRboneFit

Application personnelle d'entraînement adaptatif. Elle n'est pas un carnet de
musculation générique : elle est conçue pour **un** utilisateur, et son objectif est
d'adapter chaque séance à son état du jour, à la salle où il se trouve, au matériel
réellement disponible sur place et à son historique de performances.

## Le vocabulaire du produit

| Notion | Ce que ça veut dire |
| --- | --- |
| **Pilier** | Patron de mouvement : `P1_poussee`, `P2_tirage`, `P3_squat`, `P4_hanche`, puis `epaules`, `bras_biceps`, `bras_triceps`, `jambes_iso`, `core`. Axe structurant du programme. |
| **Profil de tension** | `stretch` / `mi_range` / `contract` — région de la courbe force-longueur où l'exercice charge le muscle. Critère de substitution. |
| **Catégorie de rôle** | `pilier` / `substitut` / `accessoire`. Détermine ce qu'on protège et ce qu'on coupe quand le volume doit baisser. |
| **Feu biologique** | État de la journée : `vert` / `orange` / `rouge`. Un feu *du jour* (sommeil, énergie, courbatures) et un feu *de tendance* (évolution du 1RM des piliers sur 3 séances). |
| **Exercise instance** | Un exercice **sur une machine précise d'une salle précise**, avec sa convention de charge et ses incréments réels. C'est la pièce maîtresse du modèle. |
| **Catalogue** | 120 exercices curatés depuis la bibliothèque workout-guide, avec muscles principaux et secondaires, type de matériel et illustrations. Voir `src/lib/referentiels/catalogue.ts`. |
| **Séance du jour** | La prescription du jour, entre le *template* (prévu il y a des semaines) et le *log* (ce qui a été fait) : exercices résolus vers la salle du jour, séries ajustées et charge suggérée. Table `session_plan_items`. |
| **SOS** | Quatre secours en séance : machine occupée, douleur, chute d'énergie, temps dépassé. |

## Stack

- **Next.js 16** (App Router, React 19). Le middleware suit la nouvelle convention `src/proxy.ts`.
- **Postgres** via Supabase, **Drizzle ORM** (`src/db/schema.ts`).
- **Supabase Auth** (`@supabase/ssr`).
- **Zustand** (persistance locale de la séance en cours), **Tailwind 4**, **Recharts**.

## Démarrer

```bash
npm install
cp .env.example .env.local         # puis renseigner les variables ci-dessous
npm run seed                       # données de développement
npm run dev
```

### Variables d'environnement

| Variable | Rôle |
| --- | --- |
| `DATABASE_URL` | Connexion Postgres directe (Drizzle). |
| `NEXT_PUBLIC_SUPABASE_URL` | Projet Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique Supabase. |
| `SEED_USER_ID` | UUID du compte à seeder. Doit correspondre à un utilisateur Supabase réel. |
| `SEED_USER_EMAIL` | Email du compte seedé (défaut `sacha@local`). |
| `CRON_SECRET` | Protège les routes `/api/cron/*`. |
| `LLM_PROVIDER`, `LLM_MODEL`, `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | Coach IA (optionnel — voir Limites). |

## Scripts

| Commande | Effet |
| --- | --- |
| `npm run dev` | Serveur de développement. |
| `npm run build` | Build de production. |
| `npm run lint` | ESLint. Doit rester à **zéro erreur**. |
| `npm run seed` | **Destructif** : `TRUNCATE` puis réinsertion des données de développement. |
| `npx tsc --noEmit` | Vérification de types. Doit rester à **zéro erreur**. |

## Base de données

Les migrations vivent dans `src/db/migrations/` et sont générées par
`npx drizzle-kit generate`.

`0000_baseline.sql` **décrit le schéma tel qu'il existait déjà** — il a été produit
après coup, à partir d'un schéma appliqué en `drizzle-kit push`. Sur une base déjà
en service, ne le rejoue pas : marque-le comme appliqué. Sur une base vierge, il crée
tout le schéma.

Les politiques RLS sont dans `supabase/migrations/` et s'appliquent à la main dans
l'éditeur SQL de Supabase.

> **Attention** : l'application se connecte à Postgres avec `DATABASE_URL`, un rôle qui
> **contourne la RLS**. La sécurité repose donc sur le filtrage `userId` explicite dans
> chaque route API, pas sur les politiques. Toute nouvelle route doit scoper ses requêtes.

## Référentiels

Trois vocabulaires font autorité et doivent être utilisés partout :

| Référentiel | Fichier | Rôle |
| --- | --- | --- |
| Muscles | `src/lib/referentiels/muscles.ts` | 15 muscles canoniques. `versMuscle()` convertit toute valeur externe ; elle renvoie `null` sur l'inconnu. |
| Équipements | `src/lib/referentiels/equipements.ts` | 7 types de matériel requis. |
| Catalogue | `src/lib/referentiels/catalogue.ts` | 120 exercices, avec pilier et profil de tension attribués à la main. |

Les illustrations sont dans `public/exercices/<slug>/frame-<n>.svg`, copiées **verbatim**
depuis la bibliothèque source. Elles sont monochromes : le composant
`IllustrationExercice` les applique en masque CSS, ce qui les fait suivre la couleur
du thème sans qu'aucun fichier ne soit modifié.

## Design — Carnet

Le système de design vit dans `src/app/globals.css`, section « Carnet ».

**La règle qui tient tout : la couleur ne décore jamais.** Tout ce qui n'est pas
un signal est encre sur papier. Cinq couleurs seulement sont autorisées —
`--gain`, `--perte`, et les trois feux du jour.

Deux conséquences pour le code :

- La couleur ne code jamais seule. Un gain porte toujours un signe (`+2,5`), une
  régression aussi (`−5,0`), une stagnation un `=`. Le composant `<Delta>` s'en charge.
- Le sens suit **l'objectif**, pas le signe du nombre : en sèche, `−0,4 kg` est un
  gain. D'où `sensInverse` sur `<Delta>`.

Deux composants concentrent les décisions de couleur, là où quatre mappings
coexistaient auparavant (dont deux dans le même fichier) : `<Delta>` et `<Feu>`.

Tout chiffre susceptible de changer porte la classe `.chiffres`
(`tabular-nums`) : sans elle, la charge saute latéralement à chaque appui
sur +/− et on rate le bouton.

**Une exception à la règle : les séries de graphique.** Un histogramme empilé à
huit piliers a besoin de huit marques distinguables — c'est le seul endroit où la
couleur catégorise. Les tokens `--serie-1` à `--serie-8` sont dans un ordre fixe,
jamais recyclé, et les deux palettes (claire et sombre) ont été validées : bande
de clarté, plancher de chroma, séparation daltonisme sur chaque paire voisine
(ΔE ≥ 10) et contraste ≥ 3:1 sur le fond. La palette sombre est *choisie*, pas
une inversion de la claire.

**Thème clair / sombre.** L'application forçait `class="dark"` sur `<html>` : le
thème clair était inatteignable. `next-themes`, installé mais inutilisé, pilote
désormais le réglage, et les tokens répondent à `.dark` comme à
`prefers-color-scheme`.

## Limites connues

L'application est en cours de reprise. Ce qui ne fonctionne pas aujourd'hui :

- **Coach IA** — le flux SSE n'est pas décodé et les outils (`src/lib/coach/tools.ts`)
  ne sont jamais transmis au modèle. Les réponses affichées sont du protocole brut.
- **Cron `precalc-session`** — écrit un contenu fixe en base, ce n'est pas une
  génération réelle.
- **Génération de séance** — l'application adapte une séance existante ; elle ne
  compose pas encore une séance de zéro.
- **Coach IA** — voir ci-dessus.
- **PWA** — le service worker est vide et les icônes du manifest sont absentes.
- **Tests** — il n'y en a aucun.

## Documentation

`docs/phase-1.md` à `docs/phase-5.md` sont une **archive d'intention** : elles décrivent
ce qui était prévu à chaque phase, pas ce qui fonctionne. Le code est la source de vérité.

## Crédits

Les illustrations d'exercices proviennent de
[workout-guide](https://github.com/bryllim/workout-guide) par Bryl Lim, d'après
[Everkinetic](https://github.com/everkinetic/data), sous licence
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
