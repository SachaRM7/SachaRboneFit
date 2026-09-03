/**
 * Mesurer une navigation en production, sans rien apprendre sur la personne.
 *
 * Les chiffres qu'on avait jusqu'ici venaient d'une base locale, sur la même
 * machine que le code : ils disaient le NOMBRE de requêtes, jamais leur coût
 * réel. Or le coût réel d'une navigation est fait de trois choses qu'une
 * mesure locale annule toutes les trois — la latence vers l'authentification,
 * la latence vers la base, et le démarrage à froid d'une fonction.
 *
 * D'où ce module. Il produit UNE ligne de journal par requête HTTP, en JSON
 * sur une seule ligne, préfixée `[perf]` : Vercel la range telle quelle, et on
 * peut la filtrer, la trier, la comparer d'un déploiement à l'autre.
 *
 * Ce qui n'y figure jamais : aucun identifiant de compte, aucun courriel,
 * aucune donnée d'entraînement, aucun paramètre d'URL. Le chemin est réduit à
 * sa forme — `/sessions/[id]` et non `/sessions/9f3a…` — parce qu'un
 * identifiant de séance dans un journal est une donnée personnelle de plus, et
 * qu'il n'apprend rien qu'on ne sache déjà.
 *
 * L'instrumentation est ACTIVE PAR DÉFAUT et coûte quelques microsecondes :
 * des appels à `performance.now()` et un objet. Elle se coupe avec
 * `PERF_TRACE=off`, prévu pour le jour où le bruit dépasse l'usage.
 */

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

interface Trace {
  route: string;
  debut: number;
  mesures: Mesure[];
  /** Requêtes SQL réellement parties, comptées à la source. */
  requetesSql: number;
  msSql: number;
  /** Validations d'identité réellement effectuées dans cette requête HTTP. */
  validationsAuth: number;
  /** Vrai quand cette instance vient d'être créée : c'est un démarrage à froid. */
  froid: boolean;
}

/**
 * Une instance servie plusieurs fois n'est plus froide.
 *
 * Le module est évalué une fois par instance de fonction. La première requête
 * qui le traverse paie donc l'initialisation complète — imports, connexion,
 * compilation — et les suivantes non. C'est exactement ce qu'on cherche à
 * distinguer, et ça ne se voit d'aucune autre façon depuis l'intérieur.
 */
let instanceDejaServie = false;

const stockage = new AsyncLocalStorage<Trace>();

export function traceActive(): boolean {
  return process.env.PERF_TRACE !== "off";
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

/** Ouvre une trace pour la durée d'une requête HTTP. */
export async function tracer<T>(route: string, travail: () => Promise<T>): Promise<T> {
  if (!traceActive()) return travail();

  const froid = !instanceDejaServie;
  instanceDejaServie = true;

  const trace: Trace = {
    route: formeDuChemin(route),
    debut: performance.now(),
    mesures: [],
    requetesSql: 0,
    msSql: 0,
    validationsAuth: 0,
    froid,
  };

  try {
    return await stockage.run(trace, travail);
  } finally {
    publier(trace);
  }
}

/** Mesure une phase. Sans trace ouverte, exécute simplement le travail. */
export async function phase<T>(phase: Phase, quoi: string, travail: () => Promise<T>): Promise<T> {
  const trace = stockage.getStore();
  if (!trace) return travail();

  const debut = performance.now();
  try {
    return await travail();
  } finally {
    const ms = performance.now() - debut;
    trace.mesures.push({ phase, quoi, ms: arrondi(ms) });
    if (phase === "db") {
      trace.requetesSql += 1;
      trace.msSql += ms;
    }
    if (phase === "auth") trace.validationsAuth += 1;
  }
}

/** Note un fait sans durée — par exemple « la connexion a été réutilisée ». */
export function noter(phase: Phase, quoi: string, ms = 0): void {
  stockage.getStore()?.mesures.push({ phase, quoi, ms: arrondi(ms) });
}

const arrondi = (ms: number) => Math.round(ms * 10) / 10;

/**
 * Une ligne, en JSON, préfixée `[perf]`.
 *
 * Le format tient en une ligne parce que les journaux de Vercel découpent les
 * messages multilignes en entrées distinctes : une trace éclatée sur douze
 * lignes n'est plus une trace, c'est douze fragments à recoller à la main.
 */
function publier(trace: Trace): void {
  const total = performance.now() - trace.debut;

  // Le détail est regroupé par phase : ce qu'on cherche d'abord, c'est
  // « où sont passées les secondes », pas la liste des appels.
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

  console.log(
    "[perf] " +
      JSON.stringify({
        route: trace.route,
        total: arrondi(total),
        froid: trace.froid,
        auth: trace.validationsAuth,
        sql: trace.requetesSql,
        msSql: arrondi(trace.msSql),
        phases: parPhase,
        dominant: dominant ? { quoi: dominant.quoi, ms: dominant.ms } : null,
      }),
  );
}
