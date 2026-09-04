/**
 * Mesurer une navigation en production, sans rien apprendre sur la personne.
 *
 * Première version : une ligne par requête, publiée par `after()`. Elle
 * fonctionnait sous `next start` et **n'a rien produit sur Vercel** — l'onglet
 * Logs d'une requête `/dashboard` affichait « No logs found for this
 * request ». Deux raisons, toutes deux structurelles :
 *
 *  1. `after()` s'exécute APRÈS l'envoi de la réponse. Ce qu'il journalise
 *     n'appartient plus à la requête : Vercel range ces lignes ailleurs, quand
 *     il les garde. Publier au sein de la requête est la seule façon d'être sûr
 *     qu'une ligne soit rattachée à elle.
 *  2. Le proxy s'exécute dans une INVOCATION SÉPARÉE de la fonction de page.
 *     Ses lignes ne peuvent pas apparaître sous la requête `/dashboard`, quoi
 *     qu'on écrive. Elles sortent par un en-tête de réponse, lisible sans
 *     journal du tout.
 *
 * D'où cette version. Rien n'est différé : chaque point de mesure publie
 * pendant la requête. Et la mesure ne dépend plus d'un seul canal — les mêmes
 * chiffres sont servis par `/api/diagnostic/perf`, qui s'ouvre dans un
 * navigateur et n'a besoin d'aucun accès aux journaux.
 *
 * Ce qui n'y figure jamais : aucun identifiant de compte, aucun courriel,
 * aucune donnée d'entraînement, aucun paramètre d'URL, aucun texte de requête
 * SQL. Le chemin est réduit à sa forme — `/sessions/[id]` et non
 * `/sessions/9f3a…`. Les appels réseau ne gardent que leur CHEMIN : un jeton de
 * rafraîchissement voyage en paramètre, il ne doit jamais être journalisé.
 *
 * Se coupe avec `PERF_TRACE=off`.
 */

import { cache } from "react";
import { AsyncLocalStorage } from "node:async_hooks";

export type Phase =
  | "proxy"
  | "auth"
  | "db_connexion"
  | "db"
  | "rendu"
  | "calcul"
  | "llm";

interface Mesure {
  phase: Phase;
  /** Ce qu'on mesurait — jamais une valeur, seulement un nom de traitement. */
  quoi: string;
  ms: number;
}

/** Un aller-retour réseau vers Supabase, réellement parti. */
export interface AppelReseau {
  /** Le chemin seul. Jamais la requête complète : elle porte des jetons. */
  chemin: string;
  ms: number;
}

export interface Trace {
  route: string;
  debut: number;
  mesures: Mesure[];
  /** Requêtes SQL réellement parties, comptées à la source. */
  requetesSql: number;
  msSql: number;
  /** Appels à une méthode de vérification d'identité. */
  validationsAuth: number;
  /**
   * Allers-retours RÉSEAU vers Supabase. C'est le chiffre qui compte : une
   * validation peut n'en provoquer aucun (vérification locale) ou deux (JWKS
   * puis repli). Les compter est la seule façon de le savoir.
   */
  appelsSupabase: AppelReseau[];
  /** Vrai quand cette instance vient d'être créée : c'est un démarrage à froid. */
  froid: boolean;
}

/**
 * Une instance servie plusieurs fois n'est plus froide.
 *
 * Le module est évalué une fois par instance de fonction. La première requête
 * qui le traverse paie donc l'initialisation complète — imports, connexion,
 * compilation — et les suivantes non. Ça ne se voit d'aucune autre façon
 * depuis l'intérieur.
 */
let instanceDejaServie = false;

export function traceActive(): boolean {
  return process.env.PERF_TRACE !== "off";
}

function creer(route: string): Trace {
  const trace: Trace = {
    route,
    debut: performance.now(),
    mesures: [],
    requetesSql: 0,
    msSql: 0,
    validationsAuth: 0,
    appelsSupabase: [],
    froid: !instanceDejaServie,
  };
  instanceDejaServie = true;
  return trace;
}

/**
 * Deux portées, parce qu'il y a deux runtimes.
 *
 * Le rendu passe par `cache()` de React : une valeur par requête HTTP servie,
 * rien qui survive à la réponse, et deux requêtes concurrentes qui ne
 * partagent rien. Le proxy, lui, ne rend rien — il n'a pas de portée React —
 * et s'enveloppe donc explicitement dans un stockage asynchrone.
 *
 * L'ordre compte : le stockage explicite l'emporte, sinon un appel fait depuis
 * le proxy irait chercher une portée de rendu qui n'existe pas.
 */
const stockage = new AsyncLocalStorage<Trace>();
const traceDuRendu = cache((): Trace => creer("rendu"));

export function traceCourante(): Trace | null {
  if (!traceActive()) return null;
  return stockage.getStore() ?? traceDuRendu();
}

/**
 * Réduit un chemin à sa FORME.
 *
 * `/sessions/9f3a-…/finish` devient `/sessions/[id]/finish`. Un identifiant
 * dans un journal est une donnée personnelle, et il n'apprend rien : ce qu'on
 * compare, ce sont des routes, pas des visites.
 */
export function formeDuChemin(chemin: string): string {
  return chemin
    .split("/")
    .map((segment) => {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(segment)) return "[id]";
      if (/^\d+$/.test(segment)) return "[n]";
      return segment;
    })
    .join("/");
}

/** Ouvre une trace explicite — le proxy, qui n'a pas de portée de rendu. */
export function tracerHorsRendu<T>(route: string, travail: (trace: Trace) => T): T {
  if (!traceActive()) return travail(creer(route));
  const trace = creer(formeDuChemin(route));
  return stockage.run(trace, () => travail(trace));
}

/**
 * Donne son nom à la trace en cours.
 *
 * Le rendu ne connaît pas le chemin demandé : c'est le proxy qui le sait, et
 * il le transmet par un en-tête de requête.
 */
export function nommerTrace(route: string | null | undefined): void {
  if (!route) return;
  const trace = traceCourante();
  if (trace) trace.route = formeDuChemin(route);
}

/** Mesure une phase. Hors requête, exécute simplement le travail. */
export async function phase<T>(phase: Phase, quoi: string, travail: () => Promise<T>): Promise<T> {
  const trace = traceCourante();
  if (!trace) return travail();

  const debut = performance.now();
  try {
    return await travail();
  } finally {
    noterDans(trace, phase, quoi, performance.now() - debut);
  }
}

/**
 * Note une mesure déjà prise.
 *
 * `phase()` encadre un travail ; `noter()` sert quand on ne peut pas
 * l'encadrer — une requête paresseuse qu'on ne doit pas remplacer par une
 * promesse, un fait sans durée comme la réouverture d'une connexion.
 */
export function noter(phase: Phase, quoi: string, ms = 0): void {
  const trace = traceCourante();
  if (trace) noterDans(trace, phase, quoi, ms);
}

function noterDans(trace: Trace, phase: Phase, quoi: string, ms: number): void {
  trace.mesures.push({ phase, quoi, ms: arrondi(ms) });
  if (phase === "db") {
    trace.requetesSql += 1;
    trace.msSql += ms;
  }
  if (phase === "auth") trace.validationsAuth += 1;
}

const arrondi = (ms: number) => Math.round(ms * 10) / 10;

/* ------------------------------------------------------------------ */
/* La sonde réseau                                                     */
/* ------------------------------------------------------------------ */

/**
 * Compter les allers-retours vers Supabase, plutôt que les supposer.
 *
 * `getClaims()` peut n'en provoquer aucun (signature vérifiée sur place), un
 * (téléchargement du trousseau public, une fois par instance), ou deux (repli
 * réseau, ou rafraîchissement de session). Aucune lecture de code ne tranche :
 * ça dépend de la configuration du projet et de l'âge du jeton. La seule
 * réponse fiable est de compter ce qui part vraiment.
 *
 * La sonde est posée une fois, sur `fetch` global, et attribue chaque appel à
 * la trace COURANTE — pas à une variable partagée. C'est ce qui la rend sûre
 * quand deux requêtes se chevauchent dans la même instance.
 *
 * Seul le chemin est retenu. Jamais la requête complète : un rafraîchissement
 * de session porte son jeton en paramètre.
 */
let hoteSupabase: string | null | undefined;

function estSupabase(hote: string): boolean {
  if (hoteSupabase === undefined) {
    try {
      hoteSupabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
    } catch {
      hoteSupabase = null;
    }
  }
  return hoteSupabase !== null && hote === hoteSupabase;
}

interface FetchSonde {
  (entree: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  sonde?: true;
}

function poserLaSonde(): void {
  if (!traceActive()) return;
  const original = globalThis.fetch as FetchSonde | undefined;
  if (!original || original.sonde) return;

  const sonde: FetchSonde = async (entree, init) => {
    const debut = performance.now();
    try {
      return await original(entree, init);
    } finally {
      try {
        const brut =
          typeof entree === "string" ? entree
            : entree instanceof URL ? entree.href
              : entree.url;
        const url = new URL(brut);
        if (estSupabase(url.host)) {
          traceCourante()?.appelsSupabase.push({
            chemin: url.pathname,
            ms: arrondi(performance.now() - debut),
          });
        }
      } catch {
        // Une URL relative ou illisible n'est pas un appel Supabase.
      }
    }
  };
  sonde.sonde = true;
  globalThis.fetch = sonde;
}

poserLaSonde();

/* ------------------------------------------------------------------ */
/* Publication                                                         */
/* ------------------------------------------------------------------ */

/** L'état d'une trace, prêt à être journalisé ou servi en JSON. */
export function instantane(trace: Trace, point: string) {
  const parPhase: Record<string, { ms: number; n: number }> = {};
  for (const m of trace.mesures) {
    const entree = parPhase[m.phase] ?? { ms: 0, n: 0 };
    entree.ms = arrondi(entree.ms + m.ms);
    entree.n += 1;
    parPhase[m.phase] = entree;
  }

  // Le traitement le plus coûteux, nommé : sans lui, on sait que la base a
  // pris deux secondes sans savoir laquelle des trente requêtes les a prises.
  const dominant = [...trace.mesures].sort((a, b) => b.ms - a.ms)[0];

  return {
    route: trace.route,
    point,
    // Où cette fonction s'est exécutée. Si la base vit en Europe et la
    // fonction à Washington, chaque requête paie un aller-retour
    // transatlantique — et aucune optimisation de code ne rattrape ça.
    region: process.env.VERCEL_REGION ?? null,
    depuisLeDebut: arrondi(performance.now() - trace.debut),
    froid: trace.froid,
    auth: trace.validationsAuth,
    reseauSupabase: trace.appelsSupabase,
    sql: trace.requetesSql,
    msSql: arrondi(trace.msSql),
    phases: parPhase,
    dominant: dominant ? { quoi: dominant.quoi, ms: dominant.ms } : null,
  };
}

/**
 * Une ligne, en JSON, préfixée `[perf]`, PENDANT la requête.
 *
 * Le format tient en une ligne parce que les journaux de Vercel découpent les
 * messages multilignes en entrées distinctes : une trace éclatée sur douze
 * lignes n'est plus une trace, c'est douze fragments à recoller à la main.
 *
 * `point` dit à quel moment du rendu la ligne a été émise. Plusieurs lignes
 * par requête, donc — et c'est voulu : l'écart entre « essentiel » et
 * « complement » EST la mesure du streaming.
 */
export function publier(point: string): void {
  const trace = traceCourante();
  if (!trace) return;
  console.log("[perf] " + JSON.stringify(instantane(trace, point)));
}
