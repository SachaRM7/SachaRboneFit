# Implementation Plan: Composition libre et Coach copilote

**Branch**: `codex/session-composer` | **Date**: 2026-09-14 | **Spec**: `specs/001-session-composer/spec.md`

**Input**: Feature specification from `/specs/001-session-composer/spec.md`

## Summary

Transformer l'onglet Séances en centre de contrôle : commencer la séance prévue, composer une séance vide, dupliquer un gabarit ou demander au Coach une proposition complète. La réalisation réutilise les gabarits, le générateur de plan Live, la validation de séance et les propositions Coach existants. Les séances ponctuelles sont conservées dans un bloc inactif propre à l'utilisateur afin de garder un historique sans modifier la rotation active. Aucun moteur métier, moteur IA ou schéma parallèle n'est introduit.

## Technical Context

**Language/Version**: TypeScript 5, React 19.2, Next.js 16.2

**Primary Dependencies**: Next.js App Router, Drizzle ORM, postgres.js, Zod, Zustand, Base UI, Tailwind CSS 4

**Storage**: PostgreSQL via Supabase, schéma Drizzle existant

**Testing**: Vitest (unitaires, composants et intégration), TypeScript, ESLint, Next build, vérification sur preview Vercel

**Target Platform**: Web mobile first, Safari iPhone prioritaire, desktop responsive

**Project Type**: Application web Next.js unique avec routes serveur et services métier

**Performance Goals**: Brouillon instantané côté client ; mutation atomique ; aucun chargement supplémentaire dans le Live après création

**Constraints**: Pas de migration ; aucune donnée inventée ; safe areas et clavier iPhone ; anciennes séances et conversations compatibles ; aucune mutation Coach sans confirmation

**Scale/Scope**: Un nouveau parcours Séances, un compositeur mobile, une mutation serveur, une extension du contexte Live et un outil Coach de proposition complète

## Constitution Check

*GATE: Passed before Phase 0 and re-checked after Phase 1.*

- Les instructions du dépôt restent la constitution opérationnelle : travail isolé sur `D:`, `rg`/RTK, lecture de la documentation Next.js locale et validations proportionnées.
- Les données restent isolées par utilisateur et toutes les mutations sensibles sont validées côté serveur.
- La fonctionnalité réutilise les services existants et n'ajoute ni dépendance lourde ni migration.
- Le parcours mobile préserve les safe areas, les cibles tactiles et le comportement clavier déjà éprouvé.

## Project Structure

### Documentation (this feature)

```text
specs/001-session-composer/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── session-composer.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (app)/sessions/
│   │   ├── new/page.tsx
│   │   ├── compose/page.tsx
│   │   └── new/[templateId]/page.tsx
│   └── api/
│       ├── session-composer/route.ts
│       ├── seance-du-jour/route.ts
│       └── coach/chat/route.ts
├── components/
│   ├── session-composer/
│   │   ├── SessionHub.tsx
│   │   └── SessionComposer.tsx
│   └── coach/CarteProposition.tsx
├── lib/
│   ├── session-composer/draft.ts
│   └── coach/
│       ├── outils-programme.ts
│       ├── outils-ecriture.ts
│       ├── system-prompt.ts
│       └── contexte-ecran.ts
└── services/
    ├── session-composer.ts
    ├── plan-seance.ts
    └── propositions-coach.ts

tests/
├── unit/
├── components/
└── integration/
```

**Structure Decision**: Conserver l'application Next.js unique. Les pages serveur chargent et autorisent les données, les composants client portent le brouillon réversible, les routes API orchestrent les mutations et les services restent les seuls détenteurs de la logique de persistance.

## Complexity Tracking

Aucune violation. La distinction gabarit ponctuel / gabarit permanent est représentée avec le modèle `programme_blocs.actif` déjà disponible.
