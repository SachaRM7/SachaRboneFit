import { describe, it, expect } from "vitest";
import {
  chargeZeroEstLegitime,
  estUneSerieRealisee,
  motifSerieInvalide,
  rpeDansLEchelle,
  effortRequisPour,
  seriesRealisees,
} from "./serie-realisee";

/**
 * La séance de recette du 3 septembre, en tests.
 *
 * Elle a été saisie exprès pour casser l'application : 0 kg, 0 répétition,
 * champs vides, valeurs modifiées après validation. Elle a produit « 17 séries,
 * 0 kg de volume, 138 min » dans l'historique et une suggestion de monter la
 * charge de 4,5 kg. Chacun de ces cas est ici.
 */

describe("une série sans répétition n'a pas eu lieu", () => {
  it("0 répétition est refusé, quelle que soit la charge", () => {
    expect(motifSerieInvalide({ repsEffectuees: 0, charge: 60 })).toBe("reps_nulles");
    expect(motifSerieInvalide({ repsEffectuees: 0, charge: 0 })).toBe("reps_nulles");
  });

  it("des répétitions absentes sont refusées", () => {
    expect(motifSerieInvalide({ repsEffectuees: null, charge: 60 })).toBe("reps_absentes");
    expect(motifSerieInvalide({ repsEffectuees: undefined, charge: 60 })).toBe("reps_absentes");
    expect(motifSerieInvalide({ repsEffectuees: Number.NaN, charge: 60 })).toBe("reps_absentes");
  });

  it("aucune convention ne rachète zéro répétition", () => {
    for (const convention of [
      { conventionCharge: "sans_charge" },
      { natureCharge: "assistance" },
      { conventionCharge: "poids_total" },
    ]) {
      expect(estUneSerieRealisee({ repsEffectuees: 0, charge: 0 }, convention)).toBe(false);
    }
  });
});

describe("zéro kilo dépend de ce que la charge mesure", () => {
  it("sur une résistance, zéro n'est pas une série", () => {
    // Le défaut d'origine : `charge !== null` laissait passer ce cas.
    expect(motifSerieInvalide(
      { repsEffectuees: 10, charge: 0 },
      { natureCharge: "resistance", conventionCharge: "pile_affichee" },
    )).toBe("charge_nulle");
  });

  it("sur une assistance, zéro est le meilleur résultat possible", () => {
    // Une traction sans aucune aide : la série la plus dure, pas l'absence.
    expect(estUneSerieRealisee(
      { repsEffectuees: 6, charge: 0 },
      { natureCharge: "assistance" },
    )).toBe(true);
  });

  it("au poids du corps, la charge vaut zéro par convention", () => {
    expect(estUneSerieRealisee(
      { repsEffectuees: 12, charge: 0 },
      { conventionCharge: "sans_charge" },
    )).toBe(true);
    // Et le champ laissé vide est la saisie attendue, pas un oubli.
    expect(estUneSerieRealisee(
      { repsEffectuees: 12, charge: null },
      { conventionCharge: "sans_charge" },
    )).toBe(true);
  });

  it("une charge absente est refusée partout ailleurs", () => {
    expect(motifSerieInvalide(
      { repsEffectuees: 10, charge: null },
      { conventionCharge: "poids_total" },
    )).toBe("charge_absente");
  });

  it("une charge négative n'existe pas", () => {
    expect(motifSerieInvalide({ repsEffectuees: 10, charge: -20 })).toBe("charge_nulle");
  });

  it("les deux seuls cas où zéro est légitime sont nommés", () => {
    expect(chargeZeroEstLegitime({ natureCharge: "assistance" })).toBe(true);
    expect(chargeZeroEstLegitime({ conventionCharge: "sans_charge" })).toBe(true);
    expect(chargeZeroEstLegitime({ conventionCharge: "pile_affichee" })).toBe(false);
    expect(chargeZeroEstLegitime({})).toBe(false);
  });
});

describe("une vraie série passe", () => {
  it("charge et répétitions renseignées", () => {
    expect(estUneSerieRealisee(
      { repsEffectuees: 10, charge: 60 },
      { conventionCharge: "poids_total" },
    )).toBe(true);
  });

  it("une charge fractionnaire aussi", () => {
    expect(estUneSerieRealisee({ repsEffectuees: 8, charge: 2.5 })).toBe(true);
  });
});

describe("le filtre commun à toutes les lectures", () => {
  it("ne garde que ce qui a eu lieu", () => {
    // Les 17 séries de la recette, en miniature.
    const saisies = [
      { repsEffectuees: 10, charge: 60 },
      { repsEffectuees: 0, charge: 0 },
      { repsEffectuees: 0, charge: 60 },
      { repsEffectuees: 8, charge: 0 },
      { repsEffectuees: null, charge: null },
      { repsEffectuees: 12, charge: 40 },
    ];
    const retenues = seriesRealisees(saisies, () => ({ conventionCharge: "pile_affichee" }));
    expect(retenues).toHaveLength(2);
    expect(retenues.map((s) => s.charge)).toEqual([60, 40]);
  });

  it("la convention est lue série par série", () => {
    const saisies = [
      { repsEffectuees: 6, charge: 0, nature: "assistance" },
      { repsEffectuees: 6, charge: 0, nature: "resistance" },
    ];
    const retenues = seriesRealisees(saisies, (s) => ({ natureCharge: s.nature }));
    expect(retenues).toHaveLength(1);
    expect(retenues[0]?.nature).toBe("assistance");
  });

  it("une séance entièrement absurde ne laisse rien", () => {
    const recette = Array.from({ length: 17 }, () => ({ repsEffectuees: 0, charge: 0 }));
    expect(seriesRealisees(recette)).toHaveLength(0);
  });
});

describe("un effort hors échelle empêche la validation", () => {
  it("les 99 saisis en recette ne sont pas une mesure", () => {
    expect(rpeDansLEchelle(99)).toBe(false);
    expect(rpeDansLEchelle(0)).toBe(false);
    expect(rpeDansLEchelle(-3)).toBe(false);
  });

  it("et la série ne peut pas être validée avec", () => {
    // La première correction jetait la valeur en gardant la série : l'écran
    // montrait une ligne verte dont l'effort avait disparu en base. C'est
    // l'écart UI/DB qu'on élimine partout — ici il est simplement refusé.
    expect(motifSerieInvalide(
      { repsEffectuees: 10, charge: 60, rpeEffectif: 99 },
      { conventionCharge: "poids_total" },
    )).toBe("effort_hors_plage");
  });

  it("une valeur dans l'échelle passe", () => {
    for (const v of [1, 7.5, 8, 10]) expect(rpeDansLEchelle(v)).toBe(true);
    expect(estUneSerieRealisee(
      { repsEffectuees: 10, charge: 60, rpeEffectif: 8 },
      { conventionCharge: "poids_total" },
    )).toBe(true);
  });

  it("une absence reste une absence", () => {
    expect(rpeDansLEchelle(null)).toBe(false);
    expect(rpeDansLEchelle(undefined)).toBe(false);
  });
});

describe("en calibration, la réserve est obligatoire", () => {
  it("c'est la phase du cycle qui l'impose, pas l'écran", () => {
    expect(effortRequisPour("calibration")).toBe(true);
    expect(effortRequisPour("volume")).toBe(false);
    expect(effortRequisPour(null)).toBe(false);
  });

  it("sans effort, une série de calibration ne mesure rien", () => {
    expect(motifSerieInvalide(
      { repsEffectuees: 10, charge: 60, rpeEffectif: null },
      { conventionCharge: "poids_total" },
      { effortRequis: true },
    )).toBe("effort_absent");
  });

  it("hors calibration, l'effort reste facultatif", () => {
    // Aucune règle du moteur ne le lit : exiger une saisie dont personne ne se
    // sert reviendrait à fabriquer de la donnée pour la forme.
    expect(estUneSerieRealisee(
      { repsEffectuees: 10, charge: 60, rpeEffectif: null },
      { conventionCharge: "poids_total" },
      { effortRequis: false },
    )).toBe(true);
  });

  it("mais une valeur hors échelle est refusée dans les deux cas", () => {
    for (const effortRequis of [true, false]) {
      expect(motifSerieInvalide(
        { repsEffectuees: 10, charge: 60, rpeEffectif: 99 },
        { conventionCharge: "poids_total" },
        { effortRequis },
      )).toBe("effort_hors_plage");
    }
  });
});
