import { describe, expect, it } from "vitest";
import { repereSeanceVisible } from "./repere-visible";

describe("repère visible d'une séance", () => {
  it("conserve Libre dans un véritable programme libre", () => {
    expect(repereSeanceVisible("LIBRE", 0, "libre")).toBe("LIBRE");
  });

  it("remplace l'ancien repère Libre après déplacement dans un programme", () => {
    expect(repereSeanceVisible("LIBRE", 0, "hypertrophie")).toBe("01");
    expect(repereSeanceVisible("LIBRE", 2, "force")).toBe("03");
  });

  it("conserve une lettre choisie dans un programme structuré", () => {
    expect(repereSeanceVisible("P", 0, "hypertrophie")).toBe("P");
  });
});
