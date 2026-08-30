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

- représentation du cycle (§17) ;
- bouton flottant du coach (§22/23) ;
- retour de fin de séance en dix secondes (§13) ;
- écran « Plus » (§25) ;
- passe de microcopie (§28).

Le §13 conditionne la qualité des données que consomme l'écran Progression :
c'est là que se saisissent le RPE et la durée, dont dépendent respectivement
le point 2 ci-dessus et la « durée habituelle » du bilan.
