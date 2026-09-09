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
