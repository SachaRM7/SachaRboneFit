# Dette technique

Ce qui est connu, volontairement non corrigé, et pourquoi. Chaque entrée dit
où le problème se trouve, ce qu'il produit comme comportement, et ce qui
retient la correction.

---

## 1. Maximum estimé (e1RM) — unifié

**Statut :** résolu. Conservé ici pour mémoire du raisonnement.

La formule d'Epley était réécrite à la main à sept endroits divergents. Une
seule définition subsiste, dans `src/lib/engine/records.ts` :

| Fonction | Rôle |
|---|---|
| `estimer1RM(serie)` | **la référence**. Réserve comprise, plafond de 20 répétitions effectives, garde sur la série d'une répétition, aucun arrondi. |
| `estimer1RMDepuisRpe(charge, reps, rpe)` | même calcul, à partir des colonnes de la base. |
| `estimer1RMSansReserve(charge, reps)` | **variante nommée**, pour les cas où la réserve n'est pas exploitable. Son nom dit qu'elle sous-estime. |
| `reserveDepuisRpe(rpe)` | la conversion RPE → réserve, qui vivait recopiée dans trois services. |
| `REPS_EFFECTIVES_MAXIMALES` | exporté : la fonction inverse (`chargePourCible`) doit borner au même endroit. |

Zéro formule anonyme ne subsiste : la seule autre occurrence de `/ 30` est
`chargePourCible`, l'inverse d'Epley, qui est une fonction différente et nommée.

### Ce qui a réellement changé

- **`feuDeTendance`** (écrit `feu_biologique_tendance` à la clôture d'une
  séance) comptait les répétitions seules. Il compte désormais la réserve —
  **mais seulement si elle est renseignée sur au moins 60 % des séries des
  trois séances comparées**, au même seuil centralisé que le score de
  progression. Sans cette porte, le feu aurait changé de couleur au gré de la
  saisie du RPE plutôt que de la fatigue.
- **`ProgressionSummary`** (fin de séance) arrondissait à la source, ce qui
  pouvait faire passer pour égales deux séances distinctes. L'arrondi est
  parti ; et `/api/set-logs/last-session` renvoie maintenant le RPE, sans quoi
  la séance précédente était estimée sans réserve et la séance en cours avec —
  les deux côtés de la comparaison ne mesuraient pas la même chose.
- **`get_exercise_history`** (coach) et **`/api/progression/exercise`** tiennent
  compte de la réserve. Les valeurs remontent, l'ordre relatif ne change pas.

### Copies supprimées ou neutralisées

- `feu-biologique.ts` portait une copie **jamais appelée** : supprimée.
- `calibration.ts` appelle la référence au lieu de refaire le calcul.
- `outils-programme.ts` n'en a plus depuis le déplacement de `mesurerCycle`.

### Reste

`/api/sessions/tendency` est unifiée mais **n'a aucun appelant dans le dépôt**.
Elle n'a pas été supprimée : contrairement à une page, on ne peut pas prouver
depuis les sources qu'aucun client externe ne l'appelle. À supprimer après
vérification des journaux d'accès.

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

Tous traités : retour de fin de séance (§13), représentation du cycle (§17),
coach contextuel (§22/23), écran « Plus » (§25), microcopie globale (§28).

**Question de navigation restée ouverte.** Depuis le chantier §17, Programme
est un écran de plein droit, mais il n'est atteignable que par « Plus ». La
barre du bas porte quatre onglets — Accueil, Séance, Progression, Plus — et
lui en ajouter un cinquième est une décision de navigation, pas de mise en
page : non tranchée ici. Programme est en tête du groupe « Entraînement », ce
qui le met à deux gestes.

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

### Propositions structurelles — traité (voir § 9)

Résolu par le chantier des outils d'écriture : le coach propose, l'athlète
confirme, l'application est atomique et tracée. Le détail est en § 9.

### Contexte transmis aux outils : fait, pour trois d'entre eux

`resoudreContexte` renvoie désormais un texte pour le prompt ET des références
vérifiées (`blocId`, `seanceTemplateId`, `exerciseInstanceId`) remises en
troisième argument aux exécuteurs. Trois outils de lecture en profitent :
`get_exercise_history`, `get_available_substitutes`, `suggest_next_sets` — leur
identifiant d'exercice devient facultatif, son absence désignant l'objet à
l'écran.

Les vingt autres gardent leur signature à deux arguments. Le modèle ne peut ni
fabriquer ces références ni les remplacer : elles ne viennent pas de lui.

*Traité :* le `sessionLogId` fourni par le modèle a disparu — voir § 9. Les
références résolues portent désormais aussi `sessionLogId`.

### Non vérifié

Le comportement clavier ouvert sur iOS réel. Le rendu a été contrôlé sur
viewport iPhone 13 (champ et bouton d'envoi à l'écran, cible 48 × 48), mais un
navigateur sans clavier logiciel ne reproduit pas le redimensionnement du
`visualViewport`. `dvh` et `env(safe-area-inset-bottom)` sont en place ; à
confirmer sur un appareil.

---

## 7. Audit des clés et de l'isolation (vérifié, rien à faire)

Vérification demandée après une alerte trop rapide de ma part : je conseillais
de faire tourner la clé anon Supabase au seul motif qu'elle est exposée au
client. C'était une erreur — une clé anon est publique par conception.

Ce qui a été réellement contrôlé :

- **Aucune clé privilégiée exposée.** `SUPABASE_SERVICE_ROLE_KEY` n'apparaît
  que dans `src/lib/supabase/admin.ts`, sans préfixe `NEXT_PUBLIC_` : elle ne
  peut pas atteindre le navigateur.
- **Seules deux variables publiques** existent : `NEXT_PUBLIC_SUPABASE_URL` et
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Toutes deux publiques par nature.
- **Aucun secret en dur** dans le dépôt (le seul motif ressemblant à un JWT est
  une empreinte d'intégrité npm dans `package-lock.json`).
- **Aucun fichier `.env` suivi** par git ; `.gitignore` couvre `.env*` avec une
  exception pour `.env.example`, qui ne contient que des gabarits vides.
- **Aucun secret référencé depuis un composant client.**

**Conclusion : pas de fuite, donc aucune rotation de clé.**

Deux points à connaître, sans action requise :

- `createAdminClient` (`src/lib/supabase/admin.ts`) n'est **importé nulle
  part** : c'est du code privilégié mort. Il ne fuit rien, mais il constitue
  une surface inutile — à supprimer si le besoin ne se concrétise pas.
- `DATABASE_URL` emploie le rôle `postgres`, qui a `BYPASSRLS`. **L'isolation
  du chemin applicatif ne repose donc pas sur la RLS** mais sur les clauses
  `WHERE` des requêtes Drizzle. La RLS protège l'autre chemin — l'accès direct
  via PostgREST avec la clé anon, qui est celui réellement exposé. Les deux
  sont nécessaires et ne se remplacent pas.

---

## 8. Deux pages résolvent la même route `/`

**Statut :** résolu. `src/app/page.tsx` était bien la page servie, prouvé par
instrumentation ; `src/app/(app)/page.tsx` a été supprimée, et
`src/tests/routes.test.ts` fait échouer toute nouvelle route en double dès
l'écriture. Conservé ici pour mémoire du raisonnement.

`src/app/page.tsx` (redirection vers `/dashboard` ou `/login`) et
`src/app/(app)/page.tsx` (un ancien tableau de bord en grille de cartes)
résolvent tous deux `/` — un groupe de routes n'ajoute pas de segment. Le build
n'émet aucun conflit et le manifeste ne contient qu'une seule route `/` : l'une
des deux gagne silencieusement, sans qu'on puisse dire laquelle depuis les
sources.

`(app)/page.tsx` duplique le tableau de bord avec un contenu plus pauvre —
« Bloc actif », « Dernière séance », « Poids actuel » en trois cartes, sans
séance du jour ni état du corps. Sa microcopie a été corrigée par précaution,
mais **le fichier n'a pas été supprimé** : supprimer une page dont on ne sait
pas si elle est servie n'est pas un geste de microcopie.

*À trancher :* vérifier laquelle est servie en production, puis supprimer
l'autre.

---

## 9. Outils d'écriture du coach : ce qui est exposé, et ce qui ne l'est pas

**Statut :** chantier fait. Les points ci-dessous sont ce qu'il a laissé de
côté, avec la raison.

### Mutations auditées et écartées

**`log_set` — retirée du coach.** Elle insérait dans `set_logs` pendant la
séance. Or la clôture (`terminerSeance`) commence par
`delete(setLogs).where(sessionLogId = …)` puis réinsère depuis l'état du
client : toute série écrite par le coach était **effacée sans trace** à la fin
de la séance. L'outil ne vérifiait pas non plus le propriétaire de
`exerciseInstanceId`. Une écriture en séance depuis le coach suppose d'abord
que la saisie de séance persiste au fil de l'eau au lieu d'être poussée en bloc
à la fin — c'est une refonte du flux de séance, pas un outil.

**`end_session` — retirée du coach.** Elle écrivait `energieFin` et
`notesSeance`, sans durée, sans séries, et sans recalculer le feu de tendance —
là où `terminerSeance` fait les trois. Elle produisait donc une séance
« clôturée » qu'aucun calcul ne reconnaît comme telle (`dureeMinutes` reste
nul, ce qui la laisse « en cours » pour `seanceCourante` et pour l'adaptation
de lieu). La clôture reste `PATCH /api/session-logs/[id]`.

**Contraintes physiques (`contraintes`) — hors périmètre.** Une douleur
déclarée au coach devrait pouvoir devenir une contrainte durable : c'est la
mutation qui aurait le plus de valeur. Elle est écartée parce que **rien
n'écrit jamais `date_fin`** — la colonne n'est que lue. Une contrainte créée
est définitive, et sévérité > 7 écarte l'exercice au lieu de l'alléger. Créer
un chemin d'entrée sans chemin de sortie fabriquerait des exclusions
permanentes et involontaires. *Préalable :* un cycle de vie complet
(prolonger, atténuer, lever) et l'écran qui va avec.

**Décharge et création de mésocycle — hors périmètre.** Reprend les réserves
du § 4 et du § 5 : `semaine_actuelle` est figée, `date_fin_prevue` souvent
absente, et une décharge ne se décrète pas au calendrier. Le coach ne peut pas
proposer une décharge tant que le modèle de cycle ne sait pas dire où l'on en
est.

**Retirer un exercice d'une séance — traité, voir § 10.**

### Mutations exposées

Quatre, toutes sur `exercise_in_template`, toutes bornées à une séance :
`propose_exercise_swap`, `propose_volume_adjustment`,
`propose_exercise_addition`, `propose_exercise_removal`. Aucune n'écrit : elles
préparent une proposition.
`get_session_exercises` les accompagne — sans les identifiants de lignes, le
modèle désignerait par description.

`log_incident` reste en écriture immédiate : elle ajoute une ligne à un
journal, ne modifie rien d'existant, et consigne ce que l'athlète vient de
dire. Sa séance est résolue par le serveur (`seanceCourante`), et son absence
fait échouer l'outil au lieu de le faire écrire ailleurs.

`create_coach_memory` reste séparée : mémoriser une observation et modifier un
programme sont deux décisions différentes, et la première a déjà son propre
garde-fou (`verdictMemoire`).

### Ce qui reste à surveiller

- **Le crochet `PANNES`** est du code de production qui n'existe que pour les
  tests d'atomicité : trois fonctions nulles, appelées à des points précis de
  la transaction. Sans lui, « il y a bien un rollback » ne se vérifie que par
  relecture. Il ne fait rien en production ; il reste une surface exportée et
  mutable, à surveiller.
- **Les propositions décidées ne sont jamais purgées.** C'est voulu — elles
  sont la trace — mais la table grandira. Aucune purge tant que le volume ne le
  demande pas.
- **`BORNES.validiteMinutes` (30 min)** est une valeur choisie, pas mesurée.
  Comme le seuil RPE, à réévaluer sur usage réel.

---

## 10. Retirer un exercice d'un programme : archivage logique

**Statut :** résolu. Le défaut était préexistant et découvert pendant l'audit
du § 9.

### Le défaut

`session_plan_items.exercise_in_template_id` référence `exercise_in_template`
en `ON DELETE NO ACTION`. Toute ligne de programme déjà servie dans une séance
était donc indélébile, et `DELETE /api/programme/exercices/[id]` — le bouton
« retirer » de l'écran Programme — levait une violation de clé étrangère
remontée en 500. Reproduit en base avant correction :

```
ERROR: update or delete on table "exercise_in_template" violates foreign key
constraint "session_plan_items_exercise_in_template_id_exercise_in_template"
```

Aggravant : l'écran Matériel refusait de supprimer une machine citée par un
programme avec le message « Retire-le d'abord de tes séances » — il envoyait
donc précisément vers le geste qui échoue.

### La sémantique retenue

Retirer, c'est cesser de programmer, pas effacer. Décidée après avoir vérifié
que **`lirePlan` ne lit jamais `exercise_in_template`** : `session_plan_items`
porte sa propre copie de la prescription (séries, fourchette, RPE, tempo,
repos). L'historique ne dépend donc pas du contenu de la ligne de programme —
il ne dépend que de son *existence*, comme pointeur de provenance.

Les trois options envisagées :

| Option | Écartée parce que |
|---|---|
| `ON DELETE CASCADE` | efface les `session_plan_items`, donc l'historique lui-même. |
| `ON DELETE SET NULL` | garde l'historique mais perd la provenance, et fait passer une ligne programmée pour un exercice ajouté à la volée — le sens exact que porte déjà `exercise_in_template_id = NULL`. |
| **`archive_le` (retenue)** | la ligne reste, la provenance reste, plus rien ne la programme. |

C'est aussi la convention déjà en place dans ce schéma : `gyms`,
`exercise_instances`, `session_logs` et `programme_blocs` s'archivent tous
ainsi.

### Ce que ça change dans le code

Une colonne, `exercise_in_template.archive_le`, plus un index sur
`(seance_template_id, archive_le)`. **Aucune contrainte n'a été modifiée** : la
clé étrangère reste en `NO ACTION`, et c'est très bien — plus rien ne tente de
supprimer.

Sept lectures filtrent désormais sur `archive_le IS NULL`, toutes celles qui
décrivent le programme **actif** : construction de la séance du jour, vue de la
semaine, écran Programme, démarrage d'une séance, calcul de l'ordre à l'ajout,
lecture du coach, et le contrôle de citation de l'écran Matériel. Les lectures
d'historique n'ont rien eu à changer, puisqu'elles ne passent pas par cette
table.

### Reste à surveiller

- Une ligne retirée **garde son ancien `ordre`**. Il ne veut plus rien dire
  pour le programme, et l'historique porte le sien dans
  `session_plan_items.ordre` — mais deux lignes peuvent donc partager un rang,
  l'une active et l'autre retirée. Sans conséquence tant que toutes les
  lectures d'ordre filtrent ; c'est le cas.
- **Rien ne permet de remettre une ligne retirée.** L'opération inverse
  existerait en une ligne de SQL, mais elle n'a ni écran ni outil : ajouter à
  nouveau l'exercice crée une nouvelle ligne, ce qui est acceptable. À revoir
  si le besoin apparaît.
- `src/app/api/export/route.ts` **importe `exerciseInTemplate` sans jamais
  l'utiliser** : l'export ne contient pas le programme. Import mort, hors
  périmètre, signalé.

---

## 11. Audit transversal : ce qui reste en dette

**Statut :** relevé pendant l'audit final, laissé volontairement de côté. Les
bugs corrigés au même moment ne sont pas répétés ici.

### Fuseau horaire : « aujourd'hui » est calculé en UTC

Dix-neuf appels à `new Date().toISOString().slice(0, 10)` définissent la
journée sportive. Le serveur tourne en UTC, l'athlète non. Entre minuit et
02 h locales (UTC+1/+2), une séance est donc classée la veille.

Ce n'est pas anodin ici : l'application modélise explicitement le travail de
nuit (`shift_type`, `shift_recent_bool`, `horaire_seance_prevu`), donc
s'entraîner après minuit est un cas prévu, pas une bizarrerie.

**Pas corrigé** parce que le correctif n'est pas mécanique : aucun fuseau n'est
stocké sur `users`, et « la journée sportive » n'est pas forcément la journée
civile — pour un travailleur de nuit, une séance à 01 h appartient peut-être
encore à la veille. *Recommandation :* stocker le fuseau au moment de
l'inscription, puis définir la journée sportive une fois, dans un module, comme
`semaines.ts` l'a fait pour la semaine.

### « Terminée » n'est pas une colonne

L'état d'une séance se déduit de `duree_minutes`. C'est ce qui a produit la
divergence de rotation corrigée dans cet audit. Le modèle ne sait toujours pas
dire *interrompue*, *reprise*, *partielle* ni *abandonnée* : `reprisePlusTard`
est calculé à l'affichage et jamais persisté, et `session_plan_items.statut`
(`prevu` / `fait` / `passe` / `reporte`) existe par exercice mais n'est écrit
qu'à `prevu`. *Recommandation :* une colonne d'état explicite sur
`session_logs`, plutôt que d'ajouter des inférences.

### L'historique affiche les séances archivées

`/(app)/historique` est le seul écran qui ne filtre pas `archive_le`. C'est
peut-être voulu — archiver « préserve la trace » — mais rien ne distingue à
l'écran une séance archivée d'une séance active. Décision produit, pas bug :
soit on les masque, soit on les marque.

### La valeur par défaut d'un état du jour non renseigné

`ETAT_DU_JOUR_PAR_DEFAUT` unifie ce que quatre endroits supposaient
différemment. Mais supposer 7/10 d'énergie quand rien n'est saisi revient à
faire passer le critère `energieDepart >= 7` par défaut : l'absence de réponse
vaut « bonne journée ». À réévaluer sur données réelles, comme le seuil RPE.

### Contraintes physiques : entrer sans pouvoir sortir

Le modèle actuel : `contraintes(user_id, muscle, type, severite 1-10,
date_debut, date_fin)`. Écrit uniquement par l'onboarding. Lu par
`validerSeanceComplete`, `plan-seance` et le profil du coach. **`date_fin`
n'est jamais écrite par aucun chemin** — seulement lue. Au-delà de
`SEVERITE_ECARTEMENT` (7), l'exercice est écarté au lieu d'être allégé.

Conséquence : une gêne déclarée un jour exclut un mouvement pour toujours, et
la seule sortie est le SQL.

*Recommandation pour un chantier dédié* — ne pas se contenter d'ajouter un
bouton « supprimer » :

1. **Distinguer la gêne de la blessure.** `type` le permet déjà
   (`zone_sensible` / `douleur` / `blessure`) mais rien n'en tire de
   conséquence sur la durée. Une gêne devrait porter une échéance courte à la
   création, une blessure non.
2. **Faire décroître, pas disparaître.** Une sévérité qui ne bouge jamais est
   invraisemblable. Un point de contrôle — « ton épaule, ça va mieux ? » posé
   après quelques séances sur le muscle concerné — met à jour la sévérité et,
   sous un seuil, écrit `date_fin`.
3. **Rendre la sortie visible.** Les contraintes actives doivent s'afficher
   quelque part (l'écran Plus), avec leur date de début, et pouvoir être
   levées à la main.
4. **Ne jamais laisser le coach en créer directement.** Une douleur mentionnée
   en conversation devient une *proposition* de contrainte, confirmée par
   l'athlète — le chemin construit dans le chantier précédent s'applique tel
   quel.

Tant que 1 et 2 n'existent pas, exposer la création au coach fabriquerait des
exclusions permanentes : c'est pourquoi elle est restée hors périmètre.

### Base de données

- **Aucun index sur les clés étrangères les plus lues.** Postgres n'en crée pas
  automatiquement. `set_logs.session_log_id` et
  `session_plan_items.session_log_id` sont parcourus à chaque lecture
  d'historique. Non traité : ce serait une optimisation sans mesure, et le
  volume de données actuel ne la justifie pas.
- **Pas d'unicité sur `exercise_in_template(seance_template_id,
  exercise_instance_id)`.** Le chemin du coach refuse les doublons, l'ajout
  manuel non — et `validerSeance` les signale ensuite comme bloquants. Une
  contrainte partielle (`WHERE archive_le IS NULL`) serait le bon geste.
- **`session_logs` sans unicité** : c'est volontaire, deux séances le même jour
  sont légitimes. La création est désormais idempotente tant qu'une séance
  reste ouverte, ce qui suffit.

### Routes sans appelant interne

Conservées, faute de preuve qu'aucun client externe ne les utilise :
`/api/sessions/tendency`, `/api/progression/volume-muscle`, `/api/alerts`,
`/api/programme/vue` (l'écran Programme lit directement en base),
`/api/exercises/[id]`. Les deux routes `/api/cron/*` sont appelées de
l'extérieur avec `CRON_SECRET` : elles ne sont pas mortes.

`/api/export/route.ts` importe `exerciseInTemplate` sans jamais s'en servir :
l'export ne contient pas le programme.
