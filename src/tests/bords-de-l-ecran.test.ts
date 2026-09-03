import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Ce qui touche un bord de l'écran doit savoir ce qu'il y a dessous.
 *
 * `viewport-fit: cover` est déclaré : la page occupe la dalle entière, encoche
 * et indicateur d'accueil compris. C'est le bon choix pour une application
 * installée sur l'écran d'accueil, et il oblige chaque élément posé sur un bord
 * à tenir compte de la zone que le matériel y occupe.
 *
 * Rien ne le rappelait. Trois endroits le faisaient — l'onboarding, l'entrée du
 * coach, les feuilles SOS —, et tous les autres raisonnaient comme si l'écran
 * était un rectangle. Les symptômes ne ressemblaient pas à un bug de mise en
 * page : des onglets qui déclenchent le geste système d'iOS au lieu de naviguer,
 * une dernière série inatteignable, une pastille « hors ligne » invisible.
 *
 * Le piège de ce genre de correction est le nombre recopié. `bottom-16` était
 * juste — 4 rem, la hauteur de la barre — puis a cessé de l'être sans que
 * personne y touche, le jour où la barre a dû grandir de la marge du bas. D'où
 * un inventaire explicite : chaque élément de chrome déclare ici à quelle
 * source il se réfère, et retirer cette référence fait échouer le test.
 *
 * Ce garde lit le code. Il ne prouve pas le rendu — il n'y a pas de navigateur
 * ici — mais il prouve qu'aucun de ces sept endroits n'est revenu à une
 * constante.
 */

const RACINE = path.resolve(import.meta.dirname, "..");

function source(fichier: string): string {
  return readFileSync(path.join(RACINE, fichier), "utf8");
}

/** Le code seul : ces fichiers expliquent longuement ce qu'ils corrigent. */
function code(fichier: string): string {
  return source(fichier)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("la source unique des marges d'écran", () => {
  const css = source("app/globals.css");

  it("globals.css déclare les quatre variables", () => {
    for (const variable of ["--marge-haut", "--marge-bas", "--rangee-nav", "--barre-nav"]) {
      expect(css, `${variable} doit être déclarée`).toContain(`${variable}:`);
    }
  });

  it("les marges viennent de env(safe-area-inset-*), avec un repli à 0", () => {
    expect(css).toMatch(/--marge-haut:\s*env\(safe-area-inset-top,\s*0px\)/);
    expect(css).toMatch(/--marge-bas:\s*env\(safe-area-inset-bottom,\s*0px\)/);
  });

  it("la hauteur de barre inclut la marge du bas, sinon elle ne sert à rien", () => {
    // C'est TOUT l'intérêt de `--barre-nav` : une hauteur qu'on peut utiliser
    // sans se demander si l'appareil a un indicateur d'accueil.
    expect(css).toMatch(/--barre-nav:\s*calc\(var\(--rangee-nav\)\s*\+\s*var\(--marge-bas\)\)/);
  });
});

/**
 * Les sept endroits qui touchent un bord, et ce dont chacun a besoin.
 *
 * `--barre-nav` pour se placer AU-DESSUS de la barre ; `--marge-bas` pour
 * réserver la bande du geste système sous une rangée tactile ; `--marge-haut`
 * pour ne pas passer sous la barre d'état.
 */
const CHROME: Array<{ fichier: string; attend: string[]; pourquoi: string }> = [
  {
    fichier: "components/layout/BottomNav.tsx",
    attend: ["--barre-nav", "--rangee-nav", "--marge-bas"],
    pourquoi: "la rangée tactile garde 4 rem, et la marge s'ajoute SOUS elle",
  },
  {
    fichier: "app/(app)/layout.tsx",
    attend: ["--barre-nav", "--marge-haut"],
    pourquoi: "les deux bords sont dégagés une fois pour tous les écrans",
  },
  {
    fichier: "app/(app)/sessions/new/[templateId]/page.tsx",
    attend: ["--barre-nav", "--marge-haut"],
    pourquoi: "la rangée SOS se place au-dessus de la barre, l'en-tête sous l'encoche",
  },
  {
    fichier: "components/coach/BoutonCoach.tsx",
    attend: ["--barre-nav"],
    pourquoi: "l'entrée du coach est posée au-dessus de la barre",
  },
  {
    fichier: "components/ui/OfflineIndicator.tsx",
    attend: ["--marge-haut"],
    pourquoi: "la pastille se logeait derrière la barre d'état",
  },
  {
    fichier: "components/progression/ContenuProgression.tsx",
    attend: ["--marge-haut"],
    pourquoi: "en-tête collant : à top-0 il glisse sous l'encoche",
  },
  {
    fichier: "app/bienvenue/page.tsx",
    attend: ["safe-area-inset-top", "safe-area-inset-bottom"],
    pourquoi: "l'onboarding gérait déjà ses deux bords — c'est la référence",
  },
];

describe("le chrome de l'application se réfère à cette source", () => {
  for (const { fichier, attend, pourquoi } of CHROME) {
    it(`${fichier} — ${pourquoi}`, () => {
      const texte = code(fichier);
      for (const reference of attend) {
        expect(texte, `${fichier} doit se référer à ${reference}`).toContain(reference);
      }
    });
  }

  it("aucun de ces écrans ne se place à une hauteur de barre écrite en dur", () => {
    // La forme exacte du défaut : `bottom-16`, juste au moment où on l'écrit,
    // faux dès que la barre grandit de la marge du bas.
    for (const { fichier } of CHROME) {
      expect(code(fichier), `${fichier} : hauteur de barre recopiée`)
        .not.toMatch(/\bbottom-(?:16|20|24)\b/);
    }
  });

  it("le dégagement du bas n'est pas compté deux fois", () => {
    // Le layout le pose pour tous. Les écrans qui le reposaient ajoutaient du
    // vide à faire défiler sous leur dernier bloc.
    for (const fichier of [
      "components/dashboard/ContenuTableauDeBord.tsx",
      "components/progression/ContenuProgression.tsx",
    ]) {
      expect(code(fichier), `${fichier} : dégagement de barre en double`)
        .not.toMatch(/\bpb-(?:20|40)\b/);
    }
  });
});
