import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * La récupération est visible, et il n'en existe toujours qu'un seul calcul.
 *
 * Quatrième garde structurel du dépôt, après `reglages-ont-un-chemin`,
 * `douleur-a-un-chemin` et `fiche-a-un-chemin`. Ceux-là refusaient une
 * infrastructure sans chemin applicatif. Celui-ci refuse l'inverse — un chemin
 * applicatif qui referait le calcul pour son compte.
 *
 * LE DÉFAUT QU'IL EMPÊCHE
 *
 * `scoreRecuperation` décide déjà : le validateur refuse une séance sur
 * `recuperation_insuffisante`. Rendre ce verdict visible demandait de le LIRE,
 * pas de le reproduire. Un seuil réécrit dans un composant aurait donné deux
 * règles — celle qui refuse et celle qui affiche — et le premier ajustement de
 * l'une aurait laissé l'autre en place, silencieusement.
 *
 * Ce fichier lit le texte du dépôt. Il ne remplace pas les tests de
 * comportement (`recuperation-visible.itest.ts` compare service et moteur sur
 * de vraies données) : il empêche la FORME qui les rendrait faux.
 */

const RACINE = path.resolve(import.meta.dirname, "..");

const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const lire = (f: string) => sansCommentaires(readFileSync(path.join(RACINE, f), "utf8"));

const SERVICE = "services/recuperation.ts";
const CARTE = "components/dashboard/CarteRecuperation.tsx";
const COMPLEMENT = "components/dashboard/ComplementTableauDeBord.tsx";
const ASSEMBLAGE = "services/tableau-de-bord.ts";
const PRECALC = "app/api/cron/precalc-session/route.ts";
const WEEKLY = "app/api/cron/weekly-debrief/route.ts";

/** Tous les fichiers d'un dossier, récursivement. */
function fichiers(relatif: string, suffixes: string[]): string[] {
  const dossier = path.join(RACINE, relatif);
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const chemin = path.join(relatif, e.name);
    if (e.isDirectory()) return fichiers(chemin, suffixes);
    return suffixes.some((s) => e.name.endsWith(s)) ? [chemin] : [];
  });
}

describe("le calcul reste au moteur", () => {
  it("le service réutilise les fonctions du moteur, il n'en écrit pas d'autres", () => {
    const source = lire(SERVICE);
    expect(source).toMatch(/from "@\/lib\/engine\/recuperation"/);
    expect(source).toMatch(/scoreRecuperation\(/);
    expect(source).toMatch(/seuilDePhase\(/);
    // Et les lectures viennent des mêmes outils que le validateur.
    expect(source).toMatch(/activiteMusculaire\(/);
    expect(source).toMatch(/etatMusclesDepuis\(/);
    expect(source).toMatch(/courbaturesDuJour\(/);
  });

  it("il ne redéfinit aucun seuil ni aucune courbe", () => {
    /*
     * Les noms exacts des constantes du moteur. Les voir réapparaître ici
     * voudrait dire qu'on a recopié la règle plutôt que de l'appeler.
     */
    const source = lire(SERVICE);
    for (const constante of [
      "RECUPERATION_PAR_JOUR", "SEUILS_PAR_PHASE", "SERIES_SANS_DETTE",
      "COUT_PAR_SERIE_EXCEDENTAIRE", "RIR_COUTEUX", "COUT_PAR_POINT_COURBATURE",
    ]) {
      expect(source, `${constante} a été recopiée dans le service`).not.toContain(constante);
    }
  });

  it("la seule comparaison de sévérité passe par la constante partagée", () => {
    // Un `>= 7` écrit à la main est précisément la divergence que le lot des
    // contraintes avait éliminée. On ne la réintroduit pas ici.
    const source = lire(SERVICE);
    expect(source).toMatch(/SEVERITE\.ecartement/);
    expect(source, "seuil de sévérité écrit en dur").not.toMatch(/severite\s*>=\s*\d/);
  });
});

describe("aucun composant React ne recalcule la récupération", () => {
  it("la carte ne fait qu'afficher ce qu'on lui donne", () => {
    const source = lire(CARTE);
    expect(source, "la carte importe le moteur").not.toMatch(/@\/lib\/engine/);
    expect(source, "la carte appelle le moteur").not.toMatch(/scoreRecuperation|seuilDePhase/);
    // Ni base de données, ni requête : elle reçoit un état déjà assemblé.
    expect(source).not.toMatch(/@\/db\//);
    expect(source).toMatch(/etat \}: \{ etat: RecuperationMusculaire \}/);
  });

  it("elle ne compare aucun score à un nombre écrit à la main", () => {
    /*
     * La forme exacte à empêcher : `score > 65`. Elle marcherait, un temps —
     * jusqu'au jour où `SEUILS_PAR_PHASE` change et où l'écran continue
     * d'annoncer « prêt » un muscle que le validateur refuse.
     */
    const source = lire(CARTE);
    expect(source).not.toMatch(/score\s*[<>]=?\s*\d/);
    expect(source).not.toMatch(/joursDepuis\s*[<>]=?\s*\d/);
  });

  it("et aucun autre composant n'importe le moteur de récupération", () => {
    const fautifs = fichiers("components", [".tsx", ".ts"]).filter((f) =>
      /@\/lib\/engine\/recuperation/.test(lire(f)),
    );
    expect(fautifs, `${fautifs.join(", ")} recalcule(nt) la récupération`).toEqual([]);
  });

  it("les libellés d'état viennent du service, pas d'un second dictionnaire", () => {
    const source = lire(CARTE);
    expect(source).toMatch(/LIBELLES_ETAT_RECUPERATION/);
    expect(source).toMatch(/resumeRecuperation/);
  });
});

describe("la carte est atteignable, et au bon endroit", () => {
  it("elle est montée dans le complément du tableau de bord", () => {
    const source = lire(COMPLEMENT);
    expect(source).toMatch(/<CarteRecuperation\s/);
    expect(source).toMatch(/data\.recuperation/);
  });

  it("et l'état est calculé dans le complément, pas dans l'essentiel", () => {
    /*
     * Quatre lectures de plus sur le chemin critique annuleraient le travail
     * qui l'avait ramené de treize allers-retours à deux — pour une carte qui
     * ne change rien à ce que l'athlète fait dans la minute.
     */
    const source = lire(ASSEMBLAGE);
    const debutEssentiel = source.indexOf("export async function essentielTableauDeBord");
    const debutComplement = source.indexOf("export async function complementTableauDeBord");
    expect(debutEssentiel).toBeGreaterThan(-1);
    expect(debutComplement).toBeGreaterThan(debutEssentiel);

    const essentiel = source.slice(debutEssentiel, debutComplement);
    expect(essentiel, "la récupération a migré vers le chemin critique")
      .not.toMatch(/recuperationMusculaire/);
    expect(source.slice(debutComplement)).toMatch(/recuperationMusculaire\(userId\)/);
  });
});

describe("les crons écrivent ce que le modèle a produit, ou rien", () => {
  it("le texte fixe a disparu des deux routes", () => {
    for (const route of [PRECALC, WEEKLY]) {
      const source = lire(route);
      expect(source, `${route} écrit encore un gabarit`)
        .not.toMatch(/Configurez l'intégration LLM/);
      expect(source).not.toMatch(/placeholder/i);
    }
  });

  it("elles passent toutes deux par le service de rédaction commun", () => {
    expect(lire(PRECALC)).toMatch(/from "@\/services\/briefs-llm"/);
    expect(lire(WEEKLY)).toMatch(/from "@\/services\/briefs-llm"/);
    // Et aucune ne parle au fournisseur directement : la consigne commune —
    // « n'invente jamais un chiffre » — serait alors contournable route par route.
    expect(lire(PRECALC)).not.toMatch(/@\/lib\/coach\/llm-client/);
    expect(lire(WEEKLY)).not.toMatch(/@\/lib\/coach\/llm-client/);
  });

  it("la rotation du précalcul est celle du tableau de bord", () => {
    const source = lire(PRECALC);
    expect(source).toMatch(/prochaineSeance\(userId\)/);
    // La forme exacte du défaut corrigé : une lettre décidée sur place.
    expect(source, "une seconde règle de rotation est réapparue")
      .not.toMatch(/getNextSeanceLetter|return "A"/);
  });

  it("un secret absent refuse la requête au lieu de l'accepter", () => {
    /*
     * `CRON_SECRET || ""` comparé à `Bearer ` : sans le garde sur la variable,
     * une variable d'environnement oubliée en production ouvrirait la route à
     * qui enverrait un en-tête vide.
     */
    for (const route of [PRECALC, WEEKLY]) {
      expect(lire(route), `${route} accepte un secret non configuré`)
        .toMatch(/!CRON_SECRET/);
    }
  });

  it("le rapport d'erreur ne transporte pas le contexte envoyé au modèle", () => {
    /*
     * Le contexte contient l'entraînement d'une personne, ses zones ménagées et
     * son état de récupération. Un `console.error(e)` sur l'objet complet le
     * ferait atterrir dans les journaux d'une plateforme tierce.
     */
    for (const route of [PRECALC, WEEKLY]) {
      const source = lire(route);
      expect(source).toMatch(/erreurs\.push\(`\$\{userId\}: /);
      expect(source, `${route} journalise le contexte`)
        .not.toMatch(/console\.(error|log)\([^)]*contexte/);
      expect(source).not.toMatch(/JSON\.stringify\(contexte\)/);
    }
  });
});

describe("le feu biologique et la récupération musculaire restent distincts", () => {
  it("le service de récupération ne lit pas le feu du jour", () => {
    /*
     * Deux notions voisines et différentes : le feu décrit l'état GÉNÉRAL
     * déclaré le matin, la récupération l'état d'un MUSCLE après une
     * exposition. Les mêler ferait passer une mauvaise nuit pour une dette
     * musculaire — et l'inverse.
     */
    const source = lire(SERVICE);
    expect(source).not.toMatch(/feuBiologique/);
  });

  it("et la carte ne les affiche pas comme une seule chose", () => {
    expect(lire(CARTE)).not.toMatch(/feuBiologique|feuJour/);
  });
});
