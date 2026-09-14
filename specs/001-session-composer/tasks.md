# Tasks: Composition libre et Coach copilote

**Input**: Documents de conception dans `/specs/001-session-composer/`

**Tests**: requis par la spécification pour les trois portées, l'idempotence, la compatibilité Live et les propositions Coach.

## Phase 1: Fondations partagées

- [ ] T001 Définir et valider le brouillon, la portée et les valeurs par défaut dans `src/lib/session-composer/draft.ts`
- [ ] T002 Implémenter la lecture des sources du compositeur et la création atomique/idempotente dans `src/services/session-composer.ts`
- [ ] T003 Exposer la mutation authentifiée dans `src/app/api/session-composer/route.ts`
- [ ] T004 Ajouter les tests unitaires des schémas et invariants dans `tests/unit/session-composer.test.ts`

**Checkpoint**: un brouillon valide peut être enregistré sans interface, sans doublon et sans migration.

## Phase 2: User Story 1 — Composer une séance libre (P1)

**Goal**: créer ou dupliquer une séance et éditer son contenu sur mobile.

**Independent Test**: composer quatre exercices, modifier prescriptions et ordre, puis atteindre la confirmation sans Coach.

- [ ] T005 [US1] Transformer l'entrée Séances en centre de contrôle dans `src/app/(app)/sessions/new/page.tsx`
- [ ] T006 [US1] Créer la page serveur du compositeur dans `src/app/(app)/sessions/compose/page.tsx`
- [ ] T007 [US1] Construire l'éditeur mobile dans `src/components/session-composer/SessionComposer.tsx`
- [ ] T008 [US1] Ajouter la sélection d'exercice compatible et les réglages compacts dans `src/components/session-composer/SessionComposer.tsx`
- [ ] T009 [US1] Tester création, duplication, ordre, validation et clavier dans `tests/components/session-composer.test.tsx`

**Checkpoint**: l'utilisateur peut construire un brouillon complet et réversible depuis Séances.

## Phase 3: User Story 2 — Choisir la portée (P1)

**Goal**: appliquer explicitement « aujourd'hui », « remplacer » ou « programme ».

**Independent Test**: enregistrer trois copies et vérifier la rotation et la destination annoncées.

- [ ] T010 [US2] Ajouter le choix de portée et les conséquences lisibles dans `src/components/session-composer/SessionComposer.tsx`
- [ ] T011 [US2] Étendre le démarrage Live avec `rotationTemplateId` dans `src/app/(app)/sessions/new/[templateId]/page.tsx` et `src/app/api/seance-du-jour/route.ts`
- [ ] T012 [US2] Valider et appliquer le remplacement d'un passage dans `src/services/plan-seance.ts`
- [ ] T013 [US2] Tester ponctuel, programme, remplacement, abandon et fin réelle dans `tests/integration/session-composer-scopes.test.ts`

**Checkpoint**: chaque portée produit son effet exact sans modifier silencieusement les gabarits existants.

## Phase 4: User Story 3 — Faire construire par le Coach (P1)

**Goal**: proposer une séance entière, l'afficher puis l'appliquer après confirmation.

**Independent Test**: demander une alternative, refuser sans mutation, puis accepter une nouvelle proposition une seule fois.

- [ ] T014 [US3] Extraire la validation structurée réutilisable dans `src/lib/coach/outils-programme.ts`
- [ ] T015 [US3] Ajouter l'outil `propose_session_build` dans `src/lib/coach/outils-ecriture.ts`
- [ ] T016 [US3] Transmettre `conversationId` aux outils dans `src/app/api/coach/chat/route.ts`
- [ ] T017 [US3] Préparer et appliquer les constructions complètes dans `src/services/propositions-coach.ts`
- [ ] T018 [US3] Adapter le rendu et les confirmations dans `src/components/coach/CarteProposition.tsx`
- [ ] T019 [US3] Autoriser et guider le cas d'usage dans `src/lib/coach/system-prompt.ts` et `src/lib/coach/contexte-ecran.ts`
- [ ] T020 [US3] Tester validation, refus, expiration, application et idempotence dans `tests/unit/coach-session-build.test.ts` et `tests/integration/coach-session-build.test.ts`

**Checkpoint**: le Coach peut préparer une séance complète sans mutation préalable ni donnée inventée.

## Phase 5: User Story 4 — Comprendre les possibilités (P2)

**Goal**: rendre la séance prévue, la reprise, la création et le Coach immédiatement compréhensibles.

**Independent Test**: identifier en moins de trois secondes les actions de reprise, démarrage et création.

- [ ] T021 [US4] Finaliser la hiérarchie et les états vides du centre Séances dans `src/app/(app)/sessions/new/page.tsx`
- [ ] T022 [US4] Ajouter les portes d'entrée contextuelles du Coach dans `src/lib/coach/contexte-ecran.ts`
- [ ] T023 [US4] Vérifier accessibilité, petits écrans, safe areas et absence de CTA trompeur dans les composants du compositeur

## Phase 6: Convergence et validation

- [ ] T024 Relire les composants React avec le guide `vercel:react-best-practices` et corriger les écarts utiles
- [ ] T025 Exécuter TypeScript, ESLint, tests unitaires, composants, intégration et Next build
- [ ] T026 Créer une preview Vercel et rejouer les scénarios de `specs/001-session-composer/quickstart.md`
- [ ] T027 Converger spécification, plan, tâches, code et tests ; documenter les limites concrètes restantes

## Dependencies & Execution Order

- T001–T004 bloquent l'enregistrement depuis l'interface.
- T005–T009 peuvent être réalisés avant l'extension Live, puis validés comme brouillon local.
- T010–T013 dépendent de T001–T003 et du parcours US1.
- T014–T020 réutilisent T001/T002 mais restent indépendants de l'interface du compositeur.
- T021–T023 finalisent la compréhension après les parcours fonctionnels.
- T024–T027 ne commencent qu'après les quatre histoires.
