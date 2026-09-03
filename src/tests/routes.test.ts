import { describe, it, expect } from "vitest";
import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Une seule page par chemin.
 *
 * `src/app/page.tsx` et `src/app/(app)/page.tsx` ont longtemps coexisté. Un
 * groupe de routes n'ajoute pas de segment : les deux résolvaient `/`. Le build
 * n'émettait aucun conflit, les deux étaient compilées, et une seule était
 * servie — sans que rien dans les sources ne dise laquelle. La sonde a montré
 * que c'était la racine ; la page du groupe n'a jamais été atteinte.
 *
 * Ce test relit l'arborescence plutôt que le manifeste : il échoue à
 * l'écriture du doublon, pas seulement après un build.
 */

const APP = join(process.cwd(), "src", "app");

/** Chemin d'URL d'un fichier `page.tsx`, groupes de routes retirés. */
function cheminDeRoute(chemin: string): string {
  const relatif = chemin.slice(APP.length).replace(/\\/g, "/");
  const segments = relatif
    .split("/")
    .filter(Boolean)
    .slice(0, -1) // retire « page.tsx »
    // `(app)` est un groupe : il organise les fichiers, pas les URL.
    .filter((s) => !(s.startsWith("(") && s.endsWith(")")))
    // `@modal` désigne un slot parallèle, pas un segment d'URL non plus.
    .filter((s) => !s.startsWith("@"));
  return "/" + segments.join("/");
}

function pages(dossier: string, trouvees: string[] = []): string[] {
  for (const entree of readdirSync(dossier)) {
    const complet = join(dossier, entree);
    if (statSync(complet).isDirectory()) pages(complet, trouvees);
    else if (entree === "page.tsx" || entree === "page.ts") trouvees.push(complet);
  }
  return trouvees;
}

describe("routes de l'application", () => {
  const toutes = pages(APP);

  it("ne définit jamais deux pages pour le même chemin", () => {
    const parChemin = new Map<string, string[]>();
    for (const fichier of toutes) {
      const route = cheminDeRoute(fichier);
      parChemin.set(route, [...(parChemin.get(route) ?? []), fichier.slice(APP.length)]);
    }

    const doublons = [...parChemin.entries()].filter(([, fichiers]) => fichiers.length > 1);
    expect(doublons, `Chemins définis plusieurs fois : ${JSON.stringify(doublons)}`).toEqual([]);
  });

  it("garde une seule page d'accueil, celle qui redirige", () => {
    const accueil = toutes.filter((f) => cheminDeRoute(f) === "/");
    expect(accueil).toHaveLength(1);
    expect(accueil[0]!.endsWith(join("src", "app", "page.tsx"))).toBe(true);
  });

  it("n'a plus d'ancien tableau de bord concurrent", () => {
    expect(existsSync(join(APP, "(app)", "page.tsx"))).toBe(false);
  });

  it("garde le tableau de bord réel sous /dashboard", () => {
    expect(existsSync(join(APP, "(app)", "dashboard", "page.tsx"))).toBe(true);
    expect(toutes.map(cheminDeRoute)).toContain("/dashboard");
  });
});

/**
 * Un segment dynamique porte le même nom pour tous ses voisins.
 *
 * `api/sessions/[templateId]` et `api/sessions/[id]/debrief` ont cohabité un
 * lot entier. `next build` les compile sans rien dire ; c'est le SERVEUR qui
 * refuse, au chargement du manifeste de routes, avec « You cannot use
 * different slug names for the same dynamic path ». Le manifeste étant chargé
 * une fois pour toutes, l'erreur ne frappe pas la route fautive : elle frappe
 * toutes les requêtes, y compris `/login`.
 *
 * C'est le pire genre de panne — invisible à la compilation, totale à
 * l'exécution. Elle se détecte pourtant en relisant des noms de dossiers.
 */
function dossiers(depuis: string, trouves: string[] = []): string[] {
  for (const entree of readdirSync(depuis)) {
    const complet = join(depuis, entree);
    if (statSync(complet).isDirectory()) {
      trouves.push(complet);
      dossiers(complet, trouves);
    }
  }
  return trouves;
}

describe("segments dynamiques", () => {
  it("ne portent jamais deux noms différents à la même position", () => {
    // La clé est le chemin PARENT, groupes de routes retirés : c'est la
    // position que Next compare. La valeur, l'ensemble des noms trouvés.
    const parPosition = new Map<string, Set<string>>();

    for (const dossier of dossiers(APP)) {
      const nom = dossier.slice(dossier.lastIndexOf("/") + 1);
      if (!nom.startsWith("[")) continue;

      const parent = dossier
        .slice(APP.length, dossier.length - nom.length - 1)
        .split("/")
        .filter((s) => s && !(s.startsWith("(") && s.endsWith(")")))
        .join("/");

      const noms = parPosition.get(parent) ?? new Set<string>();
      noms.add(nom);
      parPosition.set(parent, noms);
    }

    const conflits = [...parPosition.entries()]
      .filter(([, noms]) => noms.size > 1)
      .map(([parent, noms]) => `/${parent} : ${[...noms].join(" et ")}`);

    expect(conflits, "Le serveur refusera de servir la moindre route.").toEqual([]);
  });
});
