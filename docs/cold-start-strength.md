# Cold-start de la première charge — v1

## Décision

`cold-start-v1.0.0` ne transforme pas le sexe, l’âge, la taille ou le poids en
charge de musculation. Ces données sont collectées pour permettre un futur
modèle documenté, mais aucun coefficient populationnel n’est activé dans cette
version.

L’ordre d’autorité implémenté est :

1. charge déjà utilisée dans la séance ;
2. historique de la même instance, via la double progression existante ;
3. premier cran ou charge minimale réellement documenté pour cette instance ;
4. aucune estimation chiffrée, puis protocole de premier essai de la PR #23.

Les transferts entre machines, les ratios anthropométriques et les priors
populationnels restent indisponibles. La résistance intrinsèque d’une machine
(`poids_non_compte`) n’est jamais additionnée : elle ne décrit pas l’effort
effectif sans la géométrie et la convention du constructeur.

## Pourquoi aucun coefficient populationnel

- L’étude de Glass et Stanton observe l’intensité que choisissent des novices ;
  elle ne valide pas une équation permettant de déduire la charge d’un individu
  à partir de son profil. DOI : https://doi.org/10.1519/R-12482.1
- Les équations récentes validées pour le développé couché et l’extension de
  jambes partent déjà d’une charge testée et de répétitions réellement faites.
  Elles ne résolvent donc pas le tout premier essai. DOI :
  https://doi.org/10.1519/JSC.0000000000004987
- Chez de jeunes femmes non entraînées, le protocole expérimental commence par
  la barre ou la machine à vide, puis augmente selon la difficulté perçue. Il
  soutient le protocole progressif, pas une charge anthropométrique prédite.
  Article primaire : https://pmc.ncbi.nlm.nih.gov/articles/PMC10190845/
- La position de l’ACSM définit des plages relatives à un 1RM déjà connu. Elle
  ne permet pas d’obtenir ce 1RM depuis le poids corporel. DOI :
  https://doi.org/10.1249/MSS.0b013e3181915670

Utiliser les moyennes d’un échantillon comme prescription individuelle aurait
une précision apparente et aucune validation sur les 120 mouvements, les
différentes marques de machines et leurs conventions de charge.

## Couverture exacte

Une charge d’essai chiffrée est disponible pour toute instance de résistance
qui possède `charge_minimale` ou une liste `paliers_charges` non vide. Cela
couvre les piles, haltères, barres préchargées et machines dont le premier cran
a été réellement décrit.

Le cran doit être strictement positif. Un zéro générique ne prouve pas qu’une
série chargée est réalisable et n’est donc jamais présenté comme estimation.

| Origine | Confiance | Usage |
| --- | --- | --- |
| `serie_courante` | haute | saisie réelle de la séance en cours |
| `historique_instance` | haute | double progression existante sur le même appareil |
| `minimum_materiel` | faible | essai prudent, à confirmer par la réserve saisie |
| `indisponible` | aucune | aucun nombre affiché |

Le résultat reste `null` pour :

- un appareil dont le premier cran est inconnu ;
- un exercice au poids du corps ;
- une assistance, car sa valeur minimale est justement la plus difficile ;
- un profil incomplet ou `sexe = non_precise` quand aucune donnée matérielle ne
  suffit (aucune valeur de remplacement n’est inventée).

## Sortie structurée

Chaque résultat contient `charge`, `confiance`, `origine`, `explication` et
`versionModele`. Le résultat est calculé à la lecture du Live et n’est jamais
persisté comme force réelle. Seules les séries effectivement validées restent
la vérité métier.

## Passage au réel

Après la première série, le moteur existant compare la réserve saisie à la cible
et choisit le cran réellement disponible : trop facile, conserver, ou plus
facile. Aucun nouveau champ, aucune nouvelle métrique et aucune seconde logique
de progression ne sont créés.
