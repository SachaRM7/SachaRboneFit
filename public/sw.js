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

const VERSION = "v3";
const CACHE_ASSETS = `assets-${VERSION}`;
const CACHE_API = `api-${VERSION}`;

/**
 * Une reponse redirigee ne peut pas resservir une navigation, et une reponse en
 * erreur n'a rien a faire en cache. Aucune page n'est plus mise en cache du
 * tout, mais la garde reste : elle protege aussi les illustrations et les API.
 */
function cachable(reponse) {
  return reponse && reponse.ok && !reponse.redirected && reponse.type !== "opaqueredirect";
}

self.addEventListener("install", (evenement) => {
  // Plus rien a precharger : les pages ne sont plus servies depuis le cache.
  evenement.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (evenement) => {
  const actuels = [CACHE_ASSETS, CACHE_API];
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

  // Navigations : jamais interceptées.
  //
  // Elles l'étaient, avec repli sur une page mise en cache. Ce repli n'apportait
  // presque rien — sans réseau l'application n'a de toute façon aucune donnée à
  // afficher — et il a casse la navigation deux fois : une réponse redirigée
  // mise en cache ne peut pas servir une navigation, et le navigateur refuse
  // alors la page entière. Le risque est sans commune mesure avec le gain.
  //
  // Ce qui compte réellement hors ligne est conservé : les illustrations, et la
  // dernière lecture des API.
});
