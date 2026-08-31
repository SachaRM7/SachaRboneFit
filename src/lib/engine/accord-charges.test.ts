import { describe, it, expect } from "vitest";
import { computeNextSets } from "./double-progression";
import { arrondirAIncrement, chargeDeTravail } from "./calibration";
import { CHARGE_INCONNUE, prochaineCharge, type ConfigurationCharge } from "./charges";
import { besoinCouvert, exercicesRealisables } from "./disponibilite";
import { besoinDe } from "@/lib/referentiels/capacites";

/**
 * Deux modules, une seule réponse.
 *
 * La double progression et la calibration lisaient le même tableau
 * différemment : `incrementsPossibles[0]` d'un côté, `Math.min(...)` de
 * l'autre. Sur une machine saisie `[5, 2.5]`, l'une prescrivait 5 kg de plus,
 * l'autre arrondissait au 2,5 — et l'ordre de saisie décidait laquelle avait
 * raison. Ce fichier est le garde-fou : il fait passer les deux consommateurs
 * par la même entrée et exige le même résultat.
 */

const AVEC_5_ET_2_5: ConfigurationCharge = {
  ...CHARGE_INCONNUE,
  incrementsPossibles: [5, 2.5],
};

describe("[5, 2.5] : calibration et double progression tombent d'accord", () => {
  it("proposent la même charge suivante depuis 60 kg", () => {
    const parLaDoubleProgression = computeNextSets(
      {
        sets: [
          { numero: 1, reps: 8, charge: 60 },
          { numero: 2, reps: 8, charge: 60 },
          { numero: 3, reps: 8, charge: 60 },
        ],
      },
      { fourchetteRepsMin: 6, fourchetteRepsMax: 8, seriesCibles: 3, charge: AVEC_5_ET_2_5 },
    ).charge;

    const parLaPrimitive = prochaineCharge(AVEC_5_ET_2_5, 60).valeur;

    expect(parLaDoubleProgression).toBe(62.5);
    expect(parLaPrimitive).toBe(62.5);
  });

  it("arrondissent sur la même grille", () => {
    // L'ancienne double progression aurait produit 65 ici, la calibration 62,5.
    expect(arrondirAIncrement(61.8, AVEC_5_ET_2_5)).toBe(62.5);
    expect(arrondirAIncrement(61.8, { ...AVEC_5_ET_2_5, incrementsPossibles: [2.5, 5] })).toBe(62.5);
  });

  it("ne dépendent pas de l'ordre de saisie", () => {
    const inverse: ConfigurationCharge = { ...AVEC_5_ET_2_5, incrementsPossibles: [2.5, 5] };
    const depuis = 47.5;
    expect(prochaineCharge(AVEC_5_ET_2_5, depuis)).toEqual(prochaineCharge(inverse, depuis));
  });

  it("se taisent tous les deux quand l'appareil n'a pas été mesuré", () => {
    const muet = computeNextSets(
      { sets: [{ numero: 1, reps: 8, charge: 40 }] },
      { fourchetteRepsMin: 6, fourchetteRepsMax: 8, seriesCibles: 1, charge: CHARGE_INCONNUE },
    );
    const calibration = chargeDeTravail(
      [{ charge: 40, reps: 10, rirRapporte: 2 }],
      { reps: 10, rir: 2 },
      CHARGE_INCONNUE,
    );

    expect(muet.charge).toBeNull();
    expect(calibration.charge).toBeNull();
    expect(calibration.motif).toMatch(/inconnus/);
  });
});

/**
 * Le poids du corps ne dispense pas de structure.
 *
 * L'invariant « poids du corps = faisable partout » est juste pour une pompe
 * et faux pour une traction, qui exige quelque chose au-dessus de la tête.
 */
describe("faisabilité du poids du corps", () => {
  const catalogue = [
    {
      id: "e-traction", nom: "Pull-up", pilier: "P2_tirage", categorieRole: "pilier",
      musclesPrincipaux: ["dorsaux"], equipement: "poids_du_corps", slug: "pull-up",
    },
    {
      id: "e-dip", nom: "Dip", pilier: "P1_poussee", categorieRole: "pilier",
      musclesPrincipaux: ["pectoraux"], equipement: "poids_du_corps", slug: "dip",
    },
    {
      id: "e-pompe", nom: "Push-up", pilier: "P1_poussee", categorieRole: "accessoire",
      musclesPrincipaux: ["pectoraux"], equipement: "poids_du_corps", slug: "push-up",
    },
  ];

  const faisables = (equipementsDuLieu: string[]) =>
    exercicesRealisables({ catalogue, equipementsDuLieu, instances: [] }).map((r) => r.exerciceId);

  it("une traction est impossible dans un lieu sans structure", () => {
    expect(besoinDe("pull-up", "poids_du_corps")).toBe("barre_traction");
    expect(faisables([])).not.toContain("e-traction");
  });

  it("un dip aussi", () => {
    expect(faisables([])).not.toContain("e-dip");
  });

  it("une pompe reste faisable partout", () => {
    // Rien à déclarer, aucun matériel : c'est le comportement voulu, et il ne
    // doit pas être emporté par la correction.
    expect(besoinCouvert(besoinDe("push-up", "poids_du_corps"), [])).toBe(true);
    expect(faisables([])).toContain("e-pompe");
  });

  it("la structure déclarée les rend faisables", () => {
    expect(faisables(["barre_traction", "barres_paralleles"]))
      .toEqual(expect.arrayContaining(["e-traction", "e-dip", "e-pompe"]));
  });

  it("un appareil décrit vaut déclaration de présence", () => {
    // On a vu la machine, elle est là : exiger en plus la case cochée
    // refuserait un exercice qu'on est en train de décrire.
    const avecInstance = exercicesRealisables({
      catalogue,
      equipementsDuLieu: [],
      instances: [{
        id: "i1", exerciseId: "e-traction", machineNom: "Barre de traction",
        incrementsPossibles: [],
      }],
    }).map((r) => r.exerciceId);
    expect(avecInstance).toContain("e-traction");
  });
});
