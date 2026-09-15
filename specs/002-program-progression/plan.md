# Plan d'implémentation

## Contexte technique

- Next.js 16 App Router, React 19 et TypeScript strict.
- Drizzle/PostgreSQL avec migrations SQL manuscrites après `0013`.
- Le moteur `computeNextSets` et les primitives de charge matérielle restent l'unique logique de progression.
- Les routes existantes conservent leur vérification d'authentification et d'appartenance.

## Décisions

1. Ajouter une charge initiale nullable à la ligne de programme ; ne pas la copier dans un second moteur.
2. À historique vide, la charge programmée alimente la prescription. Dès qu'une série réelle existe, l'historique et `computeNextSets` reprennent l'autorité.
3. Étendre les routes et services existants pour l'édition et l'ordre, avec renumérotation transactionnelle.
4. Le sélecteur de Séances utilise un paramètre de requête et n'active aucun programme implicitement.
5. Les vues Live lisent le tempo de la prescription déjà chargée et montrent les motifs `montee` existants.

## Garde-fous

- Aucune mutation de données de production pendant l'implémentation.
- Aucune charge anthropométrique ou incrément codé en dur.
- Les lignes d'exercice retirées restent archivées.
- Le plan de séance persisté reste non nullable pour les séries et répétitions effectives.

## Validation

- Tests unitaires du moteur et du cold start.
- Tests de composants pour le sélecteur et les contrôles d'édition.
- Tests d'intégration des mutations et de la première charge si une base de test est disponible.
- Typecheck, lint, tests et build.
- Vérification mobile sur preview Vercel.
