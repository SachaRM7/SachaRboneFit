# Home — coach, prochaine action, détails à la demande

Travail sur `codex/home-coach`, dans `D:/Dev/SachaRboneFit-home`, depuis `main` (`f79bb9d`). Le checkout initial, qui contenait une modification du lockfile et une ancienne branche V2, est conservé intact.

## Résultat

1. Salutation courte et unique mascotte fonctionnelle : le résolveur existant fournit son état, et une séance en cours conserve l'état `training`. Le message et la mascotte ouvrent le coach au contexte accueil.
2. Carte séance dominante. Son titre mène au programme, son bouton suit exactement `etat.action.href` : la préparation et les adaptations existantes ne sont pas contournées. La reprise, la clôture et le consentement d'abandon sont conservés.
3. Trois accès compacts : muscles, forme/tendance, poids. La synthèse musculaire donne priorité aux zones à protéger puis à la récupération, en comptant les verdicts du service existant.
4. Observations regroupées : alertes, préparation et débrief comptés comme « points à voir ». Une alerte de priorité warning/danger conserve un signal visible avant ouverture.

Les listes musculaires, les détails de récupération, la tendance, la courbe de poids, les alertes individuelles, la préparation, les débriefs, les séances récentes et l'aperçu du programme restent derrière des panneaux. Les liens vers le programme, la progression et l'historique restent disponibles. Les panneaux ferment avant l'ouverture du coach pour éviter deux fenêtres superposées.

## Sources et périmètre

- `essentielTableauDeBord` : utilisateur, prochaine action du moteur, feu du jour, tendance et poids.
- `complementTableauDeBordMemoise` : récupération, programme, alertes, préparation, débrief et séances récentes. Les trois emplacements serveur partagent ce résultat mémoïsé pendant le rendu ; ils ne bloquent pas l'action essentielle.
- `useSessionStore` : brouillon actif et parcours de reprise/abandon inchangés.
- `mascotteDeLAccueil`, `FournisseurCoach` et `DeclarerContexte` : états et contexte du coach existants.

Aucun changement d'API, de schéma, de store, de moteur métier ou de service. Aucune nouvelle dépendance. Aucun changement de navigation globale. Aucune donnée de production consultée ou modifiée pour les essais. Aucun déploiement ni merge.

## Fichiers

Présentation :

- `src/app/(app)/dashboard/page.tsx`
- `src/app/(app)/dashboard/home.css` (nouveau, styles limités à la Home et à ses panneaux)
- `src/components/dashboard/ContenuTableauDeBord.tsx`
- `src/components/dashboard/CarteAujourdhui.tsx`
- `src/components/dashboard/ComplementTableauDeBord.tsx`
- `src/components/dashboard/ActionsCoach.tsx`
- `src/components/dashboard/DetailsAccueil.tsx` (nouveau)
- `src/components/dashboard/RecuperationAccueil.tsx` (nouveau)

Vérification :

- `src/tests/home-coach.ctest.tsx` (nouveau)
- `src/tests/fixtures/home.ts` (nouveau ; uniquement utilisé par les tests)
- `src/tests/mascotte-coach.ctest.tsx`
- `src/tests/mascotte-sur-les-surfaces.test.ts`
- `src/tests/recuperation-a-un-chemin.test.ts`
- `src/tests/hotfix-db-timeouts.test.ts`
- `src/scripts/apercus.tsx` (adaptation à la nouvelle composition de la carte)
- `docs/home-coach.md`

## Validations du 12 septembre 2026

| Contrôle | Résultat |
| --- | --- |
| `npx tsc --noEmit` | Réussi après génération des types par le build standard |
| `npm run lint` | Réussi, sans avertissement |
| `npm test -- --maxWorkers=2 --reporter=dot` | 104 fichiers, 1 518 tests réussis |
| `npm run test:composants -- --maxWorkers=2` | 7 fichiers, 101 tests réussis |
| `npm run build` — Next 16.2.2 / Turbopack | Réussi |
| `git diff --check` | Réussi |

Le worktree réutilise les dépendances d'un autre checkout sur D: par une jonction. Pour le build Turbopack, `turbopack.root` a temporairement été positionné sur `D:/Dev`, comme requis pour résoudre ces dépendances hors du dossier du worktree. La configuration a ensuite été restaurée intégralement. Un checkout avec ses propres `node_modules` n'a pas besoin de cette adaptation locale. L'essai Webpack initial avait échoué sur le contrôle d'un export de route préexistant ; le build standard Turbopack et son typecheck passent sans modifier cette route.

Les nouveaux tests rendent les vrais composants et vérifient l'ordre des blocs, les vrais href, la divulgation des détails, le retour du focus, le contexte coach, le passage panneau → coach, les états absents/indisponibles, la protection musculaire, la reprise et la confirmation avant abandon. Les gardes de branchement existants suivent désormais le nouvel emplacement des composants, sans retirer leur invariant.

## Contrôle visuel

Navigateur Edge piloté par Playwright, vrais composants et styles Next, données synthétiques réservées aux essais locaux. La page de contrôle temporaire a été retirée avant le build final.

- 320 × 568, 390 × 844, 430 × 932 et 1440 × 900.
- Quatre états par taille : séance prévue, données absentes, séance faite, feu rouge avec nom long.
- 16 pages et 16 ouvertures de panneaux : aucun débordement horizontal ni erreur JavaScript ; bouton de séance atteignable par défilement ; panneaux contenus dans le viewport avec défilement interne.
- Vérification visuelle du panneau musculaire : le bouton Coach ne recouvre plus son contenu.
- En 390 px, avec 47 px réservés en haut, le bouton Commencer débute à environ 409 px et mesure 56 px de haut.

Preuves locales : `D:/Temp/home-visual-results.json`, `D:/Temp/home-390-normal.png`, `D:/Temp/home-320-normal.png`, `D:/Temp/home-430-normal.png`, `D:/Temp/home-1440-normal.png`, `D:/Temp/home-sheet-320-Muscles.png`.

## Limites

- Pas de validation sur un iPhone physique. Les viewports mobiles et marges de l'application ont été simulés ; les safe areas natives restent gérées par `env(safe-area-inset-*)` et les variables existantes.
- Pas de durée ni de nombre d'exercices inventés : ces valeurs ne sont pas exposées dans la réponse essentielle actuelle. Le programme demeure accessible pour explorer la séance.
- La fermeture visuelle des détails ne supprime pas leurs calculs serveur : le chargement complémentaire existant reste streamé et partagé. Ce lot change la présentation, pas les moteurs ni leur coût.
- La validation UI utilise des données de test locales, pas une séance réelle enregistrée en production.
