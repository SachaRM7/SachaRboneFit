# Interface V2 — septembre 2026

Direction : application sportive, fond ivoire ou graphite, surfaces sauge, action principale citron et accent terre cuite. Typographies Outfit et Geist auto-hébergées.

## Écrans et interactions

- Accueil recomposé autour de la prochaine séance, avec programme et accès contextuels au coach ; indicateurs personnels regroupés en dessous.
- Navigation latérale sur ordinateur, barre mobile avec accès central au coach ; en séance, les commandes métier restent prioritaires.
- Programme présenté comme un parcours de séances avec états terminée, prochaine et à venir.
- Bibliothèque illustrée avec recherche par exercice, muscle ou machine, insensible aux accents ; filtres métier et salle conservés.
- Navigation directe entre exercices en mode Focus, minuterie agrandie et bilan de progression en indicateurs lisibles.
- Coach avec accueil, suggestions de questions et conversations. Une suggestion prépare un brouillon ; elle n’envoie pas de message automatiquement.
- Thèmes clair et sombre, focus clavier, zones de sécurité mobiles et préférence de réduction des animations conservés.

## Vérification

- 1 377 tests existants passent, répartis dans 92 fichiers.
- Compilation Next.js et TypeScript réussie ; ESLint : aucune erreur, 93 avertissements existants.
- Rendu examiné dans le navigateur sur ordinateur et à 390 × 844 : accueil, programme, progression et ouverture du coach. Données fictives dans une route locale temporaire, retirée avant livraison.
- Aucun changement des API, moteurs de calcul, services IA, schémas ou stockage de séance.
- Les parcours authentifiés complets ne sont pas validés localement : les paramètres publics Supabase manquent dans cet environnement. L’aperçu Vercel utilise la configuration du projet.
- La modification préexistante de package-lock.json reste exclue de cette refonte.

## Références consultées après le premier retour

Recherche et examen visuel le 8 septembre 2026. La première passe n'avait pas utilisé de recherche web.

- [Gofit / UI8 sur Pinterest](https://www.pinterest.com/pin/43417583902788770/) : hiérarchie mobile, contrôles de repos, actions principales ancrées, listes d'exercices illustrées. Les visuels propriétaires ne sont pas copiés dans l'app.
- [Hevy — suivi d'entraînement](https://www.hevyapp.com/use-cases/fitness-app/) et sa [vue de saisie](https://www.hevyapp.com/wp-content/uploads/Group-25.png) : charges et répétitions dominantes, historique juste à côté, ligne validée identifiable. Application : fonds différenciés pour la série courante et les séries validées, champs et validation plus confortables.
- [Fitbod](https://fitbod.me/) : référence fonctionnelle pour l'articulation entraînement, matériel et récupération ; aucune reprise de logique ou de contenu.

La carte de séance interrompue place désormais les actions sous le message sur téléphone. La consigne de calibration est raccourcie tout en conservant la demande de réserve de répétitions.

## État du jour et banque d’exercices

- État du jour organisé en trois groupes ; nom de salle rendu par un sélecteur natif, indicateurs sommeil/énergie, matériel et horaires repliables, validation ancrée au-dessus de la navigation. Le chargement, l’échec et l’absence de salles sont distingués. Les valeurs et le corps de la requête restent identiques ; une salle inconnue ne peut plus être envoyée.
- Accès « Banque d’exercices » depuis Mon espace. Fiches avec muscles principaux/secondaires, consignes pas à pas, points clés, erreurs, sensations et sécurité selon le contenu disponible. Les données enregistrées sont prioritaires ; les fiches déjà rédigées pour le seed servent de repli sans écriture en base.
- Illustration avec animation et sélection de position. Le contrôle visuel a identifié deux erreurs préexistantes : images de presse à cuisses associées au hack squat, et variante incompatible avec la fiche à genoux du cable crunch. Ces dessins sont écartés partout via le manifeste commun. Liens de remplacement consultés : [hack squat](https://www.strengthlog.com/hack-squat-machine/) et [cable crunch](https://www.strengthlog.com/cable-crunch/) chez StrengthLog. Le reste du corpus n’a pas fait l’objet d’une validation exhaustive du geste.
- Vérification mobile à 390 × 844 avec réponses API fictives dans une route temporaire retirée : salle présélectionnée, options de shift et matériel, ouverture des courbatures, présentation des fiches et sélection d’image. Aucun état sportif réel enregistré pour ces essais.
- 1 378 tests passent, dont une régression empêchant la réapparition des dessins de presse sur le hack squat.
- Compilation Next.js/TypeScript réussie et ESLint sans erreur (89 avertissements). Le contrôle ciblé des illustrations passe après la seconde exclusion.
