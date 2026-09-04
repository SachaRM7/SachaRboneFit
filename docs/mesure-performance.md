# Lire les mesures de performance en production

Ce document sert à une chose : transformer « le tableau de bord met cinq
secondes » en un chiffre par cause.

## D'abord, ce qui n'a pas marché

La première instrumentation publiait une ligne par requête depuis `after()`.
Elle fonctionnait sous `next start` et n'a **rien** produit sur Vercel :
l'onglet Logs d'une requête `/dashboard` affichait « No logs found for this
request ». Deux raisons, toutes deux structurelles :

1. `after()` s'exécute **après l'envoi de la réponse**. Ce qu'il journalise
   n'appartient plus à la requête — Vercel le range ailleurs, quand il le
   garde.
2. Le proxy s'exécute dans une **invocation séparée** de la fonction de page.
   Ses lignes ne peuvent pas apparaître sous la requête `/dashboard`, quoi
   qu'on écrive.

D'où trois canaux plutôt qu'un, et aucun qui dépende d'`after()`.

## Canal 1 — la route de diagnostic (le plus simple)

Ouvre `/api/diagnostic/perf` dans le navigateur, connecté. Elle rend un JSON :

```json
{
  "region": {
    "fonction": "iad1",
    "base": { "hote": "aws-0-eu-west-3.pooler.supabase.com", "region": "eu-west-3" },
    "allerRetourBaseMs": 92.4,
    "premierAllerRetourMs": 210.7
  },
  "instance": { "froide": true, "environnement": "preview" },
  "auth": { "ms": 3.1, "appelsReseau": [{ "chemin": "/auth/v1/.well-known/jwks.json", "ms": 41 }] },
  "accueil": {
    "essentiel": { "ms": 190, "requetes": 2 },
    "complement": { "ms": 1840, "requetes": 21 }
  }
}
```

Aucun accès aux journaux n'est nécessaire. Aucune donnée personnelle n'en
sort : ni identifiant, ni courriel, ni contenu d'entraînement — des décomptes
et des durées. La route exige une session.

## Canal 2 — les en-têtes de réponse (pour le proxy)

Le proxy pose sur **chaque réponse** :

```
Server-Timing: proxy;dur=138, auth;dur=131, supabase;dur=128;desc="2 appel(s)"
x-perf-supabase: /auth/v1/.well-known/jwks.json=44 /auth/v1/user=84
x-perf-region: iad1
x-perf-froid: true
```

Ils se lisent dans l'inspecteur réseau de Safari ou avec `curl -I`. C'est le
seul canal qui puisse répondre pour le proxy, puisque ses journaux vivent
ailleurs.

## Canal 3 — les lignes de journal, publiées pendant la requête

```
[perf] {"route":"/dashboard","point":"essentiel","region":"iad1","depuisLeDebut":420.3,
        "froid":false,"auth":1,"reseauSupabase":[],"sql":2,"msSql":190.2,
        "phases":{...},"dominant":{"quoi":"contexteEssentiel","ms":170}}
```

Plusieurs lignes par requête, et c'est voulu. `point` dit à quel moment du
rendu la ligne est sortie :

| `point` | Ce qu'il borne |
|---|---|
| `layout` | Le coût partagé par tous les écrans : identité + garde d'onboarding |
| `essentiel` | La fin du chemin critique de l'accueil — le premier contenu part ici |
| `complement` | La fin du complément streamé |
| `racine` | La redirection de lancement (`start_url` du manifeste) |
| `api/user` | La route que la connexion attend avant de naviguer |

L'écart entre `essentiel` et `complement` **est** la mesure du streaming. S'ils
tombent au même instant, rien n'est streamé.

Le chemin est réduit à sa forme (`/sessions/[id]`), les appels réseau ne
gardent que leur **chemin** — jamais la requête complète, qui porte des jetons.
Tout se coupe avec `PERF_TRACE=off`.

## Ce qu'il faut regarder, dans cet ordre

### 1. `auth.appelsReseau` — combien d'allers-retours pour une validation

C'est la question la plus importante, et elle ne se lit dans aucun code.

| Ce qu'on voit | Ce que ça veut dire |
|---|---|
| liste vide | La signature est vérifiée sur place, par WebCrypto. C'est l'objectif. |
| `/auth/v1/.well-known/jwks.json` | Le trousseau public est téléchargé. **Une fois par instance**, puis mis en cache : normal sur une ligne `froid: true`, anormal sur toutes. |
| `/auth/v1/user` | Le projet signe encore avec le **secret symétrique** (HS256) : `getClaims()` ne peut pas vérifier localement et repart sur le réseau. |
| `/auth/v1/token?...` | La session a été rafraîchie — le jeton arrivait à expiration. |

Le troisième cas se corrige dans le tableau de bord Supabase
(**Authentication → JWT Keys**), en basculant vers une clé asymétrique
(ECC/RSA). Pas dans ce dépôt. Tant que ce n'est pas fait, chaque navigation
paie deux allers-retours d'authentification — un pour le proxy, un pour le
rendu.

Deux appels dans le proxy sur une instance froide (`jwks` + un autre) sont
attendus une fois ; deux appels **à chaque passage** ne le sont pas.

### 2. `region` — la géographie

**Mesuré en Preview le 04/09/2026, et la réponse est nette :**

| | |
|---|---|
| Fonction Vercel | `iad1` — Washington |
| Base Supabase | `eu-west-3` — Paris |
| Aller-retour base, médian | **84,3 ms** |
| Premier aller-retour (ouverture de connexion comprise) | 573,7 ms |

Avec `max: 1`, les requêtes d'un écran ne se recouvrent pas : chacune paie ces
84 ms, l'une après l'autre. C'est ce qui restait à traiter une fois
l'authentification hors de cause (8,9 ms, zéro appel réseau) et le chemin
critique ramené à deux lectures.

`vercel.json` porte donc désormais :

```json
{ "regions": ["cdg1"] }
```

`cdg1` est Paris, la région Vercel la plus proche de `eu-west-3`. Aucune autre
valeur n'a été devinée : elle est choisie à partir de la mesure ci-dessus, pas
avant.

Comment relire ce champ ensuite : `region.fonction` doit passer à `cdg1`, et
c'est **`allerRetourBaseMs` qui tranche**, pas le nom de la région. Quelques
millisecondes = la base est à côté ; plusieurs dizaines = elle ne l'est pas.
Les autres régions européennes, si le besoin se posait : `fra1` Francfort,
`arn1` Stockholm, `dub1` Dublin.

Deux réserves à connaître avant de conclure sur une comparaison avant/après :

- le placement s'applique aux **fonctions**, pas à la périphérie. Le proxy
  garde son propre lieu d'exécution, et sa ligne `x-perf-region` peut donc
  différer de celle du rendu ;
- déplacer la fonction rapproche la base **et éloigne** ce qui vit ailleurs.
  Ici rien d'autre n'est appelé sur le chemin critique — l'authentification ne
  fait plus aucun aller-retour réseau — mais un appel au modèle de langage,
  lui, partirait de Paris.

### 3. `phases.db_connexion` — combien de réouvertures

Compte les fois où une requête a trouvé la connexion fermée et a dû l'ouvrir
(TLS, authentification, `search_path`) avant le moindre octet utile.

- `n: 1` sur une ligne `froid: true` puis absent : normal.
- `n: 1` récurrent sur des lignes `froid: false` : l'`idle_timeout` (20 s)
  expire entre deux navigations.

Le second cas est le seul qui justifierait d'allonger `idle_timeout`. Et il ne
suffit pas : allonger la durée de vie d'une connexion augmente le nombre de
connexions **ouvertes en même temps**, puisque c'est durée × nombre
d'instances — or en serverless le second facteur n'est pas borné. C'est ce qui
avait produit l'`EMAXCONNSESSION` d'origine. La décision se prend avec les deux
chiffres : celui-ci, **et** le nombre de connexions actives côté Supabase
(Database → Connection pooling) en heure de pointe.

### 4. TTFB, contenu visible, fin de réponse — trois choses différentes

Le chiffre « Function Invocation » de Vercel mesure jusqu'à la **fin** de la
réponse. Sur une page streamée, il inclut le complément qui arrive après que
l'écran est déjà lisible : il ne peut donc pas diminuer, et il n'est pas
comparable à celui d'une page qui rendait tout d'un bloc.

Ce qu'il faut mesurer à la place :

```sh
curl -s -o /dev/null -w 'connexion %{time_connect}  premier octet %{time_starttransfer}  fin %{time_total}\n' \
  -H 'Cookie: <les cookies de session>' https://<preview>/dashboard
```

- `time_starttransfer` — le premier octet : la coquille et le squelette.
- la ligne `[perf] point:"essentiel"` — le moment où le contenu utile part.
- `time_total` et la ligne `point:"complement"` — la fin.

Une amélioration réelle se voit sur les deux premiers, pas sur le dernier.

### 5. `froid`

Comparer `depuisLeDebut` entre lignes `froid: true` et `froid: false` sur la
même route. L'écart est le coût de démarrage d'une instance. Il ne se corrige
pas en optimisant l'écran, et il ne concerne que la première visite après une
période d'inactivité — à ne pas confondre avec une lenteur permanente.

## Compter les requêtes sans production

```ts
import { compterRequetes } from "@/db/client";
const { requetes } = await compterRequetes(() => essentielTableauDeBord(id));
```

`src/tests/cout-accueil.itest.ts` s'en sert pour tenir le chemin critique de
l'accueil à deux allers-retours, et pour vérifier que la lecture composée dit
exactement la même chose que le chemin ORM qu'elle remplace.

## Ce que la mesure locale ne dit pas

Une base locale répond en une fraction de milliseconde, sur la même machine que
le code. Elle donne le NOMBRE de requêtes — utile, et vérifié par les tests —
mais jamais leur coût. Les trois causes qui font les secondes en production —
latence d'authentification, latence de base, démarrage à froid — valent toutes
zéro en local. Un chiffre mesuré sur `localhost` ne conclut rien sur la
production.
