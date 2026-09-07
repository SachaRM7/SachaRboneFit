import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * La fiche ne doit plus pouvoir redevenir invisible.
 *
 * Elle l'a été deux ans : la colonne existait, le service la lisait, l'écran
 * savait la rendre — et le catalogue n'en portait aucune. `ficheRenseignee`
 * répondait `false` partout, la section ne s'affichait jamais, et rien dans le
 * dépôt ne le disait.
 *
 * Ce fichier lit le texte et refuse les formes qui reproduiraient ce silence :
 * un contenu qu'aucun chemin n'écrit, une section qu'aucun ordre ne rend
 * atteignable, un repli de tempo qui cesserait de s'annoncer comme tel.
 *
 * Troisième du genre, après `reglages-ont-un-chemin` et `douleur-a-un-chemin`.
 */

const RACINE = path.resolve(import.meta.dirname, "..");

const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const lire = (f: string) => sansCommentaires(readFileSync(path.join(RACINE, f), "utf8"));

const FICHE = "components/session/FicheExecution.tsx";

describe("le contenu des fiches a un chemin jusqu'à la base", () => {
  it("le seed écrit la fiche et le tempo à la création", () => {
    // Sans cette ligne, une base neuve repart sans aucune fiche — et le lot
    // entier redevient invisible au premier `reset-db`.
    const seed = lire("scripts/seed.ts");
    expect(seed).toMatch(/FICHES_TECHNIQUES/);
    expect(seed).toMatch(/TEMPOS_PAR_DEFAUT/);
    expect(seed).toMatch(/fiche_technique/);
    expect(seed).toMatch(/tempo_par_defaut/);
  });

  it("un script complète une base déjà en service", () => {
    // Le seed ne suffit pas : une base en service ne se re-sème pas.
    const sync = lire("scripts/synchroniser-fiches.ts");
    expect(sync).toMatch(/export async function synchroniserFiches/);
    expect(sync).toMatch(/db\.update\(exercises\)/);
  });

  it("et ce script ne crée JAMAIS d'exercice", () => {
    /*
     * La forme exacte du défaut à empêcher : un `insert` de rattrapage. Il
     * produirait un doublon sous le même slug, et l'historique resterait
     * accroché à l'ancien — une progression coupée en deux, sans message.
     */
    const sync = lire("scripts/synchroniser-fiches.ts");
    expect(sync, "le script insère, il ne devrait que mettre à jour")
      .not.toMatch(/db\.insert\(/);
  });

  it("la simulation ne modifie rien", () => {
    /*
     * Le mode par défaut. `--ecrire` est explicite, et c'est ce qui permet de
     * lancer le script contre une base sensible pour LIRE ce qu'il ferait.
     *
     * Vérifié sur le texte parce que c'est un invariant de sûreté : l'écriture
     * doit rester gardée par le drapeau, pas décidée ailleurs.
     */
    const sync = lire("scripts/synchroniser-fiches.ts");
    expect(sync).toMatch(/const ecrire = process\.argv\.includes\("--ecrire"\)/);
    expect(sync).toMatch(/if \(ecrire && Object\.keys\(maj\)\.length > 0\)/);
    // Aucune autre écriture : celle du bloc gardé est la seule du fichier.
    expect([...sync.matchAll(/db\.update\(/g)]).toHaveLength(1);
  });

  it("il ne touche que les deux colonnes qui le regardent", () => {
    const sync = lire("scripts/synchroniser-fiches.ts");
    const ecriture = sync.slice(sync.indexOf("db.update(exercises)"));
    for (const colonne of ["nom", "pilier", "musclesPrincipaux", "equipement", "categorieRole"]) {
      expect(ecriture, `${colonne} ne doit pas être réécrit`).not.toMatch(
        new RegExp(`\\b${colonne}\\s*:`),
      );
    }
  });
});

describe("le rollout reste idempotent quand la fiche gagne un champ", () => {
  it("la comparaison ne dépend pas de l'ordre des clés", () => {
    /*
     * PostgreSQL range les clés d'un `jsonb` dans son propre ordre. Une
     * comparaison naïve verrait toutes les fiches comme différentes, et le
     * script réécrirait tout à chaque passage — y compris le jour où on ajoute
     * une rubrique, où plus personne ne saurait distinguer un vrai changement.
     */
    const sync = lire("scripts/synchroniser-fiches.ts");
    expect(sync).toMatch(/function memeContenu/);
    expect(sync).toMatch(/\.sort\(/);
    expect(sync, "comparaison par chaîne brute : non idempotente")
      .not.toMatch(/JSON\.stringify\(ligne\.ficheTechnique\) ===/);
  });

  it("il compare la fiche ENTIÈRE, sans énumérer ses rubriques", () => {
    // Une liste de champs à comparer se périmerait au premier ajout — et
    // `libellesPhasesTempo` en est justement un.
    const sync = lire("scripts/synchroniser-fiches.ts");
    expect(sync).toMatch(/memeContenu\(ligne\.ficheTechnique, fiche\)/);
    for (const champ of ["installation", "sensation", "libellesPhasesTempo"]) {
      expect(sync, `${champ} ne doit pas être comparé à la main`).not.toContain(champ);
    }
  });
});

describe("la fiche est atteignable à l'écran", () => {
  it("la section « Comment faire » existe et rend les rubriques", () => {
    const source = lire(FICHE);
    expect(source).toMatch(/Comment faire/);
    for (const rubrique of [
      "f.installation", "f.positionDepart", "f.execution", "f.amplitude",
      "f.respiration", "f.sensation", "f.pointsCles", "f.erreursFrequentes", "f.securite",
    ]) {
      expect(source, `${rubrique} n'est pas rendue`).toContain(rubrique);
    }
  });

  it("l'ordre met la technique avant le tempo et la note", () => {
    /*
     * L'ordre est une décision produit, pas une mise en page. Il commençait par
     * le tempo et finissait par la technique : il fallait faire défiler trois
     * écrans pour savoir comment exécuter le mouvement. Devant une machine, la
     * première question est « qu'est-ce que je travaille », pas « quel tempo ».
     */
    const source = lire(FICHE);
    const rang = (ancre: string) => {
      const i = source.indexOf(ancre);
      expect(i, `${ancre} introuvable`).toBeGreaterThan(-1);
      return i;
    };
    expect(rang("Muscles travaillés")).toBeLessThan(rang("Réglages de cet appareil"));
    expect(rang("Réglages de cet appareil")).toBeLessThan(rang("Comment faire"));
    expect(rang("Comment faire")).toBeLessThan(rang(">Tempo<"));
    expect(rang(">Tempo<")).toBeLessThan(rang("Ma note"));
  });

  it("une fiche absente n'affiche aucun contenu creux", () => {
    /*
     * Cent quatre exercices n'en ont pas encore. Un titre « Comment faire »
     * suivi de rien apprendrait seulement qu'il manque quelque chose.
     *
     * Le garde porte sur le BLOC technique seulement : « Non renseigné » est
     * légitime ailleurs, dans le champ d'un réglage décrit mais pas encore
     * garni — là, le vide est actionnable, et c'est justement l'endroit où on
     * le comble.
     */
    const source = lire(FICHE);
    expect(source).toMatch(/\{f && \(/);
    const technique = source.slice(
      source.indexOf("{f && ("),
      source.indexOf("{contexte.tempo && ("),
    );
    expect(technique).not.toMatch(/non renseigné/i);
    expect(technique).not.toMatch(/pas encore de fiche|à compléter/i);
  });

  it("les sections longues restent repliables", () => {
    // La priorité est de trouver la réponse en quelques secondes, pas de tout
    // montrer : la technique et le mannequin s'ouvrent à la demande.
    const source = lire(FICHE);
    expect(source).toMatch(/setTechniqueOuverte/);
    expect(source).toMatch(/setMusclesOuverts/);
    expect(source).toMatch(/aria-expanded=\{techniqueOuverte\}/);
  });

  it("et le mannequin de la PR #13 reste monté", () => {
    // La fiche s'ajoute au mannequin, elle ne le remplace pas.
    expect(lire(FICHE)).toMatch(/<Mannequin\s/);
  });
});

describe("le repli de tempo continue de s'annoncer comme un repli", () => {
  it("l'écran distingue une prescription d'un repère général", () => {
    /*
     * Toute la précaution de la PR #4 tient dans cette phrase. Un tempo
     * canonique présenté comme une consigne réfléchie serait pire que pas de
     * tempo du tout : personne ne pourrait distinguer ce qui a été décidé de ce
     * qui a été comblé.
     */
    const source = lire(FICHE);
    expect(source).toMatch(/origine === "defaut"/);
    expect(source).toMatch(/[Rr]epère général/);
  });

  it("et le catalogue n'a pas rempli les cent vingt tempos", () => {
    // Les remplir ferait disparaître la mention « repère général » partout, et
    // transformerait une convention assumée en fausse prescription.
    const fiches = lire("lib/referentiels/fiches-techniques.ts");
    const tempos = fiches.slice(fiches.indexOf("TEMPOS_PAR_DEFAUT"));
    const compte = [...tempos.matchAll(/"\d-\d-\d-\d"/g)].length;
    expect(compte).toBeGreaterThan(0);
    expect(compte, "trop de tempos : le repli n'a plus de sens").toBeLessThan(20);
  });
});

describe("technique et réglages restent deux portées distinctes", () => {
  it("la fiche ne lit jamais les réglages, et réciproquement", () => {
    /*
     * La frontière de la PR #12 : la fiche appartient au MOUVEMENT, les
     * réglages à l'APPAREIL. Conditionner l'une à l'autre les mélangerait — une
     * fiche qui ne s'afficherait qu'une fois un siège décrit, par exemple.
     */
    const source = lire(FICHE);
    const technique = source.slice(
      source.indexOf("{f && ("),
      source.indexOf("{contexte.tempo && ("),
    );
    expect(technique.length).toBeGreaterThan(0);
    expect(technique, "la technique dépend des réglages").not.toMatch(/contexte\.reglages/);
    expect(technique).not.toMatch(/peutDecrire/);
  });

  it("aucune fiche du catalogue ne contient de valeur de réglage", () => {
    // Le garde de contenu vit dans `fiches-techniques.test.ts` ; celui-ci
    // vérifie qu'il existe encore, parce que c'est lui qui tient la frontière.
    const test = readFileSync(
      path.join(RACINE, "lib/referentiels/fiches-techniques.test.ts"), "utf8",
    );
    expect(test).toMatch(/aucune valeur personnelle ne s'est glissée/);
  });
});
