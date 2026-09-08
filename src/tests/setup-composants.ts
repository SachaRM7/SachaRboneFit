import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * Ce que jsdom ne fournit pas, et que le Live utilise.
 *
 * Aucun de ces bouchons ne remplace une décision métier : ce sont des API du
 * navigateur absentes de l'environnement de test. Les mettre ici plutôt que
 * dans chaque fichier évite qu'un test oublie l'un d'eux et échoue pour une
 * raison qui n'a rien à voir avec ce qu'il vérifie.
 */

afterEach(cleanup);

// `confirm` : le retrait d'une série déjà validée le demande. Il rend `true`
// pour que le geste aille au bout ; les tests qui vérifient le refus le
// redéfinissent localement.
vi.stubGlobal("confirm", () => true);

// `matchMedia` est lu par des composants d'interface tiers.
vi.stubGlobal(
  "matchMedia",
  (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
);

// `scrollIntoView` n'existe pas dans jsdom ; il n'a aucun effet observable ici.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
