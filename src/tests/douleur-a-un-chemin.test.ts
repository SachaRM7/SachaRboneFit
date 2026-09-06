import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * La chaîne de la douleur ne doit plus pouvoir se rompre en silence.
 *
 * Elle l'était, et de la pire façon : chaque morceau marchait, testé, correct,
 * et aucun n'était relié aux autres. `verdictSignalement` et `creerContrainte`
 * n'avaient AUCUN appelant applicatif ; `contraintes.itest.ts` passait au vert
 * en les appelant directement. Rien, dans le dépôt, ne disait que la
 * fonctionnalité était inatteignable.
 *
 * Ce fichier lit le texte du dépôt et refuse cette situation. Il ne remplace pas
 * `douleur-vers-contrainte.itest.ts`, qui prouve le comportement par les
 * routes ; il empêche le trou de revenir par un autre chemin — un composant
 * démonté, une route sans appelant, une confirmation qui disparaît.
 *
 * Il est le frère de `reglages-ont-un-chemin.test.ts`, et c'est délibéré : le
 * même défaut s'est produit deux fois, dans deux modules différents.
 */

const RACINE = path.resolve(import.meta.dirname, "..");

function fichiers(dossier: string, filtre: (f: string) => boolean): string[] {
  const trouves: string[] = [];
  const parcourir = (courant: string) => {
    for (const entree of readdirSync(courant)) {
      const complet = path.join(courant, entree);
      if (statSync(complet).isDirectory()) parcourir(complet);
      else if (filtre(complet)) trouves.push(complet);
    }
  };
  parcourir(path.join(RACINE, dossier));
  return trouves;
}

const sansCommentaires = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const lire = (f: string) => sansCommentaires(readFileSync(path.join(RACINE, f), "utf8"));

/** Ni les tests ni les scripts : ce sont eux qui masquaient le trou. */
const estDuProduit = (f: string) =>
  /\.tsx?$/.test(f) && !/\.(test|itest)\.tsx?$/.test(f) && !f.includes("/scripts/");

const SOURCES = ["services", "app", "lib", "components"].flatMap((d) =>
  fichiers(d, estDuProduit).map((f) => path.relative(RACINE, f)),
);

const ROUTES = SOURCES.filter((f) => f.startsWith("app/api") && f.endsWith("route.ts"));
const CLIENTS = SOURCES.filter((f) => lire(f).includes('"use client"'));

/** Un composant est-il réellement monté quelque part hors de son fichier ? */
function monteDans(composant: string, fichier: string): boolean {
  return new RegExp(`<${composant}[\\s/>]`).test(lire(fichier));
}

describe("le mannequin est monté là où il a été promis", () => {
  it("il existe, et une seule fois", () => {
    // Trois implémentations anatomiques finiraient par diverger : l'une
    // apprendrait qu'un tirage sollicite l'arrière d'épaule, l'autre non.
    const svgAnatomiques = SOURCES.filter(
      (f) => f.startsWith("components/") && /viewBox/.test(lire(f)) && /Silhouette|mannequin/i.test(lire(f)),
    );
    expect(svgAnatomiques).toEqual(["components/anatomie/Mannequin.tsx"]);
  });

  it("SOSDouleur le monte, en mode douleur", () => {
    const source = lire("components/session/SOSDouleur.tsx");
    expect(monteDans("Mannequin", "components/session/SOSDouleur.tsx")).toBe(true);
    expect(source).toMatch(/mode="douleur"/);
  });

  it("et l'ancienne rangée de pastilles de zones n'est plus l'expérience principale", () => {
    // La forme exacte de ce qu'on remplace : dix-sept boutons issus de
    // `ZONES_DOULEUR`, alignés, à lire avant de pouvoir signaler quoi que ce soit.
    const source = lire("components/session/SOSDouleur.tsx");
    expect(source).not.toMatch(/ZONES_DOULEUR\s*\.\s*map/);
    expect(source).not.toMatch(/const ZONES = /);
  });

  it("la fiche d'exécution le monte, en mode exercice", () => {
    const source = lire("components/session/FicheExecution.tsx");
    expect(monteDans("Mannequin", "components/session/FicheExecution.tsx")).toBe(true);
    expect(source).toMatch(/mode="exercice"/);
    expect(source).toMatch(/musclesSecondaires/);
  });

  it("la fiche de la bibliothèque monte LE MÊME, pas un second dessin", () => {
    expect(monteDans("Mannequin", "app/(app)/exercises/[id]/page.tsx")).toBe(true);
  });

  it("il reste consultatif : rien ne le met sur la carte de saisie des séries", () => {
    // La saisie est prioritaire. Le mannequin vit dans la fiche, à un geste de
    // distance — jamais entre la charge et les répétitions.
    expect(monteDans("Mannequin", "components/session/TableauSeries.tsx")).toBe(false);
  });
});

describe("la règle de suite a un appelant applicatif", () => {
  const services = SOURCES.filter((f) => f.startsWith("services/"));

  it("verdictSignalement est appelé par un service du produit", () => {
    const appelants = services.filter(
      (f) => f !== "services/contraintes.ts" && /\bverdictSignalement\s*\(/.test(lire(f)),
    );
    expect(
      appelants,
      "verdictSignalement n'a plus d'appelant : la règle redevient inatteignable",
    ).not.toEqual([]);
  });

  it("et ce service est atteint par une route", () => {
    const exportes = SOURCES.filter((f) => f.startsWith("services/douleur"))
      .flatMap((f) => [...lire(f).matchAll(/export async function (\w+)/g)].map((m) => m[1]!));
    expect(exportes).toContain("signalerDouleur");
    expect(exportes).toContain("protegerZones");

    for (const nom of ["signalerDouleur", "protegerZones"]) {
      const routes = ROUTES.filter((r) => new RegExp(`\\b${nom}\\b`).test(lire(r)));
      expect(routes, `${nom} n'est appelée par aucune route`).not.toEqual([]);
    }
  });

  it("et ces routes sont atteintes par un écran", () => {
    for (const chemin of ["/api/douleur", "/api/douleur/proteger"]) {
      const atteinte = CLIENTS.some((c) => lire(c).includes(`fetch("${chemin}"`));
      expect(atteinte, `${chemin} n'est appelée par aucun composant client`).toBe(true);
    }
  });

  it("creerContrainte est appelée par un service, pas seulement par des tests", () => {
    const appelants = services.filter(
      (f) => f !== "services/contraintes.ts" && /\bcreerContrainte\s*\(/.test(lire(f)),
    );
    expect(appelants).not.toEqual([]);
  });
});

describe("aucune contrainte ne peut naître sans confirmation", () => {
  it("la route qui SIGNALE n'écrit jamais dans les contraintes", () => {
    // L'invariant de sécurité du lot, vérifié sur le texte : il n'existe aucune
    // branche du signalement qui crée un état. Les deux routes sont séparées
    // pour que ce test puisse être écrit.
    const source = lire("app/api/douleur/route.ts");
    expect(source).not.toMatch(/creerContrainte|protegerZones/);
  });

  it("le service qui signale non plus", () => {
    const source = lire("services/douleur.ts");
    const signalement = source.slice(
      source.indexOf("export async function signalerDouleur"),
      source.indexOf("async function propositionsPourZones"),
    );
    expect(signalement.length).toBeGreaterThan(0);
    expect(signalement).not.toMatch(/creerContrainte/);
  });

  it("verdictSignalement ne crée toujours rien elle-même", () => {
    const source = lire("services/contraintes.ts");
    const regle = source.slice(
      source.indexOf("export async function verdictSignalement"),
      source.indexOf("export interface CreationContrainte"),
    );
    expect(regle.length).toBeGreaterThan(0);
    expect(regle).not.toMatch(/insert\(|creerContrainte/);
  });

  it("l'écran demande explicitement avant d'appeler la protection", () => {
    const source = lire("components/session/SOSDouleur.tsx");
    expect(source).toMatch(/Oui, la ménager/);
    expect(source).toMatch(/Pas maintenant/);
    // Le prix du « Oui » est annoncé avant : les muscles ménagés, et ce que
    // l'application fera.
    expect(source).toMatch(/libelleMuscles/);
    expect(source).toMatch(/effets/);
  });

  it("aucun userId ne vient du client", () => {
    for (const f of ["app/api/douleur/route.ts", "app/api/douleur/proteger/route.ts"]) {
      const source = lire(f);
      expect(source).toMatch(/getAuthenticatedUserId\(\)/);
      // Un `user_id` dans le schéma de la requête serait exactement le défaut.
      expect(source, f).not.toMatch(/user_?[Ii]d:\s*z\./);
    }
  });
});

describe("la compatibilité historique reste branchée", () => {
  it("la relecture des incidents passe par le lecteur commun", () => {
    const source = lire("services/contraintes.ts");
    expect(source).toMatch(/signalementsDepuis/);
    // La forme exacte du défaut : lire `ctx.muscle` à la main, sans passer par
    // le lecteur qui connaît les trois formats présents en base.
    expect(source).not.toMatch(/ctx\.muscle\b/);
    expect(source).not.toMatch(/Number\(ctx\.intensite\)/);
  });

  it("le contexte écrit porte les deux vocabulaires", () => {
    const source = lire("lib/engine/incident-douleur.ts");
    for (const champ of ["intensite", "niveau", "muscle", "zones", "muscles", "moment"]) {
      expect(source, champ).toMatch(new RegExp(`${champ}:`));
    }
  });
});
