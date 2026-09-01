import { describe, expect, it } from "vitest";
import {
  champsMachineSchema,
  consigneDeSaisie,
  LIBELLES_CONVENTION,
} from "./exercise-instance";

describe("conventions de charge", () => {
  it("décrit sans ambiguïté la saisie par haltère", () => {
    expect(LIBELLES_CONVENTION.poids_par_main).toBe("Poids par main");
    expect(consigneDeSaisie("poids_par_main", "resistance"))
      .toBe("Note le poids d’un haltère, sans multiplier par deux.");
    expect(champsMachineSchema.safeParse({
      conventionCharge: "poids_par_main",
      typePoulie: "na",
    }).success).toBe(true);
  });

  it("décrit la double poulie comme une valeur par côté, jamais une somme", () => {
    expect(LIBELLES_CONVENTION.pile_par_cote).toBe("Pile affichée par côté");
    expect(consigneDeSaisie("pile_par_cote", "resistance"))
      .toBe("Note la valeur affichée sur un côté, avec les deux côtés réglés pareil.");
  });

  it("laisse vide la charge d'un mouvement sans charge externe", () => {
    expect(consigneDeSaisie("sans_charge", "resistance"))
      .toBe("Laisse la charge vide : seules les répétitions sont enregistrées.");
  });
});
