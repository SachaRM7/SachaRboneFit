# Lire les mesures de performance en production

Ce document sert à une chose : transformer « le tableau de bord met huit
secondes » en un chiffre par cause. Tout ce qui suit se lit dans les journaux
Vercel, sans outil supplémentaire et sans rien installer sur le téléphone.

## Les deux lignes

Chaque requête produit une ligne, parfois deux.

```
[perf-proxy] {"route":"/dashboard","region":"cdg1","total":4.3,"authMs":0.6,"validations":1,"redirige":false}
[perf] {"route":"/dashboard","region":"cdg1","total":812.4,"froid":false,"auth":1,"sql":9,"msSql":640.2,
        "phases":{"auth":{"ms":3.1,"n":1},"db":{"ms":640.2,"n":9},"calcul":{"ms":98,"n":2}},
        "dominant":{"quoi":"requete","ms":214.9}}
```

`[perf-proxy]` vient du garde d'entrée, qui s'exécute en périphérie.
`[perf]` vient du rendu, qui s'exécute dans une fonction. Ce sont deux
machines différentes, souvent dans deux régions différentes — c'est pour ça
qu'elles comptent séparément.

| Champ | Ce qu'il dit |
|---|---|
| `route` | La FORME du chemin (`/sessions/[id]`), jamais le chemin réel |
| `region` | Où la fonction a tourné (`cdg1`, `iad1`…) |
| `total` | Durée complète, du premier octet reçu au dernier envoyé |
| `froid` | `true` = cette instance venait d'être créée |
| `auth` | Vérifications d'identité effectivement faites dans ce rendu |
| `sql` | Requêtes réellement parties sur le réseau |
| `msSql` | Temps passé à les attendre, cumulé |
| `phases` | Le temps regroupé par nature de travail |
| `dominant` | Le traitement le plus coûteux, nommé |

Rien de personnel n'y figure : ni identifiant de compte, ni courriel, ni
paramètre d'URL, ni texte de requête SQL. Pour couper l'instrumentation :
variable d'environnement `PERF_TRACE=off`.

## Ce qu'il faut regarder, dans cet ordre

### 1. `authMs` dans la ligne du proxy

C'est la question la plus importante, et elle a une réponse binaire.

- **`authMs` inférieur à ~5 ms** : la signature du jeton est vérifiée
  localement, par WebCrypto. C'est le comportement attendu.
- **`authMs` de plusieurs dizaines ou centaines de millisecondes** : le projet
  Supabase signe encore ses jetons avec le secret **symétrique** historique
  (HS256). Dans ce cas `getClaims()` ne peut pas vérifier sur place et repart
  sur le réseau, exactement comme `getUser()`.

Dans le second cas, le correctif n'est pas dans le code : il est dans le
tableau de bord Supabase, **Authentication → JWT Keys**, en basculant vers une
clé asymétrique (ECC/RSA). Tant que ce n'est pas fait, chaque navigation paie
deux allers-retours vers le serveur d'authentification — un pour le proxy, un
pour le rendu — quoi qu'on écrive ici.

Attention à ne pas confondre avec le tout premier appel d'une instance :
`getClaims()` télécharge une fois le trousseau public du projet
(`/.well-known/jwks.json`), le met en cache, et n'y revient plus. Une valeur
élevée sur une ligne `froid: true` puis basse ensuite est donc normale ; une
valeur élevée sur TOUTES les lignes signale la signature symétrique.

### 2. `region`, dans les deux lignes

Comparer avec la région du projet Supabase (tableau de bord Supabase,
**Project Settings → General → Region**).

Si les deux ne concordent pas, chaque requête SQL paie un aller-retour
intercontinental. Avec `max: 1` sur le pool — réglage voulu, il évite la
saturation du pooler — les requêtes d'un écran ne se recouvrent pas : elles
s'additionnent. Neuf requêtes à 80 ms font 720 ms, et aucune réécriture de code
ne les rattrape.

Le correctif est une ligne dans `vercel.json` :

```json
{ "regions": ["cdg1"] }
```

en remplaçant `cdg1` par la région Vercel la plus proche de celle de Supabase
(`cdg1` Paris, `fra1` Francfort, `iad1` Washington, `gru1` São Paulo…).
Ne la fixer qu'après avoir lu les deux régions réelles : la deviner ne fait que
déplacer le problème.

### 3. `msSql` rapporté à `sql`

`msSql / sql` donne le coût moyen d'un aller-retour vers la base. C'est la
mesure qui décide de la suite :

- **moins de ~15 ms** : la base est proche, le nombre de requêtes n'est pas le
  problème. Chercher ailleurs.
- **50 ms et plus** : soit la géographie (point 2), soit le pooler. C'est
  seulement là que la question d'élargir `max: 1` se pose — et elle se pose
  avec les chiffres du pooler sous les yeux, pas avant. Le réglage actuel a une
  raison : au-delà, le pooler Supabase en mode session sature à quinze clients,
  et deux instances concurrentes suffisaient à faire tomber le tableau de bord
  sur `EMAXCONNSESSION`.

### 4. `froid`

Comparer le `total` des lignes `froid: true` et `froid: false` sur la même
route. L'écart est le coût de démarrage d'une instance : imports, compilation,
ouverture de connexion, premier téléchargement du trousseau.

Un écart important ne se corrige pas en optimisant l'écran ; il se corrige en
réduisant ce qui est chargé au démarrage, ou en acceptant qu'il ne concerne que
la première visite après une période d'inactivité. À ne pas confondre avec une
lenteur permanente.

### 5. `dominant`

Le nom du traitement le plus long de la requête. C'est ce qui évite de
conclure « la base a pris deux secondes » sans savoir laquelle des requêtes les
a prises. Les calculs lourds sont nommés (`vueDuProgramme`, `alertes`).

## Compter les requêtes sans production

Le compteur est aussi disponible en test, à la source :

```ts
import { compterRequetes } from "@/db/client";

const { requetes } = await compterRequetes(() => essentielTableauDeBord(id));
```

`src/tests/cout-accueil.itest.ts` s'en sert pour tenir le chemin critique de
l'accueil sous un plafond. Les seuils y sont des plafonds, pas des cibles : ils
empêchent la dérive d'un commit à l'autre.

## Ce que la mesure locale ne dit pas

Une base locale répond en une fraction de milliseconde, sur la même machine que
le code. Elle donne le NOMBRE de requêtes — utile, et vérifié par les tests —
mais jamais leur coût. Les trois causes qui font les secondes en production —
latence d'authentification, latence de base, démarrage à froid — valent toutes
zéro en local. Un chiffre mesuré sur `localhost` ne conclut donc rien sur la
production.
