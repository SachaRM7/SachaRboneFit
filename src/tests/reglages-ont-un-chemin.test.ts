import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Une table qui existe doit avoir une porte.
 *
 * `instance_reglages` a vécu plusieurs mois dans l'état le plus trompeur qui
 * soit : colonne par colonne conforme, index unique en place, service écrit,
 * validation testée, écran capable de l'afficher — et AUCUN chemin applicatif
 * pour y créer une seule ligne. Les tests d'intégration passaient au vert parce
 * qu'ils inséraient eux-mêmes leurs définitions. Rien, dans le dépôt, ne disait
 * que la fonctionnalité était inatteignable.
 *
 * Ce fichier lit le texte du dépôt et refuse ce silence-là. Il ne remplace pas
 * `declarer-reglage.itest.ts`, qui prouve le comportement par les routes ; il
 * empêche la SITUATION de revenir — un service qu'aucune route n'appelle, ou
 * une route qu'aucun écran n'atteint.
 *
 * Il vaut d'ailleurs comme patron : c'est le même défaut, dans la même forme,
 * qui rend `verdictSignalement` et `creerContrainte` inatteignables aujourd'hui.
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
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const lire = (f: string) => sansCommentaires(readFileSync(f, "utf8"));

/** Ni les tests ni les scripts ne comptent : ce sont eux qui masquaient le trou. */
const estDuProduit = (f: string) =>
  /\.tsx?$/.test(f) && !/\.(test|itest)\.tsx?$/.test(f) && !f.includes("/scripts/");

const SOURCES = [
  ...fichiers("services", estDuProduit),
  ...fichiers("app", estDuProduit),
  ...fichiers("lib", estDuProduit),
  ...fichiers("components", estDuProduit),
];

/** Les modules du produit qui écrivent réellement une définition de réglage. */
const ECRIVAINS = SOURCES.filter((f) => /insert\(\s*instanceReglages\s*\)/.test(lire(f)));

describe("instance_reglages a un chemin de création", () => {
  it("au moins un module du produit écrit une définition", () => {
    expect(
      ECRIVAINS.map((f) => path.relative(RACINE, f)),
      "aucun code applicatif n'insère dans instance_reglages : la table est de nouveau inatteignable",
    ).not.toEqual([]);
  });

  it("ce module expose sa création à une route", () => {
    // Les noms exportés par les écrivains — c'est par eux qu'une route peut
    // atteindre l'écriture.
    const exportes = ECRIVAINS.flatMap((f) =>
      [...lire(f).matchAll(/export\s+async\s+function\s+(\w+)/g)].map((m) => m[1]!),
    );
    expect(exportes.length).toBeGreaterThan(0);

    const routes = fichiers("app/api", (f) => f.endsWith("route.ts"));
    const appelantes = routes.filter((r) => {
      const source = lire(r);
      return exportes.some((nom) => new RegExp(`\\b${nom}\\b`).test(source));
    });

    expect(
      appelantes.map((f) => path.relative(RACINE, f)),
      "l'écriture existe mais aucune route ne l'appelle : elle reste hors d'atteinte d'un navigateur",
    ).not.toEqual([]);
  });

  it("et cette route est réellement appelée par un écran", () => {
    /*
     * Le dernier maillon, et le plus souvent manquant. Une route sans appelant
     * est du code mort qui a l'air vivant — l'audit en a trouvé sept d'un coup.
     *
     * Le rapprochement se fait sur les segments STATIQUES du chemin : les
     * segments dynamiques voyagent dans un littéral de gabarit côté client et
     * ne se comparent pas textuellement.
     */
    const routes = fichiers("app/api", (f) => f.endsWith("route.ts"))
      .filter((r) => /instanceReglages|declarerReglage/.test(lire(r)));
    expect(routes.length).toBeGreaterThan(0);

    const clients = SOURCES.filter((f) => lire(f).includes('"use client"'));

    for (const route of routes) {
      const segments = path
        .relative(path.join(RACINE, "app"), path.dirname(route))
        .split(path.sep)
        .filter((s) => !s.startsWith("["));

      const atteinte = clients.some((c) => {
        const source = lire(c);
        return [...source.matchAll(/fetch\(\s*[`"']([^`"']*)/g)].some(
          ([, url]) => segments.every((s) => (url ?? "").includes(s)),
        );
      });

      expect(
        atteinte,
        `${path.relative(RACINE, route)} n'est appelée par aucun composant client : `
        + "la route existe, personne ne peut l'atteindre",
      ).toBe(true);
    }
  });
});

describe("la section des réglages ne disparaît plus quand elle est vide", () => {
  it("elle n'est plus conditionnée au fait d'avoir déjà des réglages", () => {
    /*
     * La ligne exacte qui rendait le trou invisible :
     *
     *     {contexte.reglages.length > 0 && (
     *
     * Comme rien ne savait créer de définition, la condition était fausse sur
     * CHAQUE appareil du parc. La section n'existait, en pratique, pour
     * personne — et son absence se lisait comme « cette machine n'a rien à
     * régler » plutôt que comme « rien ne peut le dire ».
     */
    const source = lire(path.join(RACINE, "components/session/FicheExecution.tsx"));
    expect(source).not.toMatch(/\{\s*contexte\.reglages\.length\s*>\s*0\s*&&/);
  });

  it("le vide se dit, et se comble au même endroit", () => {
    const source = lire(path.join(RACINE, "components/session/FicheExecution.tsx"));
    expect(source).toMatch(/Aucun réglage décrit/);
    expect(source).toMatch(/DeclarerReglage/);
    // Proposé seulement à qui peut le faire : le serveur refuserait les autres,
    // et découvrir le refus après avoir tout saisi n'est pas une politesse.
    expect(source).toMatch(/contexte\.peutDecrire/);
  });
});

describe("aucune plage n'est semée à l'insu de qui la lira", () => {
  it("les libellés proposés ne portent ni borne ni option", () => {
    const source = lire(path.join(RACINE, "lib/engine/declaration-reglage.ts"));
    const liste = source.slice(source.indexOf("LIBELLES_COURANTS"));
    expect(liste).not.toMatch(/\bmin\s*:/);
    expect(liste).not.toMatch(/\bmax\s*:/);
    expect(liste).not.toMatch(/\boptions\s*:/);
  });

  it("le formulaire ne pré-remplit aucune borne", () => {
    // Un `useState("1")` sur le minimum suffirait à réintroduire la
    // supposition que tout ce lot refuse.
    const source = lire(path.join(RACINE, "components/session/DeclarerReglage.tsx"));
    expect(source).toMatch(/const \[min, setMin\] = useState\(""\)/);
    expect(source).toMatch(/const \[max, setMax\] = useState\(""\)/);
  });
});
