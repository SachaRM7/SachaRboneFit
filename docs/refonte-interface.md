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

- Contrôle connecté sur l’aperçu déployé : nom réel St-Martin-Du-Touch dans l’état du jour, accès Mon espace → Banque, catalogue de 120 exercices et fiche Cable Crunch (muscles et consignes) vérifiés en lecture seule. Les anciens codes de muscles sont normalisés dans les cartes et la recherche.

## Prototype anatomique 3D

- Studio `/exercises/3d`, accessible depuis la banque : squat au poids du corps, curl biceps avec haltères et élévations latérales. Rotation libre, vues face/profil/dos, pause, ralenti et décomposition manuelle. Le mouvement démarre en pause.
- [BodyExplorer](https://github.com/JohanBellander/BodyExplorer) fournit les sources anatomiques ; seuls les modèles BodyParts3D sont conservés, sous CC BY-SA 2.1 Japan. Attribution, modifications et instructions de reconstruction accompagnent le modèle dans `public/models/exercises-3d`. Le code de LiftLab n’est pas repris, faute de licence explicite dans le dépôt consulté.
- Rig et mouvements originaux, simplifiés et non validés biomécaniquement. La prise des mains est approximative. La coloration désigne les muscles ciblés ; elle ne mesure pas leur activation. Ce prototype reste distinct d’une bibliothèque de mouvements validés.
- Correspondances explicites par slug, sans changer les identifiants : curl et élévations sont compatibles avec le matériel du catalogue. Le squat avec barre existant n’est pas relié au squat sans charge. Les autres fiches conservent leurs médias et consignes.
- Moteur et modèle chargés à l’ouverture ; rendu arrêté à l’arrière-plan, ressources libérées à la fermeture. Le fichier anatomique fait environ 11 Mo avant compression HTTP. Sa compression et l’amélioration des articulations restent nécessaires avant généralisation.
- 1 384 tests réussis avec deux workers, dont six sur les correspondances, la continuité des boucles et l’ancrage des chevilles. Le premier passage parallèle a rencontré deux délais de cinq secondes dépassés ; le passage complet suivant réussit. Contrôles navigateur à 390 × 844 et sur ordinateur : trois modèles, flexion du squat, cadrage des bras, vues et lecture à ¼×.
## Séance live sur mobile

- Suppression de la barre SOS fixe et masquage de la navigation principale pendant le Live mobile. « Machine occupée » et « Douleur » rejoignent « Remplacer » dans chaque carte ; leur ouverture sélectionne explicitement cet exercice, y compris en Liste. Les ajustements de durée et d’état restent près du chronomètre.
- Une seule navigation en Focus, titre dégagé, consignes de calibration repliables et saisie par série adaptée aux petits écrans. Les boutons de réglage passent à la ligne plutôt que de déborder.
- Contrôle navigateur à 320 et 390 px avec les vrais composants sur une route de démonstration temporaire, retirée ensuite. Aucun entraînement réel enregistré ou terminé. Vérification des deux vues, des noms longs et du ciblage des actions dans la démonstration.
- 1 384 tests réussis ; ESLint ciblé sans erreur (quatre avertissements existants).
- Compilation de production Next.js et contrôle TypeScript réussis après retrait de la route de démonstration.
## Accueil et progression : comprendre avant d’explorer

- État du jour remonté avant la séance, à partir du feu réellement calculé. La phase affiche son objectif et ses séances mesurées. Aucun score global /100 ou pourcentage de récupération n’est inventé.
- Récupération regroupée par états du moteur ; compte des muscles affichés, groupes repliables et détail de la dernière exposition. Les muscles neutres restent explicitement comptés à part. Les libellés restent centralisés dans le service.
- Pré-calcul renommé « Préparer la suite » : le service lit une cible du jour, et ne justifiait pas le titre « Séance de demain ». Le contenu reste accessible et mène au programme. Les séances récentes gardent leurs dates, durée, énergie et lien d’analyse.
- Progression ouverte sur sa phase d’historique et quatre cartes alimentées par le bilan. Le détail reste accessible sous une section repliable, y compris les règles d’attente du moteur. Les alias de muscles sont traduits dans le bilan.
- Une seule mesure d’exercice devient une référence lisible ; un volume nul ne dessine plus d’axes vides. Records améliorés et premières références sont séparés, avec charge et répétitions réelles en premier. Les pesées sont présentées comme optionnelles et reliées à leur formulaire existant. Les erreurs de lecture des records et de l’exercice ne passent plus pour des historiques vides.
- Coach plus discret dans Progrès. Aucun endpoint d’écriture, calcul sportif ou flux d’enregistrement modifié.
- Contrôle mobile à 390 et 320 px sur une route temporaire retirée : accueil, groupes et détails musculaires, navigation aller/retour des quatre vues, première référence, volume nul, records/références et absence de pesées. Les données de démonstration étaient isolées ; aucune séance ni pesée réelle n’a été écrite.
- 1 384 tests réussis ; ESLint ciblé et TypeScript sans erreur.
- Compilation de production Next.js réussie après retrait de la route de contrôle.
