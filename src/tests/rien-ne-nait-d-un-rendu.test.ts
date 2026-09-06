import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Une séance ne naît pas d'un affichage.
 *
 * La séance fantôme du 6 septembre tenait à deux lignes : un effet de rendu qui
 * faisait `POST /api/sessions` dès qu'on atterrissait sur l'écran de séance
 * sans identifiant. Aucun geste, aucune intention — un simple affichage
 * ouvrait une ligne en base. Et comme une redirection parasite passait par là
 * juste après la clôture, une « Calibration B — 0/6 » naissait dans la seconde
 * qui suivait la vraie séance.
 *
 * Ce genre de défaut ne se voit pas à la relecture : `useEffect` est le lieu
 * normal des chargements, et un `fetch` de plus n'y détonne pas. Ce fichier
 * lit donc le texte et refuse la forme.
 *
 * Il ne remplace pas le test d'intégration, qui prouve le comportement. Il
 * empêche la forme de revenir par un autre chemin.
 */

const RACINE = path.resolve(import.meta.dirname, "..");

function code(fichier: string): string {
  return readFileSync(path.join(RACINE, fichier), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Les blocs `useEffect(...)`, découpés sur leur tableau de dépendances.
 *
 * Ce n'est pas une analyse syntaxique, et ça n'a pas à l'être : un effet de ce
 * dépôt se termine toujours par `}, [ … ]);` en fin de ligne. Couper là évite
 * d'avaler tout ce qui suit le dernier effet du fichier — les gestionnaires de
 * clic, précisément ceux où la création est désormais légitime.
 */
function effets(source: string): string[] {
  const trouves: string[] = [];
  const fin = /\n\s{2}\},\s*\[/;
  let depuis = source.indexOf("useEffect(");
  while (depuis !== -1) {
    const reste = source.slice(depuis);
    const borne = reste.search(fin);
    trouves.push(borne === -1 ? reste : reste.slice(0, borne));
    depuis = source.indexOf("useEffect(", depuis + 1);
  }
  return trouves;
}

const ECRAN_SEANCE = "app/(app)/sessions/new/[templateId]/page.tsx";

describe("création de séance", () => {
  it("aucun effet de l'écran de séance ne crée de session_log", () => {
    const fautifs = effets(code(ECRAN_SEANCE)).filter(
      (bloc) => /"\/api\/sessions"/.test(bloc) && /method:\s*"POST"/.test(bloc),
    );

    expect(
      fautifs.length,
      "Un effet crée une séance. La création doit venir d'un geste — un " +
        "gestionnaire de clic —, jamais d'un rendu.",
    ).toBe(0);
  });

  it("la création existe toujours, mais dans un gestionnaire", () => {
    // L'écran doit rester capable d'ouvrir une séance : ce qu'on interdit est
    // qu'il le fasse tout seul. Sans cette seconde assertion, supprimer
    // purement la fonctionnalité ferait passer le test.
    const source = code(ECRAN_SEANCE);
    expect(source).toMatch(/"\/api\/sessions"/);
    expect(source).toMatch(/Démarrer la séance/);
  });

  it("la page de fin ne renvoie pas vers l'écran de séance après avoir enregistré", () => {
    // Le garde « pas de séance en cours » doit se taire quand on part
    // volontairement : c'est lui qui déclenchait la redirection parasite.
    const source = code("app/(app)/sessions/new/[templateId]/finish/page.tsx");
    expect(source).toMatch(/sortieVolontaire/);
    // Et le drapeau doit être posé AVANT que le brouillon soit vidé : c'est
    // `clear()` qui provoque le rendu où le garde se réveille.
    const posee = source.indexOf("sortieVolontaire.current = true");
    const vidage = source.indexOf("clear();");
    expect(posee).toBeGreaterThan(-1);
    expect(posee).toBeLessThan(vidage);
  });
});
