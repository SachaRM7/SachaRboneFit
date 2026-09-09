import { describe, expect, it } from "vitest";
import { blocageEtape, erreursMesures, type EtatOnboardingMinimal } from "./onboarding-flow";

const valide: EtatOnboardingMinimal = {
  mesures: {
    dateNaissance: "1995-05-12",
    sexe: "non_precise",
    taille: "175",
    poids: "72.5",
    poidsDate: "2026-09-01",
  },
  objectifType: "prise_de_muscle",
  niveauExperience: "debutant",
  anneesDePratique: "0",
  moisDInterruption: "0",
  dureeCible: "60",
  dureeMax: "75",
  lieuId: "3f6c1b7e-1f9a-4c2a-9a4e-2f1b6c7d8e90",
  nouveauLieuNom: "",
};

describe("onboarding V2", () => {
  it("accepte explicitement non_precise et une pesée datée", () => {
    expect(erreursMesures(valide)).toEqual({});
  });

  it("bloque l'expérience et l'objectif tant que l'utilisateur n'a rien choisi", () => {
    expect(blocageEtape(2, { ...valide, niveauExperience: "" })).toMatch(/Choisis/);
    expect(blocageEtape(3, { ...valide, objectifType: "" })).toMatch(/objectif/);
  });

  it("exige 0 plutôt que de préremplir silencieusement l'historique", () => {
    expect(blocageEtape(2, { ...valide, anneesDePratique: "" })).toMatch(/même 0/);
    expect(blocageEtape(2, { ...valide, moisDInterruption: "" })).toMatch(/même 0/);
  });

  it("refuse une date de pesée future", () => {
    expect(erreursMesures({ ...valide, mesures: { ...valide.mesures, poidsDate: "2099-01-01" } }))
      .toHaveProperty("poidsDate");
  });

  it("conserve l'étape précédente en ne faisant que valider l'état reçu", () => {
    const copie = structuredClone(valide);
    blocageEtape(3, copie);
    expect(copie).toEqual(valide);
  });
});
