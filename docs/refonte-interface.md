# Refonte de l’interface — septembre 2026

Direction : interface sportive minérale, accent turquoise, typographie Outfit / Geist auto-hébergée, surfaces claires et sombres cohérentes.

## Changements

- Thème commun aux composants Base UI et aux écrans métier ; couleurs des graphiques conservées.
- Accueil hiérarchisé autour de la prochaine séance, cartes secondaires en deux colonnes à partir de 900 px.
- Navigation active, mise en page limitée en largeur, accès au coach, cartes et champs harmonisés.
- Progression en tuiles, réglages avec icônes, sélection des séances et commandes Focus / Liste modernisées.
- Champs et boutons principaux de 44 px, focus clavier visible, zoom autorisé, réduction des animations respectée.
- Zones de sécurité mobiles et dégagement des commandes fixes conservés.

## Vérification

- `npm run build` réussi (compilation, TypeScript et génération des pages).
- `npm run lint` : aucune erreur, 93 avertissements dans le dépôt.

- 1 377 tests existants passent avec `npx vitest run --maxWorkers=2`.
- Le test `douleur-a-un-chemin` normalise désormais les séparateurs Windows avant ses comparaisons de chemins.
- Contrôle navigateur sur des composants réels avec données fictives : formats 390 × 844 et 1440 × 1000, thèmes clair et sombre, changement Focus / Liste et saisie affichée. La route temporaire utilisée pour ce contrôle a été supprimée.
- Aucun changement des services, API, moteurs de calcul, schéma de données ou stockage de séance.
- La connexion et les parcours connectés réels restent à vérifier avec la configuration Supabase : `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` manquent dans l’environnement local.

Les changements préexistants de `package-lock.json` n’ont pas été modifiés par cette refonte.

## Références consultées après le premier retour

Recherche et examen visuel le 8 septembre 2026. La première passe n'avait pas utilisé de recherche web.

- [Gofit / UI8 sur Pinterest](https://www.pinterest.com/pin/43417583902788770/) : hiérarchie mobile, contrôles de repos, actions principales ancrées, listes d'exercices illustrées. Les visuels propriétaires ne sont pas copiés dans l'app.
- [Hevy — suivi d'entraînement](https://www.hevyapp.com/use-cases/fitness-app/) et sa [vue de saisie](https://www.hevyapp.com/wp-content/uploads/Group-25.png) : charges et répétitions dominantes, historique juste à côté, ligne validée identifiable. Application : fonds différenciés pour la série courante et les séries validées, champs et validation plus confortables.
- [Fitbod](https://fitbod.me/) : référence fonctionnelle pour l'articulation entraînement, matériel et récupération ; aucune reprise de logique ou de contenu.

La carte de séance interrompue place désormais les actions sous le message sur téléphone. La consigne de calibration est raccourcie tout en conservant la demande de réserve de répétitions.
