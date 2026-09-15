import { describe, expect, it } from "vitest";
import { ageDeLaMesure, estimerPremiereCharge, VERSION_MODELE_COLD_START } from "./cold-start-strength";

const config = {
  natureCharge: "resistance" as const,
  paliersCharges: null,
  incrementsPossibles: [5],
  chargeMinimale: null,
  chargeMax: null,
};

describe("estimerPremiereCharge", () => {
  it("respecte l'autorité série courante puis historique de l'instance", () => {
    expect(estimerPremiereCharge({
      chargeCourante: 25,
      chargeSuggereeHistorique: 20,
      historiqueInstance: [{ charge: 15 }],
      configuration: config,
    })).toMatchObject({ charge: 25, origine: "serie_courante", confiance: "haute" });

    expect(estimerPremiereCharge({
      chargeSuggereeHistorique: 20,
      historiqueInstance: [{ charge: 15 }],
      configuration: config,
    })).toMatchObject({ charge: 20, origine: "historique_instance", confiance: "haute" });
  });

  it("propose seulement le minimum réellement documenté", () => {
    expect(estimerPremiereCharge({
      configuration: { ...config, paliersCharges: [15, 5, 10] },
    })).toMatchObject({ charge: 5, origine: "minimum_materiel", confiance: "faible" });
    expect(estimerPremiereCharge({
      configuration: { ...config, paliersCharges: [5, 10], chargeMinimale: 7.5 },
    })).toMatchObject({ charge: 7.5, origine: "minimum_materiel" });
    expect(estimerPremiereCharge({
      configuration: { ...config, paliersCharges: [0, 5, 10], chargeMinimale: 0 },
    })).toMatchObject({ charge: 5, origine: "minimum_materiel" });
  });

  it("n'invente rien quand le minimum n'est pas connu", () => {
    expect(estimerPremiereCharge({ configuration: config })).toEqual({
      charge: null,
      confiance: "aucune",
      origine: "indisponible",
      explication: "Pas assez de données fiables pour proposer un nombre sans l’inventer.",
      versionModele: VERSION_MODELE_COLD_START,
    });
  });

  /**
   * La charge programmee : une INTENTION, pas une estimation.
   *
   * Elle a sa propre origine parce qu'elle ne vient d'aucun calcul : l'appeler
   * « estimation » ferait passer un choix de l'utilisateur pour une deduction de
   * l'application, et personne ne saurait quoi corriger quand elle ne convient
   * pas. C'est le seul repere disponible avant la premiere serie.
   */
  it("propose la charge programmée quand l'historique est vide", () => {
    const resultat = estimerPremiereCharge({ chargeProgrammee: 42.5, configuration: config });
    expect(resultat).toMatchObject({
      charge: 42.5,
      origine: "charge_programmee",
      confiance: "moyenne",
    });
    // Le mot « estim » n'apparaît nulle part : ce nombre n'est pas déduit.
    expect(`${resultat.explication} ${resultat.origine}`).not.toMatch(/estim/i);
  });

  it("la charge programmée passe avant le premier cran de la machine", () => {
    expect(estimerPremiereCharge({
      chargeProgrammee: 42.5,
      configuration: { ...config, paliersCharges: [5, 10, 15], chargeMinimale: 5 },
    })).toMatchObject({ charge: 42.5, origine: "charge_programmee" });
  });

  it("l'historique reprend l'autorité dès qu'une série existe", () => {
    expect(estimerPremiereCharge({
      chargeProgrammee: 42.5,
      chargeSuggereeHistorique: 45,
      historiqueInstance: [{ charge: 40 }],
      configuration: config,
    })).toMatchObject({ charge: 45, origine: "historique_instance" });

    // Et une série faite pendant cette séance prime encore sur l'historique.
    expect(estimerPremiereCharge({
      chargeCourante: 47.5,
      chargeProgrammee: 42.5,
      chargeSuggereeHistorique: 45,
      historiqueInstance: [{ charge: 40 }],
      configuration: config,
    })).toMatchObject({ charge: 47.5, origine: "serie_courante" });
  });

  it("une charge programmée nulle ou absurde ne devient pas un point de départ", () => {
    for (const charge of [null, undefined, 0, -10, Number.NaN]) {
      expect(estimerPremiereCharge({ chargeProgrammee: charge, configuration: config }))
        .toMatchObject({ charge: null, origine: "indisponible" });
    }
  });

  it("ne prend jamais le minimum d'une assistance pour un départ sûr", () => {
    expect(estimerPremiereCharge({
      configuration: { ...config, natureCharge: "assistance", chargeMinimale: 5 },
    })).toMatchObject({ charge: null, origine: "indisponible" });
  });

  it("laisse les exercices sans charge à leur convention", () => {
    expect(estimerPremiereCharge({ conventionCharge: "sans_charge", configuration: config }))
      .toMatchObject({ charge: null, origine: "indisponible" });
  });

  it("conserve la fraîcheur réelle du poids sans en faire un coefficient", () => {
    expect(ageDeLaMesure("2026-09-01", new Date("2026-09-09T12:00:00Z"))).toBe(8);
    const profilAncien = {
      dateNaissance: "1990-01-01", sexe: "homme", tailleCm: 180,
      poidsKg: 82, poidsMesureLe: "2024-01-01", poidsAgeJours: 982,
      niveauExperience: "debutant", anneesDePratique: 0, moisDInterruption: 0,
    };
    expect(estimerPremiereCharge({ configuration: config, profil: profilAncien }).charge).toBeNull();
    expect(estimerPremiereCharge({ configuration: config, profil: null }).charge).toBeNull();
  });
});
