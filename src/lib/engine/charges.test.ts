import { describe, it, expect } from "vitest";
import {
  CHARGE_INCONNUE, chargeAtteignable, chargesConnues, configurationDe,
  e1rmApplicable, libelleDeLaMesure, pasDeLaGrille, porteeDeLaMesure,
  prochaineCharge, proprietesFigeesModifiees, type ConfigurationCharge,
} from "./charges";

/**
 * Ce qu'un appareil permet réellement d'atteindre.
 *
 * Deux idées se vérifient ici. La première : une donnée qu'on n'a pas relevée
 * ne se remplace pas par une valeur plausible — elle empêche de proposer, et
 * c'est le comportement voulu. La seconde : il n'existe qu'une réponse à
 * « quelle charge ensuite ? », et l'ordre d'un tableau n'en fait pas partie.
 */

const config = (p: Partial<ConfigurationCharge> = {}): ConfigurationCharge => ({
  ...CHARGE_INCONNUE,
  ...p,
});

describe("l'ordre du tableau n'est pas une règle métier", () => {
  it("[5, 2.5] et [2.5, 5] donnent la même grille", () => {
    expect(pasDeLaGrille([5, 2.5])).toBe(2.5);
    expect(pasDeLaGrille([2.5, 5])).toBe(2.5);
  });

  it("le plus petit saut engendre la grille, quel que soit le rang du tableau", () => {
    // C'était la divergence : la double progression lisait le premier élément,
    // la calibration le plus petit. Sur `[5, 2.5]`, l'une ajoutait 5 kg quand
    // l'autre arrondissait à 2,5.
    const c = config({ incrementsPossibles: [5, 2.5] });
    expect(prochaineCharge(c, 60).valeur).toBe(62.5);
    expect(chargeAtteignable(c, 61).valeur).toBe(60);
  });
});

describe("inconnu reste inconnu", () => {
  it("sans incréments, rien n'est proposé", () => {
    const r = prochaineCharge(config(), 60);
    expect(r.statut).toBe("indeterminable");
    expect(r.valeur).toBeNull();
  });

  it("un tableau vide vaut inconnu, pas « par défaut »", () => {
    expect(chargesConnues(configurationDe({ incrementsPossibles: [] }))).toBe(false);
    expect(chargeAtteignable(configurationDe({ incrementsPossibles: [] }), 42).valeur).toBeNull();
  });

  it("un appareil décrit redevient prescriptible", () => {
    expect(chargesConnues(config({ incrementsPossibles: [5] }))).toBe(true);
    expect(chargesConnues(config({ paliersCharges: [10, 20] }))).toBe(true);
  });
});

describe("les bornes de l'appareil", () => {
  it("ne propose jamais sous le premier cran", () => {
    const pile = config({ incrementsPossibles: [5], chargeMinimale: 5, chargeMax: 100 });
    const r = chargeAtteignable(pile, 2);
    expect(r.valeur).toBe(5);
    expect(r.butee).toBe("minimum");
  });

  it("ne propose jamais au-dessus du dernier", () => {
    const pile = config({ incrementsPossibles: [5], chargeMinimale: 5, chargeMax: 100 });
    const r = prochaineCharge(pile, 100);
    expect(r.statut).toBe("butee");
    expect(r.butee).toBe("maximum");
    expect(r.valeur).toBe(100);
  });

  it("ancre la grille sur le plancher, pas sur zéro", () => {
    // Une pile qui commence à 7 et monte par 5 donne 7, 12, 17 — pas 5, 10, 15.
    const pile = config({ incrementsPossibles: [5], chargeMinimale: 7 });
    expect(chargeAtteignable(pile, 13).valeur).toBe(12);
  });

  it("s'arrête au dernier cran réellement atteignable, pas au plafond nominal", () => {
    const pile = config({ incrementsPossibles: [5], chargeMinimale: 5, chargeMax: 98 });
    expect(chargeAtteignable(pile, 120).valeur).toBe(95);
  });
});

describe("une collection discrète de charges", () => {
  const barres = config({ paliersCharges: [10, 15, 20, 25, 30] });

  it("propose la barre suivante, pas une charge intermédiaire", () => {
    const r = prochaineCharge(barres, 20);
    expect(r.valeur).toBe(25);
    expect(r.delta).toBe(5);
  });

  it("expose l'écart relatif sans l'interdire", () => {
    // De 10 à 15 : +50 %. Le module le dit et ne tranche pas — la règle
    // métier, si elle doit exister, appartient à l'appelant.
    const r = prochaineCharge(barres, 10);
    expect(r.valeur).toBe(15);
    expect(r.deltaRelatif).toBe(0.5);
    expect(r.statut).toBe("atteignable");
  });

  it("suit une collection irrégulière telle qu'elle est", () => {
    // Une pile en livres converties : 2,3 / 4,5 / 6,8. Une grille d'incréments
    // aurait produit 2,3 / 4,6 / 6,9 — trois charges qui n'existent pas.
    const pile = config({ paliersCharges: [2.3, 4.5, 6.8, 9, 11.3] });
    expect(prochaineCharge(pile, 4.5).valeur).toBe(6.8);
    expect(chargeAtteignable(pile, 5).valeur).toBe(4.5);
  });

  it("bute sur le dernier élément de la collection", () => {
    const r = prochaineCharge(barres, 30);
    expect(r.statut).toBe("butee");
    expect(r.valeur).toBe(30);
  });

  it("prime sur les incréments quand les deux sont renseignés", () => {
    const mixte = config({ paliersCharges: [10, 15, 20], incrementsPossibles: [1] });
    expect(prochaineCharge(mixte, 10).valeur).toBe(15);
  });
});

describe("l'assistance progresse vers le bas", () => {
  const assist = config({
    natureCharge: "assistance",
    incrementsPossibles: [5],
    chargeMinimale: 0,
    chargeMax: 60,
  });

  it("réussir la fourchette demande moins d'aide", () => {
    const r = prochaineCharge(assist, 30);
    expect(r.valeur).toBe(25);
    expect(r.delta).toBe(-5);
  });

  it("s'arrête quand il n'y a plus rien à retirer", () => {
    const r = prochaineCharge(assist, 0);
    expect(r.statut).toBe("butee");
    expect(r.butee).toBe("minimum");
    expect(r.valeur).toBe(0);
  });

  it("ne descend pas sous zéro faute de plancher déclaré", () => {
    const sansPlancher = config({ natureCharge: "assistance", incrementsPossibles: [5] });
    expect(prochaineCharge(sansPlancher, 3).valeur).toBe(0);
  });

  it("suit une collection à l'envers", () => {
    const c = config({ natureCharge: "assistance", paliersCharges: [0, 10, 20, 30] });
    expect(prochaineCharge(c, 20).valeur).toBe(10);
  });

  it("n'entre pas dans un maximum estimé", () => {
    expect(e1rmApplicable("assistance")).toBe(false);
    expect(e1rmApplicable("resistance")).toBe(true);
  });
});

describe("ce que le nombre mesure", () => {
  it("est une masse sur une charge libre", () => {
    const p = porteeDeLaMesure({ natureCharge: "resistance", conventionCharge: "poids_total" });
    expect(p).toBe("kilos");
    expect(libelleDeLaMesure(p)).toBe("1RM estimé");
  });

  it("est un indice local sur une pile ou un chargement à disques", () => {
    // Deux marques affichant 40 ne déplacent pas la même chose. Le nombre
    // reste lisible face à lui-même ; il ne traverse pas les appareils.
    for (const convention of ["pile_affichee", "disques_ajoutes"]) {
      const p = porteeDeLaMesure({ natureCharge: "resistance", conventionCharge: convention });
      expect(p).toBe("indice_local");
      expect(libelleDeLaMesure(p)).not.toMatch(/1RM/);
    }
  });

  it("est une assistance quand la charge aide", () => {
    const p = porteeDeLaMesure({ natureCharge: "assistance", conventionCharge: "pile_affichee" });
    expect(libelleDeLaMesure(p)).toBe("Assistance");
  });
});

describe("l'histoire déjà écrite ne se réinterprète pas", () => {
  const avant = {
    conventionCharge: "pile_affichee",
    natureCharge: "resistance",
    paliersCharges: null,
    chargeMinimale: 5,
  };

  it("repère un changement de convention", () => {
    expect(proprietesFigeesModifiees(avant, { conventionCharge: "poids_total" }))
      .toEqual(["conventionCharge"]);
  });

  it("repère un changement de sens de la charge", () => {
    expect(proprietesFigeesModifiees(avant, { natureCharge: "assistance" }))
      .toEqual(["natureCharge"]);
  });

  it("laisse passer ce qui ne change pas le sens des séries", () => {
    // Corriger des incréments mal relevés reste possible : ils décrivent
    // l'appareil, ils ne réinterprètent aucun nombre déjà enregistré.
    expect(proprietesFigeesModifiees(avant, { conventionCharge: "pile_affichee" })).toEqual([]);
    expect(proprietesFigeesModifiees(avant, {})).toEqual([]);
  });

  it("compare les paliers sur leur contenu, pas sur leur ordre", () => {
    const c = { ...avant, paliersCharges: [10, 20, 30] };
    expect(proprietesFigeesModifiees(c, { paliersCharges: [30, 10, 20] })).toEqual([]);
    expect(proprietesFigeesModifiees(c, { paliersCharges: [10, 20] })).toEqual(["paliersCharges"]);
  });
});

describe("la résistance intrinsèque n'entre dans aucun calcul", () => {
  it("n'apparaît pas dans la configuration de charge", () => {
    // Le chariot d'une presse n'est pas une masse sommable : inclinaison, bras
    // de levier et cames font varier la résistance ressentie, et la convention
    // constructeur n'est pas publiée. L'ajouter produirait un nombre plus
    // précis en apparence et moins exact en réalité.
    const c = configurationDe({ incrementsPossibles: [5], poidsNonCompte: 30.4 } as never);
    expect(Object.values(c)).not.toContain(30.4);
    expect(chargeAtteignable(c, 40).valeur).toBe(40);
  });
});
