# Feature Specification: Composition libre et Coach copilote

**Feature Branch**: `codex/session-composer`

**Created**: 2026-09-14

**Status**: Draft

**Input**: L'utilisateur doit reprendre le contrôle de ses séances : composer librement, partir d'une séance existante ou demander au Coach une alternative complète, adaptée aux données réelles, puis décider explicitement de sa portée.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Composer une séance libre (Priority: P1)

Depuis l'espace Séances, l'athlète crée une séance à partir d'une page blanche ou d'une séance existante. Il choisit le lieu, ajoute les exercices réellement disponibles, modifie leur ordre et leur prescription, puis relit la séance complète avant de l'utiliser.

**Why this priority**: Sans ce parcours, l'utilisateur dépend de la rotation automatique et ne peut pas exprimer une envie d'entraînement simple.

**Independent Test**: Créer une séance de trois exercices depuis une page blanche, réordonner les mouvements, modifier une prescription et atteindre l'aperçu final sans utiliser le Coach.

**Acceptance Scenarios**:

1. **Given** un utilisateur avec un programme et au moins un lieu équipé, **When** il choisit « Composer moi-même », **Then** il peut ajouter, retirer, réordonner et régler les exercices avant tout enregistrement.
2. **Given** une séance existante, **When** il choisit de partir de celle-ci, **Then** un brouillon indépendant reprend son contenu sans modifier l'original.
3. **Given** un brouillon incomplet ou incohérent, **When** l'utilisateur tente de continuer, **Then** l'interface explique précisément ce qui doit être corrigé et ne crée aucune séance partielle.
4. **Given** un petit écran mobile, **When** le clavier est ouvert sur un champ numérique ou textuel, **Then** le champ actif et l'action suivante restent atteignables sans double défilement.

---

### User Story 2 - Choisir la portée de la séance (Priority: P1)

Avant l'enregistrement, l'athlète choisit si son brouillon sert une seule fois, remplace la prochaine séance de la rotation ou devient une nouvelle séance permanente de son programme.

**Why this priority**: Le contrôle n'est réel que si l'utilisateur comprend les conséquences de son choix avant de confirmer.

**Independent Test**: Enregistrer trois copies du même brouillon avec les trois portées et vérifier que chacune produit le comportement annoncé.

**Acceptance Scenarios**:

1. **Given** un brouillon valide, **When** l'utilisateur choisit « Faire aujourd'hui », **Then** la séance peut démarrer sans être ajoutée à la rotation du programme.
2. **Given** une prochaine séance prévue, **When** l'utilisateur choisit « Remplacer la séance prévue », **Then** la séance personnalisée occupe ce passage de la rotation uniquement après avoir réellement été terminée.
3. **Given** un brouillon valide, **When** l'utilisateur choisit « Ajouter à mon programme », **Then** une nouvelle séance apparaît dans le programme et les séances existantes restent intactes.
4. **Given** une action de portée, **When** l'enregistrement échoue, **Then** le brouillon reste disponible et aucun état intermédiaire visible n'est présenté comme enregistré.

---

### User Story 3 - Faire construire une alternative par le Coach (Priority: P1)

L'athlète décrit la séance qu'il souhaite en langage naturel. Le Coach utilise son profil, son lieu, son matériel, sa récupération, son programme et son historique disponibles pour proposer une séance entière. L'athlète voit le contenu réel avant de l'accepter.

**Why this priority**: C'est la promesse différenciante du produit : garder l'initiative tout en bénéficiant de l'intelligence déjà présente.

**Independent Test**: Demander une séance alternative plus courte, recevoir une proposition complète validée, la refuser puis en demander une autre sans mutation silencieuse.

**Acceptance Scenarios**:

1. **Given** suffisamment de contexte réel, **When** l'utilisateur demande une nouvelle séance, **Then** le Coach consulte les données utiles, contrôle la proposition et affiche un aperçu complet avant toute modification.
2. **Given** une proposition du Coach, **When** l'utilisateur l'accepte, **Then** la séance est créée une seule fois et devient modifiable par les outils manuels existants.
3. **Given** une proposition du Coach, **When** l'utilisateur la refuse, **Then** aucun élément du programme ne change.
4. **Given** des données insuffisantes ou aucun matériel compatible, **When** le Coach ne peut pas construire une séance fiable, **Then** il l'explique sans inventer de charge, d'équipement ou de récupération.

---

### User Story 4 - Comprendre ce que l'application permet (Priority: P2)

L'espace Séances devient un centre de contrôle lisible : prochaine séance, reprise d'une séance en cours, création, séances du programme et accès au Coach ont chacun une action explicite.

**Why this priority**: Les fonctions existent aujourd'hui mais leur emplacement donne l'impression d'un parcours fermé.

**Independent Test**: Depuis l'ouverture de l'onglet Séances, un utilisateur peut identifier en moins de trois secondes comment commencer la séance prévue ou en créer une autre.

**Acceptance Scenarios**:

1. **Given** une séance en cours, **When** l'utilisateur ouvre Séances, **Then** « Reprendre » reste l'action principale et la création reste disponible sans concurrence visuelle.
2. **Given** aucune séance en cours, **When** l'utilisateur ouvre Séances, **Then** la séance prévue et « Créer une séance » sont visibles avant la liste secondaire.
3. **Given** aucune séance programmée, **When** l'utilisateur ouvre Séances, **Then** il peut composer lui-même ou demander au Coach sans rencontrer une impasse.

### Edge Cases

- L'utilisateur n'a aucun lieu ou aucun équipement exploitable.
- Une séance source est modifiée ou retirée pendant qu'un brouillon en est issu.
- Un exercice devient indisponible entre la composition et l'enregistrement.
- Deux confirmations sont envoyées presque simultanément.
- Une proposition du Coach expire ou le programme change avant sa confirmation.
- La séance remplaçante est ouverte puis abandonnée : la rotation ne doit pas avancer.
- Le réseau coupe après la validation du brouillon mais avant la navigation vers le Live.
- L'utilisateur dispose d'un ancien programme ou d'anciennes conversations Coach.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: L'espace Séances MUST présenter une action visible pour créer une séance, sans passer par les réglages avancés du programme.
- **FR-002**: L'utilisateur MUST pouvoir commencer un brouillon vide ou dupliquer une séance programmée existante.
- **FR-003**: Le compositeur MUST permettre d'ajouter, retirer et réordonner les exercices.
- **FR-004**: Le compositeur MUST permettre de régler les séries, la fourchette de répétitions, l'objectif de réserve, le tempo et le repos avec les conventions métier existantes.
- **FR-005**: Seuls les exercices compatibles avec le lieu choisi MUST pouvoir être enregistrés.
- **FR-006**: Le brouillon MUST rester local et réversible tant que l'utilisateur n'a pas confirmé sa portée.
- **FR-007**: L'enregistrement MUST être atomique : une séance et son contenu sont créés ensemble ou pas du tout.
- **FR-008**: L'utilisateur MUST choisir explicitement entre « Faire aujourd'hui », « Remplacer la séance prévue » et « Ajouter à mon programme ».
- **FR-009**: Une séance « Faire aujourd'hui » MUST rester hors de la rotation permanente tout en conservant un historique complet si elle est terminée.
- **FR-010**: Une séance remplaçante MUST faire avancer la rotation comme la séance prévue uniquement après une réalisation effective.
- **FR-011**: Ajouter une séance au programme MUST préserver toutes les séances existantes et placer la nouvelle séance à une position déterministe.
- **FR-012**: Le Coach MUST pouvoir proposer une séance entière à partir des outils de lecture et de validation déjà existants.
- **FR-013**: Une proposition complète du Coach MUST être persistée comme proposition, associée à la conversation et présentée avant toute mutation.
- **FR-014**: L'application d'une proposition Coach MUST revalider le contexte réel et refuser une proposition périmée ou devenue incohérente.
- **FR-015**: Le Coach MUST distinguer clairement une recommandation, une proposition en attente et une modification réellement appliquée.
- **FR-016**: Le Coach MUST NOT inventer de charge de travail, de matériel, de récupération ou de contexte personnel absent.
- **FR-017**: Les substitutions Live, la progression, le calcul des charges, la récupération et la validation hebdomadaire existants MUST rester les sources de vérité.
- **FR-018**: Les anciennes séances, conversations et propositions Coach MUST rester lisibles et fonctionnelles.
- **FR-019**: Les erreurs réseau ou métier MUST préserver le brouillon et expliquer l'action corrective sans créer de doublon.
- **FR-020**: Le parcours MUST respecter les zones sûres mobiles, les cibles tactiles et le comportement du clavier iPhone déjà établi dans l'application.

### Key Entities

- **Brouillon de séance**: Composition temporaire choisie par l'utilisateur, avec un nom, un lieu, une origine et une liste ordonnée d'exercices prescrits.
- **Portée**: Décision explicite décrivant si le brouillon est ponctuel, remplace le prochain passage de la rotation ou rejoint le programme permanent.
- **Séance programmée**: Gabarit durable appartenant au bloc actif et participant à sa rotation.
- **Séance ponctuelle**: Gabarit conservé pour l'historique mais exclu de la rotation active.
- **Proposition Coach**: Aperçu calculé et expirable d'une séance entière, associé à une conversation et soumis à confirmation.
- **Séance du jour**: Plan d'exécution réellement construit pour un lieu et un état du jour, distinct du gabarit qui l'a inspiré.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Depuis l'onglet Séances, l'action permettant de créer une séance est identifiable en moins de 3 secondes lors d'un test utilisateur.
- **SC-002**: Un utilisateur peut composer et enregistrer une séance de quatre exercices en moins de 3 minutes, hors temps de réflexion sportive.
- **SC-003**: Les trois portées produisent le comportement annoncé dans 100 % des scénarios automatisés et de revue terrain.
- **SC-004**: Aucune proposition du Coach ne modifie le programme avant une confirmation explicite.
- **SC-005**: Une double confirmation ou un nouvel envoi réseau ne crée jamais deux séances identiques.
- **SC-006**: Les parcours séance prévue, Live, substitution, repos et fin de séance continuent de réussir sans changement perceptible.
- **SC-007**: Sur les petits écrans ciblés, aucune action principale ni aucun champ actif n'est masqué par la navigation ou le clavier.

## Assumptions

- Le programme actif, les lieux, les exercices équipés et les moteurs d'adaptation existants restent les sources de données.
- Une séance ponctuelle est conservée pour assurer la provenance de l'historique, même si elle ne réapparaît pas dans la rotation.
- Remplacer la séance prévue signifie remplacer un seul passage de la rotation ; le gabarit permanent reste inchangé.
- Une séance proposée par le Coach est ajoutée au programme après confirmation ; l'utilisateur peut ensuite l'éditer manuellement.
- Le Coach s'appuie sur son moteur et ses outils actuels. Aucun second moteur conversationnel n'est créé.
- Les charges du Live restent calculées au démarrage par les moteurs existants ; le compositeur fixe une prescription, pas une charge personnelle inventée.
