import { JSDOM } from "jsdom";

/**
 * Un DOM simulé, posé AVANT que React ne soit chargé.
 *
 * `react-dom/client` capture `document` au chargement du module : installer
 * jsdom après coup ne sert à rien. Ce fichier existe donc uniquement pour être
 * importé EN PREMIER — les imports d'un module sont évalués dans l'ordre où ils
 * sont écrits, et c'est la seule garantie disponible ici.
 */
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

const global = globalThis as unknown as Record<string, unknown>;
const fenetre = dom.window as unknown as Record<string, unknown>;

for (const cle of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "Element",
  "Node",
  "SVGElement",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "matchMedia",
]) {
  if (fenetre[cle] === undefined) continue;
  // `navigator` est en lecture seule sur le `globalThis` de Node : on le
  // redéfinit plutôt que de l'affecter.
  Object.defineProperty(global, cle, {
    value: fenetre[cle],
    configurable: true,
    writable: true,
  });
}

/*
 * `matchMedia`, posé sur la FENÊTRE et pas seulement sur le global.
 *
 * jsdom ne l'implémente pas, et les composants l'appellent en `window.matchMedia`
 * — `IllustrationExercice` s'en sert pour respecter « mouvement réduit ». Le
 * poser uniquement sur `globalThis` ne suffisait donc pas : l'illustration
 * levait une exception dans son effet, React démontait la branche, et les
 * aperçus sortaient sans le moindre dessin.
 */
const matchMedia = (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
});
if (!fenetre.matchMedia) fenetre.matchMedia = matchMedia;
global.matchMedia ??= matchMedia;

export {};
