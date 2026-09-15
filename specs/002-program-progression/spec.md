# Spécification : programmes pilotables et progression automatique

## Objectif

Permettre à une personne de construire et modifier ses programmes depuis les surfaces où elle s'entraîne, puis de retrouver dans le Live une prescription préremplie qui progresse automatiquement à partir de ses réalisations réelles.

## Scénarios utilisateur

### US1 — Première exécution sans saisie répétitive (P1)

Une personne ajoute un exercice avec une charge facultative et peut laisser les autres réglages proposés tels quels ou les omettre. Au premier Live, la répétition proposée correspond au bas de la fourchette. Une charge programmée est affichée telle quelle ; sans charge programmée, aucun poids n'est inventé et la première charge réellement validée devient le repère historique.

**Critère indépendant** : un exercice 2 × 8–12 à 10 kg s'ouvre à 10 kg et 8 reps ; le même exercice sans kg s'ouvre sans poids arbitraire et sa première série enregistrée sert au passage suivant.

### US2 — Double progression automatique et compréhensible (P1)

À chaque nouveau passage, les répétitions progressent une série à la fois dans la fourchette. Quand toutes les séries complètes atteignent le maximum, le système utilise le palier matériel suivant et repart au minimum. Une hausse réelle est annoncée par un bandeau bref.

**Critère indépendant** : 8/8 devient 9/8 puis 9/9 ; 12/12 à 10 kg devient 8/8 au cran supérieur disponible. Sans incrément documenté, aucune charge plausible n'est fabriquée.

### US3 — Programme modifiable depuis les Séances (P2)

Depuis Séances, une personne choisit le programme dont elle veut voir les séances. Dans l'édition d'un programme, elle peut réordonner les séances, puis réordonner, modifier ou retirer les exercices d'une séance.

**Critère indépendant** : changer de programme change la liste affichée ; déplacer une séance modifie la rotation ; déplacer ou éditer un exercice conserve son identité et son historique.

## Exigences fonctionnelles

- **FR-001** Le réglage de charge en kg est facultatif lors de l'ajout et de l'édition d'un exercice.
- **FR-002** Aucune charge ne doit être déduite du profil ou d'un coefficient générique.
- **FR-003** Sans historique, une charge saisie dans le programme est la proposition initiale ; avec historique, le moteur de progression existant reprend l'autorité.
- **FR-004** Sans charge programmée, la première charge validée dans le Live devient le repère des passages suivants.
- **FR-005** Les répétitions initiales correspondent au minimum de la fourchette.
- **FR-006** La progression remplit la fourchette série par série, puis change de palier matériel et remet les répétitions au minimum.
- **FR-007** Une hausse de charge réellement décidée est visible sans ouvrir un détail.
- **FR-008** Le tempo prescrit est visible directement sur les tuiles Focus et Liste.
- **FR-009** Le sélecteur de programme de Séances ne change pas silencieusement le programme actif.
- **FR-010** Les mutations d'ordre et de configuration vérifient que la ressource appartient à l'utilisateur authentifié.
- **FR-011** Le réordonnancement renumérote les positions sans doublon ni trou.
- **FR-012** Le retrait d'un exercice conserve ses références historiques.
- **FR-013** Les anciens programmes sans charge configurée restent lisibles et exécutables.
- **FR-014** Les réglages existants peuvent être omis par l'utilisateur sans empêcher l'ajout ; les valeurs de fonctionnement historiques restent des propositions modifiables, pas des mesures observées.

## Cas limites

- Charge d'assistance dont le sens est inversé.
- Paliers matériels inconnus ou appareil en butée.
- Série incomplète : aucune montée de charge.
- Programme non actif sélectionné pour consultation.
- Changement d'ordre concurrent ou index devenu obsolète.
- Ancienne ligne retirée mais encore référencée par une séance passée.

## Données clés

- **Exercice programmé** : instance, ordre, séries, fourchette, effort, tempo, repos, charge initiale facultative.
- **Réalisation** : charge et répétitions réellement validées par série.
- **Suggestion suivante** : sortie du moteur existant de double progression et motif explicatif.

## Critères de réussite

- Une première série configurée s'ouvre sans ressaisie de charge ni de répétitions dans 100 % des cas testés.
- Une charge absente reste absente jusqu'à une donnée réelle ou un repère matériel explicitement identifié.
- Les séquences 8/8 → 9/8 → 9/9 et 12/12 → cran suivant + 8/8 sont reproductibles automatiquement.
- Un utilisateur peut changer l'ordre d'une séance ou d'un exercice en deux gestes au plus sur mobile.
- Tous les chemins historiques restent lisibles après modification ou retrait d'une ligne de programme.

## Hypothèses

- Les paliers et incréments de chaque appareil restent la source de vérité pour une hausse de charge.
- La sélection d'un programme dans Séances sert à consulter ses séances ; l'activation de la rotation reste une action distincte.
- Les valeurs proposées par défaut restent modifiables et ne sont enregistrées comme réalisation qu'après validation d'une série.
