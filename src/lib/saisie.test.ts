import { describe, it, expect } from "vitest";
import { chiffresSeulement, nombre, fourchetteCoherente, ajusterFourchette } from "./saisie";

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

describe("ajusterFourchette", () => {
  const f = { min: 2, cible: 4, max: 5 };

  it("ne touche à rien quand la valeur reste cohérente", () => {
    expect(ajusterFourchette(f, "cible", 3)).toEqual({ min: 2, cible: 3, max: 5 });
  });

  it("pousse l'objectif quand le minimum le dépasse", () => {
    // Plutôt que de laisser produire « minimum 5, objectif 4 » et de le
    // reprocher ensuite.
    expect(ajusterFourchette(f, "min", 5)).toEqual({ min: 5, cible: 5, max: 5 });
  });

  it("pousse aussi le maximum si nécessaire", () => {
    expect(ajusterFourchette(f, "min", 6)).toEqual({ min: 6, cible: 6, max: 6 });
  });

  it("tire l'objectif quand le maximum descend sous lui", () => {
    expect(ajusterFourchette(f, "max", 3)).toEqual({ min: 2, cible: 3, max: 3 });
  });

  it("tire aussi le minimum si nécessaire", () => {
    expect(ajusterFourchette(f, "max", 1)).toEqual({ min: 1, cible: 1, max: 1 });
  });

  it("la borne qu'on touche gagne toujours", () => {
    for (const champ of ["min", "cible", "max"] as const) {
      for (const v of [1, 3, 6]) {
        expect(ajusterFourchette(f, champ, v)[champ], `${champ}=${v}`).toBe(v);
      }
    }
  });

  it("ne produit jamais d'état incohérent", () => {
    for (const champ of ["min", "cible", "max"] as const) {
      for (const v of [1, 2, 3, 4, 5, 6]) {
        const r = ajusterFourchette(f, champ, v);
        expect(r.min <= r.cible && r.cible <= r.max, JSON.stringify(r)).toBe(true);
      }
    }
  });
});
