# Recherche et décisions

## 1. Représentation d'une séance personnalisée

**Décision** : toute composition enregistrée devient un `seance_template`, puis le Live utilise le générateur de plan existant.

**Pourquoi** : `construireSeanceDuJour` copie déjà les prescriptions, applique disponibilité, récupération et charges, puis écrit le log et les items atomiquement. Le contourner créerait une seconde vérité.

## 2. Séance ponctuelle

**Décision** : conserver les gabarits ponctuels dans un bloc inactif réservé aux séances libres de l'utilisateur.

**Pourquoi** : le bloc actif est la seule source de rotation. Un bloc inactif garde la provenance et l'historique sans ajouter de colonne ni modifier le programme permanent.

## 3. Remplacement d'un passage de rotation

**Décision** : construire le plan depuis le gabarit ponctuel mais enregistrer dans le log l'identifiant de la séance planifiée remplacée. Cette différence est transmise par un `rotationTemplateId` optionnel et validé côté serveur.

**Pourquoi** : la rotation existante avance à partir des séances terminées. Le gabarit d'origine reste intact et le remplacement ne compte qu'après fin réelle du Live.

## 4. Validation et autonomie

**Décision** : bloquer les incohérences structurelles et le matériel absent. Présenter récupération, durée et phase comme conseils confirmables dans le parcours manuel. Les propositions Coach restent soumises à la validation stricte existante.

**Pourquoi** : le parcours manuel doit rendre le contrôle à l'utilisateur sans laisser passer une séance inexécutable. Les signaux contextuels ne doivent pas devenir des interdictions opaques.

## 5. Proposition Coach complète

**Décision** : réutiliser `coach_propositions` avec `sujet="construction_seance"`, `operation="creer_seance"` et `seanceTemplateId=null`, puis appliquer la proposition en transaction.

**Pourquoi** : la table possède déjà conversation, statut, expiration, empreinte, paramètres et aperçu. Une nouvelle table ou un second moteur IA serait redondant.

## 6. Idempotence

**Décision** : le brouillon possède un UUID stable utilisé comme identifiant du nouveau gabarit. Une répétition du même envoi retourne le résultat existant au lieu de créer un doublon.

**Pourquoi** : cela couvre double tap et coupure réseau sans nouvelle colonne.

## 7. Architecture d'interface

**Décision** : page serveur pour charger programme, lieux et exercices ; composant client pour éditer le brouillon ; route authentifiée pour enregistrer.

**Pourquoi** : le brouillon reste rapide et réversible, tandis que l'autorisation et la validation finale restent côté serveur.
