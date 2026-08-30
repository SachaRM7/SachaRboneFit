import { describe, it, expect } from "vitest";
import { chiffresSeulement, nombre, fourchetteCoherente } from "./saisie";

describe("chiffresSeulement", () => {
  it("laisse vider le champ", () => {
    // Le défaut du bug : un zéro qui revenait dès qu'on effaçait.
    expect(chiffresSeulement("")).toBe("");
  });

  it("n'ajoute pas de zéro devant ce qu'on tape", () => {
    expect(chiffresSeulement("4")).toBe("4");
    expect(chiffresSeulement("04")).toBe("04");
  });

  it("écarte tout ce qui n'est pas un chiffre", () => {
    expect(chiffresSeulement("1a2-3,")).toBe("123");
    expect(chiffresSeulement("-5")).toBe("5");
  });

  it("borne la longueur", () => {
    expect(chiffresSeulement("123456")).toBe("123");
    expect(chiffresSeulement("123456", 2)).toBe("12");
  });
});

describe("nombre", () => {
  it("retombe sur le défaut quand le champ est vide", () => {
    expect(nombre("", 60)).toBe(60);
    expect(nombre("   ", 60)).toBe(60);
  });

  it("rend le nombre saisi, zéro compris", () => {
    // Zéro est une réponse valide : « je m'entraîne actuellement ».
    expect(nombre("0", 60)).toBe(0);
    expect(nombre("04", 60)).toBe(4);
  });

  it("ne rend jamais NaN", () => {
    expect(nombre("abc", 60)).toBe(60);
  });
});

describe("fourchetteCoherente", () => {
  it("accepte une fourchette ordonnée", () => {
    expect(fourchetteCoherente(2, 3, 4)).toBe(true);
    expect(fourchetteCoherente(4, 4, 4)).toBe(true);
  });

  it("refuse un minimum au-dessus de l'objectif", () => {
    expect(fourchetteCoherente(5, 3, 6)).toBe(false);
  });

  it("refuse un objectif au-dessus du maximum", () => {
    expect(fourchetteCoherente(2, 5, 4)).toBe(false);
  });
});
