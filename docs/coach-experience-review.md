# Coach — revue de la refonte

## Expérience

La destination `/coach` et les ouvertures contextuelles partagent `CoachConversation`. La page donne la priorité au champ libre et à quatre suggestions maximum. Les suggestions personnelles viennent de données relues côté serveur ; sans données, les questions restent pédagogiques. L’historique se consulte depuis l’en-tête, avec titre, aperçu et date relative.

Le tiroir contextuel conserve l’écran sous-jacent. Home et Programme gardent leurs accès ; Progrès possède « En parler », y compris depuis un exercice. Le Live transmet l’instance, la séance et le numéro de série depuis « Pourquoi cette charge ? ». Les boutons Douleur et Machine occupée invoquent les actions Live existantes.

## Sources et compatibilité

- Même route de chat, client LLM, outils et propositions confirmables ; aucun moteur de progression, récupération ou substitution recopié.
- Aucun schéma, champ métier ou format de stockage ajouté. Les anciens messages texte restent affichables.
- Le serveur contrôle le compte et les entités. Une machine partagée est reconnue via le plan ou le gabarit de la séance authentifiée, ou les séries du compte dans des séances non archivées. Les mesures Live restent limitées à la séance désignée.
- Une séance ancienne sans plan figé est signalée comme telle ; aucune prescription du brouillon n’est présentée comme vérifiée.
- Le prompt demande la réponse directe avant les détails, distingue repère et progression, et exclut les identifiants techniques des explications.
- `react-markdown`, GFM et les retours à la ligne rendent titres, gras, listes, tableaux et liens. Pas de HTML brut exécuté ; pas de troncature des anciennes réponses.
- Le protocole réseau reste la réponse JSON complète existante. Il n’y avait pas de streaming actif à préserver.

## Vérifications

Validations exécutées dans GitHub Actions, sans serveur de développement local : ESLint, TypeScript, unitaires, composants, build Next et intégration sur Postgres jetable. Les suites couvrent notamment le contexte authentifié, les propositions, la persistance des séries, les reprises, la douleur, les symptômes et l’isolation des comptes.

Tests ajoutés : accueil sans données/avec contexte, Markdown varié et ancien texte long, liens dangereux, navigation/composer, erreur et retry par les deux boutons, reprise d’historique sans contexte étranger, pont vers les incidents Live, visualViewport et nettoyage des listeners. Un test d’intégration force une erreur IA, puis vérifie qu’une nouvelle tentative conserve un seul message utilisateur et enregistre la réponse.

Sur la preview, compte de test autorisé : accueil, envoi libre, réponse RPE 7, analyse personnelle avec tableau, historique et reprise, ouverture Home/Programme/Live, fermeture vers la même série, raccourcis Douleur/Machine occupée. Contrôles de largeur à 320 et 390 px et de hauteur visible réduite à 430 px : champ et bouton d’envoi restent dans le viewport, sans débordement horizontal.

## Limites observées

- Le test de hauteur réduite et le test visualViewport ne remplacent pas un essai du clavier Safari sur un iPhone physique.
- Le fournisseur a refusé un appel contextuel Live avec HTTP 429 puis 413. Le contexte était reconnu ; la réponse n’était pas disponible. La question est conservée et les erreurs quota/capacité sont distinguées. Les réponses IA restent soumises aux limites du fournisseur.
- Le parcours Machine occupée répond « Exercice introuvable » sur une machine partagée de ce compte. Reproduit également avec le bouton direct du Live ; aucune modification de ce moteur dans cette refonte.
- La déduplication du retry fonctionne lorsque l’identifiant de conversation est reçu. Une coupure réseau avant réception de cet identifiant peut encore laisser une conversation incomplète dans l’historique ; aucune idempotence globale n’est revendiquée.
- L’utilisateur réel testé possède surtout des premiers repères. Les états sans données et avec contexte riche sont couverts par tests ; aucune prétention à une validation terrain sur plusieurs mois d’entraînement.

Le brouillon Live du compte de test n’a pas été enregistré comme une performance. Aucune migration ni fusion de cette PR, et aucun déploiement de cette refonte en production.

## Fichiers

- Destination et rendu : `src/app/(app)/coach/page.tsx`, `src/app/coach.css`, `src/app/globals.css`, `CoachConversation.tsx`, `CoachDrawer.tsx`, `ReponseCoach.tsx`, `useCoachViewport.ts`.
- Navigation et contexte : `BoutonCoach.tsx`, `ContexteCoach.tsx`, `AppTopbar.tsx`, `BottomNav.tsx`, `ContenuProgression.tsx`, `LecteurExercice.tsx`, page Live.
- Serveur et consignes : routes `api/coach/accueil` et `api/coach/chat`, `accueil-conversation.ts`, `contexte-ecran.ts`, `system-prompt.ts`, `services/contexte-coach.ts`.
- Validation : tests Coach, garde des lecteurs de séries, workflow `live-review.yml`, dépendances et lockfile.
