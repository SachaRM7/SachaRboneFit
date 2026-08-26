import { describe, it, expect } from "vitest";
import { sensDuDelta } from "./Delta";

describe("sens d'une variation", () => {
  it("hausse = gain, baisse = perte", () => {
    expect(sensDuDelta(2.5)).toBe("gain");
    expect(sensDuDelta(-5)).toBe("perte");
  });

  it("zéro = neutre", () => {
    expect(sensDuDelta(0)).toBe("neutre");
  });

  it("sens inversé : en sèche, perdre du poids est un gain", () => {
    // Règle du design system : la couleur suit l'objectif, pas le signe du nombre.
    expect(sensDuDelta(-0.4, true)).toBe("gain");
    expect(sensDuDelta(0.4, true)).toBe("perte");
  });

  it("zéro reste neutre quel que soit le sens", () => {
    expect(sensDuDelta(0, true)).toBe("neutre");
  });
});
