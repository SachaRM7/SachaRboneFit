import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Depuis n'importe quel écran, on doit pouvoir revenir.
 *
 * La règle est écrite dans `EnTeteSecondaire` : Accueil, Séance, Progression et
 * Plus sont les racines de la navigation basse et n'ont pas de retour ; tout le
 * reste en a un, au même endroit, vers une cible NOMMÉE — après un
 * rechargement ou une arrivée par lien, l'historique du navigateur ne dit plus
 * d'où l'on vient, et « retour » doit rester vrai.
 *
 * Elle n'était appliquée que sur deux écrans. Les six autres écrans de « Plus »
 * n'avaient aucun retour : on en repartait par l'onglet du bas, ou par le geste
 * de Safari — invisible pour qui ne le connaît pas, et absent quand
 * l'application est installée depuis l'écran d'accueil, ce qui est le cas ici.
 *
 * Le test lit le code des écrans plutôt que leur rendu : c'est la présence de
 * l'en-tête et sa cible qui se vérifient, pas leur apparence.
 */

const RACINE = path.resolve(import.meta.dirname, "..");

function source(relatif: string): string {
  const chemin = path.join(RACINE, relatif);
  expect(existsSync(chemin), `${relatif} n'existe plus — mets cette liste à jour`).toBe(true);
  return readFileSync(chemin, "utf8");
}

/** Les quatre racines : elles portent la navigation basse, pas un retour. */
const RACINES = [
  "app/(app)/dashboard/page.tsx",
  "app/(app)/progression/page.tsx",
  "app/(app)/settings/page.tsx",
];

/** Les écrans atteints depuis « Plus », et la cible attendue de leur retour. */
const SECONDAIRES: Array<[string, string]> = [
  ["app/(app)/programme/page.tsx", "/settings"],
  ["app/(app)/historique/page.tsx", "/settings"],
  ["app/(app)/exercises/page.tsx", "/settings"],
  ["app/(app)/gyms/page.tsx", "/settings"],
  ["app/(app)/profil/page.tsx", "/settings"],
  ["app/(app)/bodyweight/page.tsx", "/settings"],
  ["app/(app)/contraintes/page.tsx", "/settings"],
  ["app/(app)/gyms/[id]/page.tsx", "/gyms"],
  ["app/(app)/gyms/new/page.tsx", "/gyms"],
];

describe("les écrans secondaires portent un retour", () => {
  for (const [ecran, cible] of SECONDAIRES) {
    it(`${ecran} revient vers ${cible}`, () => {
      const code = source(ecran);
      expect(code, "pas d'en-tête de retour").toContain("EnTeteSecondaire");
      expect(code, `la cible attendue est ${cible}`).toMatch(
        new RegExp(`vers=(?:"${cible}"|\\{\`?${cible.replace("/", "\\/")})`),
      );
    });
  }

  it("la cible est nommée, jamais un retour d'historique", () => {
    // `router.back()` ment après un rechargement ou une arrivée par lien : il
    // renvoie où l'on était, pas d'où cet écran dépend.
    for (const [ecran] of SECONDAIRES) {
      expect(source(ecran), `${ecran} utilise router.back()`).not.toMatch(/router\.back\(\)/);
    }
  });
});

describe("les racines n'en portent pas", () => {
  for (const racine of RACINES) {
    it(`${racine} n'a pas de retour`, () => {
      // Le contrôle négatif de la règle : un retour sur une racine ferait
      // sortir de la navigation basse par un chemin qui n'existe pas.
      expect(source(racine)).not.toContain("EnTeteSecondaire");
    });
  }
});
