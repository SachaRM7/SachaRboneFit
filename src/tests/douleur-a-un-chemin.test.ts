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
  fichiers(d, estDuProduit).map((f) => path.relative(RACINE, f).split(path.sep).join("/")),
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
    expect(exportes).toContain("deciderProtection");

    for (const nom of ["signalerDouleur", "deciderProtection"]) {
      const routes = ROUTES.filter((r) => new RegExp(`\\b${nom}\\b`).test(lire(r)));
      expect(routes, `${nom} n'est appelée par aucune route`).not.toEqual([]);
    }
  });

  it("et ces routes sont atteintes par un écran", () => {
    /*
     * Le chemin est cherché comme CHAÎNE dans un composant client, pas comme
     * `fetch("…"` littéral. Les deux formes coexistent légitimement : la
     * confirmation appelle `fetch` en direct, tandis que le signalement passe
     * son URL au module d'arrêt non bloquant, qui poste pour lui.
     *
     * Ce qui compte reste vérifié : une route qu'aucun écran ne nomme est une
     * route que personne ne peut atteindre.
     */
    for (const chemin of ["/api/douleur", "/api/douleur/proteger"]) {
      const atteinte = CLIENTS.some((c) => lire(c).includes(`"${chemin}"`));
      expect(atteinte, `${chemin} n'est nommée par aucun composant client`).toBe(true);
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
    expect(source).not.toMatch(/creerContrainte|deciderProtection/);
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

describe("« Arrêter la séance » n'attend aucune décision secondaire", () => {
  /*
   * L'INVARIANT, et la façon dont il a été enfreint.
   *
   * `arreter()` appelait `poursuivre("arreter", …)`, qui attendait le
   * signalement puis, s'il existait une proposition, basculait sur l'écran
   * « Ménager cette zone ? » et RETOURNAIT. `onStopSeance()` n'arrivait que
   * plus tard, dans `conclure("arreter")`, après le « Oui » ou le
   * « Pas maintenant ».
   *
   * Autrement dit : appuyer sur « Arrêter la séance » ne l'arrêtait pas. Il
   * fallait d'abord répondre à une question sur les prochaines séances.
   *
   * `onStopSeance` navigue (`router.push` vers l'écran de fin) : la feuille est
   * démontée, l'écran de protection ne peut pas lui survivre. On ne retarde
   * donc pas l'arrêt pour le sauver — la proposition est persistée avec
   * l'incident et se repose dans « Ce que tu ménages ».
   */

  const SOS = "components/session/SOSDouleur.tsx";

  /**
   * Le corps d'une fonction fléchée déclarée en `const`, jusqu'à la suivante.
   *
   * La borne est la PROCHAINE déclaration de même niveau, pas une accolade
   * fermante : `arreter` s'écrit désormais en une expression qui se termine par
   * `});`, et couper sur `};` avalait la fonction d'après — ce qui faisait
   * échouer le garde sur du code qui n'était pas le sien.
   */
  function corpsDe(source: string, nom: string): string {
    const debut = source.indexOf(`const ${nom} = `);
    expect(debut, `${nom} introuvable`).toBeGreaterThan(-1);
    const reste = source.slice(debut + 6);
    const fin = reste.search(/\n  (?:const |return |\/\*\*)/);
    return fin === -1 ? reste : reste.slice(0, fin);
  }

  it("l'arrêt a son propre chemin, qui délègue au module non bloquant", () => {
    const arreter = corpsDe(lire(SOS), "arreter");
    expect(arreter).toMatch(/arreterSurDouleur\(/);
  });

  it("et ce chemin ne peut pas basculer sur l'écran de protection", () => {
    // Le premier défaut : un `setEtape("protection")` entre l'appui et
    // l'arrêt, ou une délégation à la fonction qui en contient un.
    const arreter = corpsDe(lire(SOS), "arreter");
    expect(arreter).not.toMatch(/setEtape/);
    expect(arreter).not.toMatch(/poursuivre\(/);
    expect(arreter).not.toMatch(/setPropositions/);
  });

  it("ni attendre quoi que ce soit avant d'arrêter", () => {
    /*
     * Le SECOND défaut, et le plus discret parce qu'il avait la forme d'une
     * précaution :
     *
     *     const arreter = async () => {
     *       await signaler("Séance arrêtée sur douleur");
     *       onStopSeance();
     *     };
     *
     * Ce `await` n'attendait pas une décision — il attendait le RÉSEAU. Sur
     * une connexion de salle à dix secondes de latence, l'athlète restait dix
     * secondes dans la séance qu'il venait d'arrêter.
     */
    const arreter = corpsDe(lire(SOS), "arreter");
    expect(arreter, "l'arrêt attend une réponse avant de naviguer")
      .not.toMatch(/\bawait\b/);
    expect(arreter, "l'arrêt ne doit même pas être une fonction asynchrone")
      .not.toMatch(/async/);
    // `signaler` attend la réponse, écrit dans l'état React après retour et
    // suppose la feuille encore montée : l'arrêt ne peut pas s'en servir.
    expect(arreter).not.toMatch(/\bsignaler\(/);
  });

  it("le module d'arrêt ne rend aucune promesse à attendre", () => {
    // Le défaut se réintroduirait par la porte de l'appelant : un
    // `await arreter()` redeviendrait possible si la fonction rendait une
    // promesse.
    const source = lire("components/session/arret-sur-douleur.ts");
    expect(source).toMatch(/export function arreterSurDouleur\([^)]*\): void/);
    expect(source).toMatch(/keepalive: true/);
  });

  it("et le bouton l'appelle sans l'attendre", () => {
    const source = lire(SOS);
    expect(source).toMatch(/onClick=\{arreter\}/);
    expect(source).not.toMatch(/void arreter\(\)/);
  });

  it("aucune décision de protection ne rappelle onStopSeance", () => {
    // L'autre moitié de l'invariant : si le « Oui » ou le « Pas maintenant »
    // arrêtait la séance, l'arrêt dépendrait de nouveau de la réponse.
    const decision = corpsDe(lire(SOS), "repondreProtection");
    expect(decision).not.toMatch(/onStopSeance/);
  });

  it("le chemin qui montre la proposition ne quitte jamais la séance", () => {
    const poursuivre = corpsDe(lire(SOS), "poursuivre");
    expect(poursuivre).toMatch(/setEtape\("protection"\)/);
    expect(poursuivre).not.toMatch(/onStopSeance/);
  });

  it("la proposition perdue à l'arrêt se repose sur un écran durable", () => {
    // Sans cela, arrêter la séance ferait disparaître la question pour
    // toujours — et l'invariant se paierait d'une fonctionnalité muette.
    expect(lire("services/douleur.ts")).toMatch(/export async function propositionsEnAttente/);
    expect(lire("app/api/contraintes/route.ts")).toMatch(/propositionsEnAttente/);
    expect(lire("app/(app)/contraintes/page.tsx")).toMatch(/propositionsEnAttente/);
    expect(lire("components/contraintes/ListeContraintes.tsx"))
      .toMatch(/fetch\("\/api\/douleur\/proteger"/);
  });
});

describe("la confirmation ne fait confiance qu'au cliché serveur", () => {
  it("le corps de /proteger ne porte ni zone, ni muscle, ni sévérité", () => {
    /*
     * Le défaut corrigé : la route recevait `{ zone, severite }` du client et
     * recalculait `musclesDeLaZone(zone)`. Sur une zone dont un seul muscle
     * avait été proposé — l'autre étant déjà couvert —, confirmer recréait une
     * contrainte sur les deux.
     */
    const source = lire("app/api/douleur/proteger/route.ts");
    const schema = source.slice(source.indexOf("const schema"), source.indexOf("export async function"));
    expect(schema).toMatch(/incident_id/);
    expect(schema).toMatch(/decision/);
    for (const champ of ["zone", "severite", "muscle"]) {
      expect(schema, `${champ} ne doit pas venir du client`).not.toMatch(new RegExp(`${champ}`));
    }
  });

  it("le service relit les propositions persistées plutôt que la zone", () => {
    const source = lire("services/douleur.ts");
    const decision = source.slice(
      source.indexOf("export async function deciderProtection"),
      source.indexOf("async function marquerDecision"),
    );
    expect(decision.length).toBeGreaterThan(0);
    expect(decision).toMatch(/propositionsDepuis/);
    // Recalculer la zone est exactement ce qui produisait la surprotection.
    expect(decision).not.toMatch(/musclesDeLaZone/);
  });

  it("et l'incident n'est relu qu'à travers la séance du compte", () => {
    const source = lire("services/douleur.ts");
    const acces = source.slice(
      source.indexOf("async function incidentDuCompte"),
      source.indexOf("export async function deciderProtection"),
    );
    expect(acces).toMatch(/innerJoin/);
    expect(acces).toMatch(/sessionLogs\.userId, userId/);
  });

  it("la décision est inscrite, ce qui rend la confirmation idempotente", () => {
    const source = lire("services/douleur.ts");
    expect(source).toMatch(/decisionDepuis/);
    expect(source).toMatch(/dejaTranchee/);
  });
});
