import { describe, it, expect } from "vitest";
import {
  ecrireTempo, ficheRenseignee, lireTempo, messageDeRefus, PHASES_TEMPO,
  reglagesAAfficher, resumeDesReglages, secondesParRepetition, tempoEffectif,
  validerReglage, type DefinitionReglage,
} from "./execution";

/**
 * Le noyau de l'exécution : tempo, fiche, réglages.
 *
 * Une règle traverse tout ce fichier : ce qui n'est pas su reste inconnu. Un
 * tempo absent ne devient pas `3-1-1-0`, un cran hors plage n'est pas ramené
 * dans la plage, une fiche vide ne devient pas une fiche générique. Une valeur
 * inventée se tiendrait, et fausserait l'exécution avec l'autorité d'une
 * consigne.
 */

describe("le tempo, lu et écrit", () => {
  it("lit les quatre temps dans l'ordre de la convention", () => {
    expect(lireTempo("3-1-1-0")).toEqual({
      excentrique: 3, pauseEtire: 1, concentrique: 1, pauseContracte: 0,
    });
  });

  it("nomme ses quatre phases, pour que l'UI n'ait pas à les deviner", () => {
    expect(PHASES_TEMPO.map((p) => p.cle)).toEqual([
      "excentrique", "pause_etire", "concentrique", "pause_contracte",
    ]);
    expect(PHASES_TEMPO[0]!.explication).toMatch(/retient/);
  });

  it("refuse ce qui n'est pas un tempo, sans rien proposer à la place", () => {
    for (const mauvais of ["", "3-1-1", "3.1.1.0", "3-1-1-0-2", "X-1-1-0", "abc", "3 1 1 0"]) {
      expect(lireTempo(mauvais), mauvais).toBeNull();
    }
    expect(lireTempo(null)).toBeNull();
    expect(lireTempo(undefined)).toBeNull();
  });

  it("fait l'aller-retour sans perte", () => {
    expect(ecrireTempo(lireTempo("4-2-1-0")!)).toBe("4-2-1-0");
  });

  it("donne la durée d'une répétition", () => {
    expect(secondesParRepetition(lireTempo("3-1-1-0")!)).toBe(5);
  });
});

describe("la priorité entre les trois niveaux", () => {
  it("la séance l'emporte sur le programme, qui l'emporte sur l'exercice", () => {
    const r = tempoEffectif({ seance: "4-0-1-0", programme: "3-1-1-0", exercice: "2-0-2-0" });
    expect(r?.brut).toBe("4-0-1-0");
    expect(r?.origine).toBe("seance");
  });

  it("descend au programme quand la séance ne prescrit rien", () => {
    const r = tempoEffectif({ seance: null, programme: "3-1-1-0", exercice: "2-0-2-0" });
    expect(r?.brut).toBe("3-1-1-0");
    expect(r?.origine).toBe("programme");
  });

  it("descend à l'exercice quand ni l'un ni l'autre ne prescrit", () => {
    const r = tempoEffectif({ exercice: "2-0-2-0" });
    expect(r?.brut).toBe("2-0-2-0");
    expect(r?.origine).toBe("exercice");
  });

  it("N'INVENTE RIEN quand aucun niveau n'en porte", () => {
    // Le cas qui compte le plus. Un tempo universel appliqué d'office ferait
    // passer un remplissage automatique pour une prescription réfléchie, et
    // rien ne permettrait de les distinguer.
    expect(tempoEffectif({})).toBeNull();
    expect(tempoEffectif({ seance: null, programme: null, exercice: null })).toBeNull();
    expect(tempoEffectif({ seance: "", programme: "", exercice: "" })).toBeNull();
  });

  it("un tempo mal écrit ne masque pas un niveau valide en dessous", () => {
    // Une saisie fautive au niveau séance ne doit pas priver du tempo du
    // programme : elle est ignorée comme si elle était absente.
    const r = tempoEffectif({ seance: "n'importe quoi", programme: "3-1-1-0" });
    expect(r?.brut).toBe("3-1-1-0");
    expect(r?.origine).toBe("programme");
  });
});

describe("la fiche technique", () => {
  it("une fiche vide n'est pas une fiche", () => {
    expect(ficheRenseignee(null)).toBe(false);
    expect(ficheRenseignee(undefined)).toBe(false);
    expect(ficheRenseignee({})).toBe(false);
    expect(ficheRenseignee({ pointsCles: [] })).toBe(false);
  });

  it("une seule section suffit à la rendre utile", () => {
    expect(ficheRenseignee({ amplitude: "Jusqu'à l'étirement complet" })).toBe(true);
    expect(ficheRenseignee({ pointsCles: ["Dos plaqué"] })).toBe(true);
  });
});

// ---------------------------------------------------------------------------

const SIEGE: DefinitionReglage = {
  cle: "siege", libelle: "Siège", type: "cran", min: 1, max: 10, ordre: 1,
};
const BANC: DefinitionReglage = {
  cle: "inclinaison", libelle: "Banc", type: "degres", min: 0, max: 85, unite: "°", ordre: 2,
};
const POIGNEE: DefinitionReglage = {
  cle: "poignee", libelle: "Poignée", type: "choix",
  options: ["neutre", "pronation", "supination"], ordre: 3,
};
const LIBRE: DefinitionReglage = { cle: "divers", libelle: "Divers", type: "texte", ordre: 4 };

describe("la validation d'un réglage", () => {
  it("accepte une valeur dans la plage", () => {
    expect(validerReglage(SIEGE, "6")).toEqual({ valide: true, valeur: "6" });
  });

  it("REFUSE hors plage, sans ramener dans la plage", () => {
    // Le point central : pas de coercition silencieuse. Ramener 14 à 10
    // produirait un souvenir faux, que rien ne signalerait ensuite.
    const r = validerReglage(SIEGE, "14");
    expect(r.valide).toBe(false);
    expect(r.valeur).toBeUndefined();
    expect(r.refus).toEqual({ motif: "hors_plage", min: 1, max: 10 });
    expect(messageDeRefus(r.refus!, SIEGE)).toBe("Valeur possible entre 1 et 10.");
  });

  it("refuse aussi en dessous du minimum", () => {
    expect(validerReglage(SIEGE, "0").valide).toBe(false);
  });

  it("un cran est un entier", () => {
    expect(validerReglage(SIEGE, "6.5").valide).toBe(false);
    // Un angle, lui, se règle finement.
    expect(validerReglage(BANC, "30").valide).toBe(true);
  });

  it("accepte la virgule décimale, comme un clavier français la produit", () => {
    expect(validerReglage(BANC, "37,5")).toEqual({ valide: true, valeur: "37.5" });
  });

  it("refuse ce qui n'est pas un nombre", () => {
    expect(validerReglage(SIEGE, "six").refus).toEqual({ motif: "pas_un_nombre" });
  });

  it("borne un choix à ses options", () => {
    expect(validerReglage(POIGNEE, "neutre").valide).toBe(true);
    const r = validerReglage(POIGNEE, "marteau");
    expect(r.valide).toBe(false);
    expect(messageDeRefus(r.refus!)).toMatch(/neutre, pronation, supination/);
  });

  it("laisse passer le mode libre, sans le préférer", () => {
    expect(validerReglage(LIBRE, "cale sous le pied droit").valide).toBe(true);
  });

  it("refuse une clé que la machine ne décrit pas", () => {
    // Sans définition, on ne saurait ni afficher la valeur, ni la vérifier,
    // ni dire à quoi elle correspond sur l'appareil.
    const r = validerReglage(undefined, "6");
    expect(r.refus).toEqual({ motif: "cle_inconnue" });
  });

  it("refuse le vide plutôt que d'enregistrer une chaîne creuse", () => {
    expect(validerReglage(SIEGE, "   ").refus).toEqual({ motif: "vide" });
  });
});

describe("ce que l'écran montre", () => {
  it("montre tous les réglages de la machine, garnis de ce qu'on a retenu", () => {
    const r = reglagesAAfficher([BANC, SIEGE], [{ cle: "siege", valeur: "6" }]);
    // Triés par ordre d'affichage, pas par ordre d'arrivée.
    expect(r.map((x) => x.cle)).toEqual(["siege", "inclinaison"]);
    expect(r[0]!.valeur).toBe("6");
    // Le réglage non renseigné reste visible : c'est ainsi qu'on sait qu'il
    // existe. Mais sa valeur est nulle, jamais un nombre plausible.
    expect(r[1]!.valeur).toBeNull();
  });

  it("ignore une valeur dont la clé a disparu de la machine", () => {
    // La définition est la source de vérité sur ce qui existe physiquement.
    const r = reglagesAAfficher([SIEGE], [{ cle: "rouleau", valeur: "3" }]);
    expect(r).toHaveLength(1);
    expect(r[0]!.cle).toBe("siege");
  });

  it("résume seulement ce qui est renseigné", () => {
    const r = reglagesAAfficher([SIEGE, BANC], [{ cle: "siege", valeur: "6" }]);
    expect(resumeDesReglages(r)).toBe("Siège 6");
  });

  it("ne résume rien quand rien n'est su", () => {
    const r = reglagesAAfficher([SIEGE, BANC], []);
    expect(resumeDesReglages(r)).toBeNull();
  });

  it("abrège au-delà de trois, pour tenir sur une ligne de carte", () => {
    const defs = [1, 2, 3, 4, 5].map((n): DefinitionReglage => ({
      cle: `r${n}`, libelle: `R${n}`, type: "cran", min: 1, max: 9, ordre: n,
    }));
    const valeurs = defs.map((d) => ({ cle: d.cle, valeur: "2" }));
    expect(resumeDesReglages(reglagesAAfficher(defs, valeurs))).toBe("R1 2 · R2 2 · R3 2 · +2");
  });

  it("une machine sans réglage ne produit aucune section", () => {
    // Pompes, dead bug, gainage : rien à régler, donc rien à afficher.
    expect(reglagesAAfficher([], [])).toEqual([]);
    expect(resumeDesReglages([])).toBeNull();
  });

  it("porte l'unité, quand la machine en a une", () => {
    const r = reglagesAAfficher([BANC], [{ cle: "inclinaison", valeur: "30" }]);
    expect(resumeDesReglages(r)).toBe("Banc 30°");
  });
});
