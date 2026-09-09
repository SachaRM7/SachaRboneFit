import { describe, expect, it } from "vitest";
import { CHARGE_INCONNUE } from "@/lib/engine/charges";
import { conseilPremierEssai, premierCranConnu } from "./premier-essai";

describe("protocole du premier essai", () => {
  it("ne produit aucun nombre avant une vraie charge et un vrai ressenti", () => {
    const config = { ...CHARGE_INCONNUE, incrementsPossibles: [5] };
    expect(conseilPremierEssai({
      charge: null,
      reserve: null,
      reserveCible: 3,
      config,
    })).toBeNull();
  });

  it("utilise le vrai cran matériel quand le premier essai est trop facile", () => {
    const config = { ...CHARGE_INCONNUE, incrementsPossibles: [5] };
    expect(conseilPremierEssai({
      charge: 20,
      reserve: 5,
      reserveCible: 3,
      config,
    })).toMatchObject({
      etat: "trop_facile",
      chargeSuivante: 25,
      message: expect.stringContaining("25 kg"),
    });
  });

  it("conserve une charge adaptée et allège d'un cran réel si nécessaire", () => {
    const config = { ...CHARGE_INCONNUE, paliersCharges: [10, 17.5, 25] };
    expect(conseilPremierEssai({
      charge: 17.5,
      reserve: 3,
      reserveCible: 3,
      config,
    })?.chargeSuivante).toBe(17.5);
    expect(conseilPremierEssai({
      charge: 17.5,
      reserve: 1,
      reserveCible: 3,
      config,
    })?.chargeSuivante).toBe(10);
  });

  it("respecte le sens inverse d'une assistance", () => {
    const config = {
      ...CHARGE_INCONNUE,
      natureCharge: "assistance" as const,
      paliersCharges: [20, 30, 40],
    };
    // Trop facile : moins d'aide. Trop difficile : davantage d'aide.
    expect(conseilPremierEssai({ charge: 30, reserve: 5, reserveCible: 3, config })
      ?.chargeSuivante).toBe(20);
    expect(conseilPremierEssai({ charge: 30, reserve: 1, reserveCible: 3, config })
      ?.chargeSuivante).toBe(40);
    expect(conseilPremierEssai({ charge: 0, reserve: 3, reserveCible: 3, config }))
      .toMatchObject({ etat: "adapte", chargeSuivante: 0 });
  });

  it("présente un minimum connu comme repère, sans le recommander", () => {
    expect(premierCranConnu({
      ...CHARGE_INCONNUE,
      chargeMinimale: 5,
      paliersCharges: [10, 20],
    })).toBe(5);
    expect(premierCranConnu(CHARGE_INCONNUE)).toBeNull();
  });
});
