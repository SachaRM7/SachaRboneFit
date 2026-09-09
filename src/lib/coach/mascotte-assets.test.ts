import { describe, it, expect } from "vitest";
import { existsSync, statSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  ASSETS_MASCOTTE,
  ETATS_MASCOTTE,
  LARGEURS_MASCOTTE,
  TAILLES_MASCOTTE,
  urlMascotte,
  masterMascotte,
} from "./mascotte-assets";

/**
 * Le registre pointe-t-il vers des fichiers qui existent VRAIMENT ?
 *
 * Une URL fausse ne lève aucune erreur : l'écran affiche un cadre vide, ou rien
 * du tout, et personne ne s'en aperçoit avant la salle. Ces tests lisent donc
 * le disque plutôt que de faire confiance au registre.
 */

const RACINE = process.cwd();
const PUBLIC = path.join(RACINE, "public");
const local = (url: string) => path.join(PUBLIC, url.replace(/^\//, ""));
/** Les masters sont des chemins de dépôt, plus des URL : ils se lisent ainsi. */
const depot = (chemin: string) => path.join(RACINE, chemin);

describe("les treize assets existent, et rien de plus", () => {
  it("le registre couvre exactement les états déclarés", () => {
    expect(Object.keys(ASSETS_MASCOTTE).sort()).toEqual([...ETATS_MASCOTTE].sort());
    expect(ETATS_MASCOTTE).toHaveLength(13);
  });

  it("chaque état a son master sur le disque, HORS de public/", () => {
    for (const etat of ETATS_MASCOTTE) {
      const chemin = masterMascotte(etat);
      expect(existsSync(depot(chemin)), `master manquant : ${etat}`).toBe(true);
      // Un master ne doit pas pouvoir redevenir une URL par distraction.
      expect(chemin.startsWith("/"), `${etat} : le master ressemble à une URL`)
        .toBe(false);
      expect(chemin).toMatch(/^assets\/coach-mascot\/masters\//);
    }
  });

  it("et ses trois dérivés web", () => {
    for (const etat of ETATS_MASCOTTE) {
      for (const taille of TAILLES_MASCOTTE) {
        const f = local(urlMascotte(etat, taille));
        expect(existsSync(f), `dérivé manquant : ${etat}/${taille}`).toBe(true);
      }
    }
  });

  it("aucun fichier orphelin dans le dossier des dérivés", () => {
    // Un dérivé qu'aucun état ne réclame est le reste d'un renommage : il
    // pèse dans le déploiement et personne ne le sert.
    const attendus = new Set(
      ETATS_MASCOTTE.flatMap((e) =>
        TAILLES_MASCOTTE.map((t) => path.basename(urlMascotte(e, t))),
      ),
    );
    const presents = readdirSync(path.join(PUBLIC, "coach-mascot/w"));
    expect([...presents].filter((f) => !attendus.has(f))).toEqual([]);
    expect(presents).toHaveLength(13 * 3);
  });
});

describe("ce qui part sur le téléphone reste léger", () => {
  it("aucun dérivé ne dépasse 60 Ko", () => {
    /*
     * Les masters font ~1,2 Mo. Servir l'un d'eux pour afficher une vignette de
     * 40 px, sur le réseau d'un sous-sol, est exactement ce que les dérivés
     * existent pour empêcher. Le plafond est large : il attrape une régression
     * de pipeline, pas un kilo-octet de plus.
     */
    for (const etat of ETATS_MASCOTTE) {
      for (const taille of TAILLES_MASCOTTE) {
        const ko = statSync(local(urlMascotte(etat, taille))).size / 1024;
        expect(ko, `${etat}/${taille} pèse ${Math.round(ko)} Ko`).toBeLessThan(60);
      }
    }
  });

  it("et les treize états en taille compacte tiennent sous 150 Ko au total", () => {
    // Le pire cas imaginable : tout le jeu chargé d'un coup. Il doit rester
    // du même ordre qu'une seule photo.
    const total = ETATS_MASCOTTE.reduce(
      (n, e) => n + statSync(local(urlMascotte(e, "compact"))).size,
      0,
    );
    expect(total / 1024).toBeLessThan(150);
  });

  it("le registre ne sert JAMAIS un master au runtime", () => {
    // `urlMascotte` est le seul chemin qu'un composant doit connaître.
    for (const etat of ETATS_MASCOTTE) {
      expect(urlMascotte(etat)).toMatch(/^\/coach-mascot\/w\/.+\.webp$/);
      expect(urlMascotte(etat)).not.toMatch(/\.png$/);
    }
  });

  it("et AUCUN master n'est publié : `public/` n'en contient plus un seul", () => {
    /*
     * LE TEST QUI TIENT LE GAIN.
     *
     * Les 13 masters ont vécu dans `public/coach-mascot/` : 15 Mo publiquement
     * téléchargeables, embarqués dans chaque déploiement, et jamais demandés
     * une seule fois puisque le runtime lit les dérivés. Rien dans le code ne
     * les y ramènerait — mais un simple `cp` au moment d'ajouter un état le
     * ferait, et personne ne s'en apercevrait avant la facture de bande
     * passante. Le dossier entier est donc inspecté, récursivement.
     */
    const pngPublies: string[] = [];
    const parcourir = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) parcourir(p);
        else if (/\.(png|jpg|jpeg|tiff?|psd)$/i.test(e.name)) {
          pngPublies.push(path.relative(PUBLIC, p));
        }
      }
    };
    parcourir(path.join(PUBLIC, "coach-mascot"));

    expect(pngPublies, "un master est revenu dans public/").toEqual([]);
  });

  it("le dossier servi tient sous 1,5 Mo", () => {
    // 15 Mo avant ce nettoyage. Le plafond attrape un master oublié — le plus
    // petit d'entre eux pèse déjà davantage que la marge laissée ici.
    let octets = 0;
    const parcourir = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) parcourir(p);
        else octets += statSync(p).size;
      }
    };
    parcourir(path.join(PUBLIC, "coach-mascot"));
    expect(octets / 1024 / 1024).toBeLessThan(1.5);
  });
});

describe("les dimensions sont connues d'avance", () => {
  it("chaque taille déclare sa largeur, pour réserver la place", () => {
    // Sans dimension déclarée, l'image pousse la mise en page à son arrivée.
    for (const taille of TAILLES_MASCOTTE) {
      expect(LARGEURS_MASCOTTE[taille]).toBeGreaterThan(0);
    }
    expect(LARGEURS_MASCOTTE.compact).toBeLessThan(LARGEURS_MASCOTTE.normal);
    expect(LARGEURS_MASCOTTE.normal).toBeLessThan(LARGEURS_MASCOTTE.hero);
  });
});

describe("ce que la mascotte dit aux lecteurs d'écran", () => {
  it("les états qui portent une nuance ont un texte alternatif", () => {
    /*
     * `attention`, `progres` et `intervention` ajoutent quelque chose au texte
     * voisin : une mise en garde, une félicitation, un « j'ai remarqué ». Les
     * autres illustrent un fait déjà écrit en toutes lettres — un lecteur
     * d'écran qui annonce « Coach en train de s'entraîner » à chaque série
     * n'aide personne.
     */
    for (const etat of ["attention", "progres", "intervention"] as const) {
      expect(ASSETS_MASCOTTE[etat].alt.length, `${etat} sans alt`).toBeGreaterThan(0);
    }
    for (const etat of ["training", "repos", "analyse", "technique"] as const) {
      expect(ASSETS_MASCOTTE[etat].alt, `${etat} devrait être décoratif`).toBe("");
    }
  });

  it("chaque état documente son sens", () => {
    // Le registre est la référence quand on hésite à employer un état.
    for (const etat of ETATS_MASCOTTE) {
      expect(ASSETS_MASCOTTE[etat].sens.length).toBeGreaterThan(20);
    }
  });
});

describe("beast reste dormant", () => {
  it("il est enregistré", () => {
    expect(ASSETS_MASCOTTE.beast.base).toBe("coach-beast");
    expect(existsSync(local(urlMascotte("beast")))).toBe(true);
  });

  it("et le code ne contient aucun déclencheur aléatoire", () => {
    /*
     * La forme exacte à empêcher : `Math.random() < 0.01`. Un easter egg qui
     * s'invite tout seul devient un défaut irreproductible — et la mascotte la
     * plus spectaculaire est la dernière qu'on veut voir apparaître par hasard
     * au milieu d'une série.
     */
    const racine = path.join(process.cwd(), "src");
    const suspects: string[] = [];

    /* Les commentaires sont retirés AVANT l'analyse : ce fichier-ci, comme le
       registre, écrit « Math.random() » en toutes lettres pour expliquer qu'il
       n'y en a pas. Un garde qui se déclenche sur sa propre documentation
       finirait désarmé au premier faux positif. */
    const sansCommentaires = (s: string) =>
      s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    const parcourir = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) parcourir(p);
        else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|ctest|itest)\./.test(e.name)) {
          const code = sansCommentaires(readFileSync(p, "utf8"));
          if (code.includes("beast") && /Math\.random/.test(code)) {
            suspects.push(path.relative(racine, p));
          }
        }
      }
    };
    parcourir(racine);
    expect(suspects, "un tirage aléatoire côtoie beast").toEqual([]);
  });
});
