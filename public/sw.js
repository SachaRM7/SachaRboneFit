/**
 * Service worker.
 *
 * L'ancien ne faisait rien : trois lignes dont un handler `fetch` vide commenté
 * « passthrough Phase 1 ». L'application affichait pourtant un indicateur hors
 * ligne et se déclarait installable.
 *
 * Stratégies :
 * - la coquille de l'application et les illustrations d'exercices sont servies
 *   depuis le cache en priorité (elles ne changent qu'au déploiement) ;
 * - les appels API passent par le réseau d'abord, avec repli sur le cache pour
 *   les lectures — une séance consultée reste lisible en salle sans réseau ;
 * - les écritures ne sont jamais mises en cache : une série validée hors ligne
 *   doit échouer visiblement plutôt que d'être silencieusement perdue.
 */

const VERSION = "v2";
const CACHE_COQUILLE = `coquille-${VERSION}`;
const CACHE_ASSETS = `assets-${VERSION}`;
const CACHE_API = `api-${VERSION}`;

// `/` repond par une redirection 307 vers /login ou /dashboard selon la
// session. Mise en cache, cette reponse porte `redirected: true`, et une
// navigation ne peut pas etre servie par une reponse redirigee : le navigateur
// la refuse et affiche sa page « cette page n'a pas pu se charger ». On
// precharge donc la destination reelle, jamais la redirection.
const A_PRECHARGER = ["/login", "/manifest.json"];

/** Une reponse redirigee ne peut pas resservir une navigation : jamais en cache. */
function cachable(reponse) {
  return reponse && reponse.ok && !reponse.redirected && reponse.type !== "opaqueredirect";
}

self.addEventListener("install", (evenement) => {
  evenement.waitUntil(
    caches.open(CACHE_COQUILLE)
      .then((cache) => cache.addAll(A_PRECHARGER))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evenement) => {
  const actuels = [CACHE_COQUILLE, CACHE_ASSETS, CACHE_API];
  evenement.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(
        noms.filter((n) => !actuels.includes(n)).map((n) => caches.delete(n)),
      ))
      .then(() => self.clients.claim()),
  );
});

/** Cache d'abord : le réseau n'est sollicité qu'en cas d'absence. */
async function cacheDAbord(requete, nomCache) {
  const cache = await caches.open(nomCache);
  const enCache = await cache.match(requete);
  if (enCache) return enCache;

  const reponse = await fetch(requete);
  if (cachable(reponse)) cache.put(requete, reponse.clone());
  return reponse;
}

/** Réseau d'abord, repli sur le cache quand il n'y a plus de réseau. */
async function reseauDAbord(requete, nomCache) {
  const cache = await caches.open(nomCache);
  try {
    const reponse = await fetch(requete);
    if (cachable(reponse)) cache.put(requete, reponse.clone());
    return reponse;
  } catch (erreur) {
    const enCache = await cache.match(requete);
    if (enCache) return enCache;
    throw erreur;
  }
}

self.addEventListener("fetch", (evenement) => {
  const requete = evenement.request;
  const url = new URL(requete.url);

  // Hors origine : on laisse passer.
  if (url.origin !== self.location.origin) return;

  // Écritures : jamais interceptées. Une saisie perdue en silence serait pire
  // qu'une erreur visible.
  if (requete.method !== "GET") return;

  // Illustrations d'exercices : immuables, cache d'abord.
  if (url.pathname.startsWith("/exercices/") || url.pathname.startsWith("/icons/")) {
    evenement.respondWith(cacheDAbord(requete, CACHE_ASSETS));
    return;
  }

  // Lectures API : réseau d'abord pour rester à jour, cache en secours.
  if (url.pathname.startsWith("/api/")) {
    evenement.respondWith(reseauDAbord(requete, CACHE_API));
    return;
  }

  // Navigation : réseau d'abord, repli sur la page d'accueil mise en cache.
  if (requete.mode === "navigate") {
    evenement.respondWith(
      reseauDAbord(requete, CACHE_COQUILLE).catch(() =>
        caches.match("/login").then((r) => r ?? Response.error()),
      ),
    );
  }
});
