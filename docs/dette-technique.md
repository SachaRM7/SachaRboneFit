# Dette technique

Ce qui est connu, volontairement non corrigé, et pourquoi. Chaque entrée dit
où le problème se trouve, ce qu'il produit comme comportement, et ce qui
retient la correction.

---

## 1. Sept implémentations divergentes du maximum estimé (e1RM)

**Statut :** identifiée, non corrigée. À traiter dans un chantier dédié.

La formule d'Epley (`charge × (1 + reps / 30)`) est réécrite à la main dans
neuf endroits. Deux d'entre eux font autorité et sont cohérents ; les sept
autres divergent chacun à leur façon.

### La référence

| Emplacement | Réserve (RIR) | Plafond 20 reps | Garde `reps === 1` | Arrondi |
|---|---|---|---|---|
| `src/lib/engine/records.ts` → `estimer1RM()` | oui | oui | oui | non |
| `src/lib/engine/calibration.ts` → `estimer1RM()` | oui | oui | oui | non |

`records.ts` est la définition de référence, exportée depuis le chantier
Progression. `calibration.ts` en est l'équivalent exact sur un autre type
d'entrée (`EssaiCalibration`) : consolidation à faible risque.

### Les sept copies divergentes

| Emplacement | Réserve | Plafond | Garde `reps === 1` | Arrondi |
|---|---|---|---|---|
| `src/lib/engine/feu-biologique.ts:69` | **non** | **non** | oui | non |
| `src/services/progression.ts:30` (`feuDeTendance` seul) | **non** | **non** | oui | non |
| `src/components/session/ProgressionSummary.tsx:21` | **non** | **non** | oui | **oui** |
| `src/app/api/sessions/tendency/route.ts:52` | **non** | **non** | **non** | non |
| `src/lib/coach/tools.ts:51` | **non** | **non** | **non** | **oui** |
| `src/lib/coach/outils-programme.ts:258` | **non** | **non** | **non** | non |
| `src/app/api/progression/exercise/route.ts:55` | **non** | **non** | **non** | non |

### Conséquences observables

- **Réserve ignorée (les sept).** Une série de 10 répétitions arrêtée à RIR 3
  vaut autant qu'une série de 13 menée à l'échec. Sans la réserve, elle est
  sous-estimée d'environ 10 %. Deux écrans peuvent donc désigner deux
  « meilleures séries » différentes pour le même historique — et c'est déjà le
  cas entre l'écran Progression (réserve comprise) et le coach (non).
- **Pas de plafond à 20 répétitions effectives (les sept).** Epley dérive sur
  les séries longues : 40 kg × 25 donne 73 kg estimés, une valeur qui ne veut
  rien dire. Les exercices au poids du corps et les séries d'endurance sont les
  premiers concernés.
- **Garde `reps === 1` absente (quatre copies).** Un vrai maximum à une
  répétition de 100 kg est rapporté à 103,3 kg. L'erreur est petite mais
  systématique, et elle touche précisément la mesure la plus fiable.
- **Arrondi à la source (deux copies).** Comparer des valeurs déjà arrondies
  fait passer pour égales deux performances distinctes, et inversement.

### Ce qui retient la correction

Chacune de ces copies alimente une logique testée ailleurs — feu biologique,
tendance de séance, outils du coach. Les aligner d'un coup changerait plusieurs
comportements en même temps, sans qu'aucun test existant ne dise lesquels sont
volontaires. Le risque est une régression diffuse, difficile à attribuer.

**Chantier dédié, dans cet ordre :** consolider `calibration.ts` sur
`records.ts` (équivalent, risque nul) ; puis les copies sans conséquence
métier (`coach/tools.ts`, `api/sessions/tendency`, `api/progression/exercise`) ;
puis, une par une et avec caractérisation préalable, `feu-biologique.ts` et
`progression.ts` — celles-ci décident de comportements d'entraînement.

---

## 2. Seuil de couverture RPE à 60 %, à réévaluer sur données réelles

**Statut :** paramètre provisoire, assumé comme tel.

`POIDS.partRpeSuffisante` (`src/lib/engine/score-progression.ts`) vaut `0.6` :
en dessous de 60 % de séries portant un RPE, la réserve n'entre pas dans le
maximum estimé et le calcul retombe sur charge × répétitions.

La valeur est un choix de départ, pas une mesure. Elle arbitre entre deux
erreurs : trop bas, une séance où le RPE a été saisi bat une séance où il a été
oublié — on mesure la saisie, pas les progrès ; trop haut, la réserve n'est
jamais utilisée et une progression réelle en facilité passe inaperçue.

**À réévaluer** une fois qu'un historique réel existe, en regardant la
distribution effective du taux de saisie du RPE par exercice. Le champ
`reserveUtilisee` de `ProgressionExercice` indique, pour chaque exercice, lequel
des deux calculs a servi : c'est la donnée qui permettra de trancher.

---

## 3. Écrans de la refonte UX restant à traiter

Issus de la spécification d'usage, non encore repris :

- écran « Plus » (§25) ;
- passe de microcopie (§28).

Traités depuis : le retour de fin de séance (§13), la représentation du
cycle (§17) et le coach contextuel (§22/23).

---

## 4. `programme_blocs` : trois colonnes qui ne disent pas ce qu'elles promettent

**Statut :** contournées, non migrées. Migration additive à prévoir.

Découvertes en auditant l'écran Programme (§17).

### `semaine_actuelle` — écrite à 1, jamais incrémentée

La colonne est écrite à deux endroits (`api/onboarding`, `services/programmes`),
toujours avec la valeur littérale `1`, et **aucun code ne l'incrémente**. Elle
était pourtant affichée comme une vérité sur le tableau de bord (« Semaine 1 »
indéfiniment), dans l'écran Programme, et transmise au coach dans son prompt
système.

*Contournement :* la semaine est désormais **déduite** de `date_debut`
(`positionDansLeCycle`), qui est `NOT NULL` et fiable. La colonne n'est plus
lue nulle part à l'affichage.

*Reste à faire :* soit un travail planifié qui l'incrémente et en fait une
donnée réelle, soit sa suppression. Elle est encore transmise au coach via
`mesurerCycle` (champ `bloc.semaine`) — à traiter avec le chantier coach.

### `date_fin_prevue` — facultative et jamais renseignée

Aucun écran ne l'écrit : `CreationBlocForm` ne l'envoie pas, seule l'API
l'accepte. En pratique elle est toujours `NULL`, donc **un cycle n'a pas de
durée totale**.

*Conséquence assumée :* « Semaine 3 sur 6 » n'est affiché que si la date
existe. Sinon l'écran dit « Semaine 3 », sans dénominateur et sans barre de
progression. Un cycle terminé ne peut pas non plus être détecté sans elle.

*Reste à faire :* la demander à la création d'un bloc, ou dériver une durée
par défaut de la dominante. C'est le préalable au parcours « cycle terminé →
préparer le suivant » (§10), qui n'est donc **pas implémenté** : seule l'UI
compatible existe.

### `seance_templates` — un ordre, pas un jour

La table porte `ordre_dans_semaine`, et rien d'autre. **Aucune séance n'a de
jour attribué.**

*Conséquences assumées :* l'écran n'affiche aucun « Lundi / Mercredi /
Vendredi », et aucune séance ne peut être déclarée « manquée » — il n'existe
pas de date à laquelle elle aurait dû avoir lieu. L'état « aujourd'hui » n'est
affirmé que si une séance a réellement été enregistrée aujourd'hui ; sinon la
première séance non faite de la semaine est dite « prochaine ».

*Reste à faire :* une colonne `jour_prevu` nullable permettrait les jours et la
notion de séance manquée. Migration additive, non faite.

### `type_cycle` — texte libre

Colonne `text` sans contrainte, alimentée par trois sources et acceptant
n'importe quelle chaîne via l'API. Les valeurs observables : `calibration`,
`mecanique`, `metabolique`, `force`, `deload`.

*Traitement :* `libelleCycle()` traduit les valeurs connues, humanise les
inconnues, et marque `herite: true` pour les vocabulaires abandonnés
(`mecanique` → « Dominante charge »). **Aucune réécriture en base.** Le
formulaire de création propose désormais les quatre dominantes actuelles.

*Piège corrigé au passage :* `phaseDepuisTypeCycle()` reconnaissait les
valeurs par sous-chaîne. Les nouvelles dominantes (`volume`, `densite`…) n'y
correspondaient pas et retombaient sur `hors_cycle` — ce qui change le seuil de
récupération et les règles de décharge. La correspondance est maintenant
explicite et testée.

---

## 5. `classerEtatCycle` conseille une décharge au calendrier

**Statut :** filtré à l'affichage, moteur inchangé.

`dechargeConseillee` passe à `true` dès `semainesSansDecharge >= 6`, sans
aucun signal corporel. Afficher cette recommandation telle quelle reviendrait à
décréter une décharge à la date.

*Contournement :* `dechargeJustifiee()` exige au moins un motif venant du corps
ou des performances (fatigue anormale, performances en baisse, douleur
signalée). L'ancienneté seule n'affiche rien.

*Reste à faire :* décider si le moteur lui-même doit distinguer « décharge
recommandée » de « décharge à planifier ». Le changer affecterait les alertes,
qui consomment `computeAlerts` — d'où le choix de filtrer en aval pour
l'instant.

---

## 6. Coach : ce qui reste après §22/23

**Statut :** contourné ou volontairement laissé de côté.

### Propositions structurelles sans application automatique

Aucun outil du coach n'applique aujourd'hui un changement structurel de
programme : il n'existe ni `modifier_programme`, ni `changer_frequence`. Le
coach peut donc PROPOSER par écrit, et rien ne s'applique — la garantie est
obtenue par absence d'outil, pas par un mécanisme de confirmation.

*Conséquence :* le parcours demandé « [Voir les changements] [Appliquer]
[Garder le programme] » n'existe pas. Il n'a pas été construit parce qu'il
suppose d'abord des outils d'écriture qu'il faudrait créer — et créer un outil
d'écriture avant son garde-fou serait le mauvais ordre. À faire ensemble, dans
un chantier dédié.

### Écriture réellement possible par le coach

Trois outils écrivent : `log_set`, `end_session`, `log_incident`. Ils portent
sur la séance en cours, pas sur la structure du programme. `create_coach_memory`
écrit aussi, désormais filtré par `verdictMemoire`.

### Le contexte d'écran n'est pas transmis aux outils

`resoudreContexte` enrichit le prompt système. Les outils, eux, reçoivent
seulement `userId` : un outil ne sait pas quel exercice l'utilisateur
regardait. Suffisant tant que le modèle relaie l'information dans ses
arguments ; à revoir si un outil doit agir sur « l'exercice courant » sans
qu'il soit nommé.

### Non vérifié

Le comportement clavier ouvert sur iOS réel. Le rendu a été contrôlé sur
viewport iPhone 13 (champ et bouton d'envoi à l'écran, cible 48 × 48), mais un
navigateur sans clavier logiciel ne reproduit pas le redimensionnement du
`visualViewport`. `dvh` et `env(safe-area-inset-bottom)` sont en place ; à
confirmer sur un appareil.
