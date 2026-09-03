import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Un fond posé sans couleur de texte, c'est comme ça qu'on obtient blanc sur
 * blanc.
 *
 * Le filtre actif de la bibliothèque était illisible en thème clair. Le code
 * n'avait l'air de rien : `variant="default"` pour l'état actif, et un fond
 * forcé à `--papier-2` pour l'adoucir. Mais le variant apportait AUSSI son
 * texte — `primary-foreground`, presque blanc —, et seul le fond avait été
 * remplacé. Les deux valeurs se sont retrouvées du même côté du contraste.
 *
 * Ce qui rend le défaut sournois : en thème sombre, exactement le même code est
 * parfaitement lisible. Le tester sur un seul thème ne prouve donc rien, et le
 * relire non plus — il faut savoir ce que le variant ajoute dans le dos.
 *
 * La règle vérifiée ici, sur les écrans où l'état d'un contrôle se lit à sa
 * couleur : une classe qui pose un fond pose aussi le texte. Elle ne mesure pas
 * le contraste — les valeurs du système Carnet sont validées ailleurs — elle
 * empêche la moitié manquante.
 */

const RACINE = path.resolve(import.meta.dirname, "..");

/** Les écrans dont l'état se lit à la couleur d'une pastille. */
const ECRANS = [
  "components/exercises/ExerciseFilters.tsx",
  "components/exercises/ExerciseLibrary.tsx",
];

/** Les classes de fond du système, hors dégradés et fonds de signal. */
const POSE_UN_FOND = /\bbg-(?:encre|papier|papier-2|carte|filet)\b/;

function chainesDeClasses(fichier: string): string[] {
  const texte = readFileSync(path.join(RACINE, fichier), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  // Les littéraux : `"…"` et les branches d'un ternaire dans un gabarit.
  return [...texte.matchAll(/"([^"\n]*\bbg-[^"\n]*)"/g)].map((m) => m[1]!);
}

describe("une pastille qui pose un fond pose aussi son texte", () => {
  for (const ecran of ECRANS) {
    const chaines = chainesDeClasses(ecran).filter((c) => POSE_UN_FOND.test(c));

    it(`${ecran} — il y en a, sinon ce test ne surveille rien`, () => {
      expect(chaines.length).toBeGreaterThan(0);
    });

    for (const chaine of chaines) {
      it(`${ecran} — « ${chaine} » nomme sa couleur de texte`, () => {
        expect(chaine, "un fond sans texte hérite du variant : blanc sur blanc").toMatch(/\btext-/);
      });
    }
  }

  it("l'état actif ne se distingue pas par la seule couleur", () => {
    // Le contour change avec le fond, et l'état est annoncé : la pastille
    // reste distinguable sans percevoir la différence de teinte.
    const filtres = readFileSync(path.join(RACINE, ECRANS[0]!), "utf8");
    expect(filtres).toMatch(/aria-pressed=/);
    expect(filtres).toMatch(/border-encre/);
    expect(filtres).toMatch(/border-filet/);
  });

  it("les filtres n'affichent plus les clés du moteur", () => {
    // La table locale disait « P1 », « P2 » : le référentiel dit « Poussée ».
    const filtres = readFileSync(path.join(RACINE, ECRANS[0]!), "utf8");
    expect(filtres).not.toMatch(/P1_poussee:\s*"P1"/);
    expect(filtres).toMatch(/libellePilier/);
  });
});
