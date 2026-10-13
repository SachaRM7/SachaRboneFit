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

// La confirmation de l'application (qui remplace `window.confirm`) répond
// « oui » : les gestes vont au bout sans ouvrir de feuille.
// `confirmation.ctest.tsx` teste la vraie feuille avec `vi.unmock`.
vi.mock("@/components/ui/confirmation", async (original) => ({
  ...(await original<typeof import("@/components/ui/confirmation")>()),
  demanderConfirmation: vi.fn(async () => true),
}));

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
