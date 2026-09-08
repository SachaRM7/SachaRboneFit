import { describe, it, expect } from "vitest";
import { voisineCharge, chargeAtteignable, configurationDe, CHARGE_INCONNUE } from "./charges";

/**
 * Le pas du stepper est celui du MATÉRIEL, jamais un nombre choisi par l'écran.
 *
 * LE DÉFAUT QUE CE FICHIER EMPÊCHE
 *
 * Un `valeur + 2.5` écrit dans le composant marcherait sur la plupart des
 * appareils, et mentirait sur les autres : un râtelier d'haltères qui va de 2
 * en 2, une pile dont les crans sont irréguliers, une machine dont le premier
 * cran est à 5. L'écran proposerait alors des charges que l'appareil ne produit
 * pas — et l'athlète les chercherait devant la machine.
 *
 * `voisineCharge` est la sœur de `prochaineCharge`, et la distinction compte :
 * l'une répond « quelle charge quand on progresse » (qui DESCEND sur une
 * assistance), l'autre « qu'y a-t-il un cran plus haut ». Un `+` qui allège
 * l'exercice serait le pire des deux mondes.
 */

const pile = configurationDe({
  natureCharge: "resistance",
  incrementsPossibles: [5],
  chargeMinimale: 5,
  chargeMax: 100,
});

const halteres = configurationDe({
  natureCharge: "resistance",
  paliersCharges: [2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 30],
});

/** Une échelle volontairement irrégulière : c'est le cas qui démasque tout. */
const irreguliere = configurationDe({
  natureCharge: "resistance",
  paliersCharges: [5, 10, 17.5, 25],
});

const assistance = configurationDe({
  natureCharge: "assistance",
  incrementsPossibles: [4],
  chargeMinimale: 0,
  chargeMax: 64,
});

describe("une grille régulière", () => {
  it("monte et descend d'un cran", () => {
    expect(voisineCharge(pile, 40, "haut").valeur).toBe(45);
    expect(voisineCharge(pile, 40, "bas").valeur).toBe(35);
  });

  it("reste ancrée sur le premier cran, même en partant d'une valeur bâtarde", () => {
    /*
     * Une pile qui commence à 5 et monte par 5 donne 5, 10, 15 — jamais 7,5
     * parce qu'on serait parti de 2,5. Sans l'ancrage, le stepper propagerait
     * l'erreur au lieu de la corriger.
     */
    expect(voisineCharge(pile, 42, "haut").valeur).toBe(45);
    expect(voisineCharge(pile, 42, "bas").valeur).toBe(40);
  });

  it("bute sur le dernier cran plutôt que d'inventer au-delà", () => {
    const haut = voisineCharge(pile, 100, "haut");
    expect(haut.statut).toBe("butee");
    expect(haut.butee).toBe("maximum");
    expect(haut.valeur).toBe(100);
  });

  it("et sur le premier en descendant", () => {
    const bas = voisineCharge(pile, 5, "bas");
    expect(bas.statut).toBe("butee");
    expect(bas.butee).toBe("minimum");
    expect(bas.valeur).toBe(5);
  });
});

describe("une collection discrète", () => {
  it("suit les haltères réellement présents", () => {
    // 16 → 20 : le râtelier saute 18, et le stepper doit sauter avec lui.
    expect(voisineCharge(halteres, 16, "haut").valeur).toBe(20);
    expect(voisineCharge(halteres, 20, "bas").valeur).toBe(16);
  });

  it("une échelle non uniforme le reste", () => {
    /*
     * Le cas nommé dans le cahier des charges : [5, 10, 17.5, 25] ne doit pas
     * devenir 5, 10, 15, 20, 25. Un stepper à pas constant l'aurait fait, et
     * l'athlète aurait cherché un cran à 15 qui n'existe pas.
     */
    expect(voisineCharge(irreguliere, 10, "haut").valeur).toBe(17.5);
    expect(voisineCharge(irreguliere, 17.5, "haut").valeur).toBe(25);
    expect(voisineCharge(irreguliere, 17.5, "bas").valeur).toBe(10);
  });

  it("bute aux deux extrémités de la collection", () => {
    expect(voisineCharge(irreguliere, 25, "haut").butee).toBe("maximum");
    expect(voisineCharge(irreguliere, 5, "bas").butee).toBe("minimum");
  });
});

describe("une assistance monte et descend comme les autres", () => {
  it("« haut » ajoute de l'aide, « bas » en retire", () => {
    /*
     * Physiquement, `+` augmente le nombre affiché. Que cela RENDE l'exercice
     * plus facile est une question de lecture, pas de direction — et c'est
     * `prochaineCharge` qui porte cette sémantique, pas le stepper.
     */
    expect(voisineCharge(assistance, 32, "haut").valeur).toBe(36);
    expect(voisineCharge(assistance, 32, "bas").valeur).toBe(28);
  });

  it("et ne descend jamais sous zéro : il n'y a plus rien à retirer", () => {
    const bas = voisineCharge(assistance, 0, "bas");
    expect(bas.statut).toBe("butee");
    expect(bas.valeur).toBe(0);
  });
});

describe("un appareil non mesuré ne propose rien", () => {
  it("aucune valeur inventée quand les crans sont inconnus", () => {
    /*
     * « Indéterminable » est une réponse, et la bonne : proposer 2,5 par défaut
     * reviendrait à décrire un appareil que personne n'a mesuré.
     */
    const r = voisineCharge(CHARGE_INCONNUE, 40, "haut");
    expect(r.statut).toBe("indeterminable");
    expect(r.valeur).toBeNull();
    expect(r.motif).toContain("incréments inconnus");
  });
});

describe("une valeur saisie à la main qui n'existe pas sur l'appareil", () => {
  it("est reconnue comme telle, avec les voisines réalisables", () => {
    /*
     * Le cas du cahier des charges : 43 kg sur une machine qui fait 40/45/50.
     * `chargeAtteignable` dit ce que l'appareil produit le plus près ; les deux
     * voisines donnent le choix réel à proposer.
     *
     * Rien n'est remplacé en silence — c'est l'écran qui informe, avec ces
     * valeurs-là, calculées par le moteur.
     */
    const proche = chargeAtteignable(pile, 43);
    expect(proche.statut).toBe("atteignable");
    expect(proche.valeur).toBe(45);

    expect(voisineCharge(pile, 43, "bas").valeur).toBe(40);
    expect(voisineCharge(pile, 43, "haut").valeur).toBe(45);
  });

  it("sur une collection discrète aussi", () => {
    const proche = chargeAtteignable(halteres, 18);
    expect([16, 20]).toContain(proche.valeur);
    expect(voisineCharge(halteres, 18, "bas").valeur).toBe(16);
    expect(voisineCharge(halteres, 18, "haut").valeur).toBe(20);
  });

  it("et une valeur déjà réalisable n'a rien à signaler", () => {
    const proche = chargeAtteignable(pile, 45);
    expect(proche.valeur).toBe(45);
    expect(proche.statut).toBe("atteignable");
  });
});
