import { describe, it, expect } from "vitest";
import {
  estimer1RM,
  chargeSuivante,
  chargeDeTravail,
  arrondirAIncrement,
  toleranceVolume,
  niveauDeReprise,
  type EssaiCalibration,
  type ExpositionObservee,
} from "./calibration";
import { CHARGE_INCONNUE, type ConfigurationCharge } from "./charges";

const CIBLE = { reps: 10, rir: 2 };
const INCREMENTS: ConfigurationCharge = { ...CHARGE_INCONNUE, incrementsPossibles: [2.5] };
const parPas = (pas: number): ConfigurationCharge => ({
  ...CHARGE_INCONNUE,
  incrementsPossibles: [pas],
});

const essai = (charge: number, reps: number, rirRapporte: number): EssaiCalibration => ({
  charge, reps, rirRapporte,
});

describe("estimer1RM", () => {
  it("compte les répétitions restantes comme si elles avaient été faites", () => {
    // 10 à RIR 3 informe autant que 13 à l'échec, sans en payer le prix.
    expect(estimer1RM(essai(100, 10, 3))).toBeCloseTo(estimer1RM(essai(100, 13, 0)), 5);
  });

  it("renvoie la charge elle-même pour une série unique à l'échec", () => {
    expect(estimer1RM(essai(100, 1, 0))).toBe(100);
  });

  it("borne les répétitions effectives, où la formule dérive", () => {
    // Au-delà de vingt, deux séries très longues cesseraient de se distinguer.
    expect(estimer1RM(essai(50, 25, 5))).toBe(estimer1RM(essai(50, 20, 0)));
  });
});

describe("chargeSuivante", () => {
  it("monte franchement quand la série était bien trop légère", () => {
    // Le cas du parcours : « 5+ en réserve » sur la première série.
    const suivante = chargeSuivante(essai(60, 10, 5), CIBLE, INCREMENTS);
    expect(suivante).toBeGreaterThan(60);
  });

  it("ne bouge pas quand la cible est atteinte", () => {
    expect(chargeSuivante(essai(70, 10, 2), CIBLE, INCREMENTS)).toBe(70);
  });

  it("redescend quand la série est allée trop près de l'échec", () => {
    expect(chargeSuivante(essai(80, 10, 0), CIBLE, INCREMENTS)).toBeLessThan(80);
  });

  it("borne la progression pour ne pas extrapoler hors de la zone observée", () => {
    // Le plafond est de 20 %. Une série très longue et très légère produirait
    // sans lui une extrapolation absurde ; il ne borne que ces cas-là.
    const sansPlafond = chargeSuivante(essai(60, 15, 5), CIBLE, parPas(1));
    expect(sansPlafond).toBeLessThanOrEqual(72);

    // Ici l'extrapolation partirait beaucoup plus haut : le plafond mord.
    expect(chargeSuivante(essai(20, 20, 5), CIBLE, parPas(1))).toBe(24);
  });

  it("respecte l'incrément réel de la machine", () => {
    // Une pile par cinq kilos ne propose pas 67,5.
    expect(chargeSuivante(essai(60, 10, 5), CIBLE, parPas(5))! % 5).toBe(0);
  });
});

describe("chargeDeTravail", () => {
  it("annonce une confiance faible sur un seul essai", () => {
    const r = chargeDeTravail([essai(70, 10, 2)], CIBLE, INCREMENTS);
    expect(r.confiance).toBe("faible");
    expect(r.charge).toBeGreaterThan(0);
  });

  it("annonce une bonne confiance sur trois essais concordants", () => {
    const r = chargeDeTravail(
      [essai(65, 10, 3), essai(70, 10, 2), essai(72.5, 9, 2)],
      CIBLE,
      INCREMENTS,
    );
    expect(r.confiance).toBe("bonne");
    expect(r.charge).toBeGreaterThan(60);
    expect(r.charge).toBeLessThan(85);
  });

  it("reste prudent quand les essais divergent", () => {
    const r = chargeDeTravail([essai(40, 10, 1), essai(90, 10, 1)], CIBLE, INCREMENTS);
    expect(r.confiance).toBe("faible");
    expect(r.motif).toContain("divergents");
  });

  it("majore quand toutes les séries étaient trop loin de l'échec", () => {
    // Une réserve annoncée à 5 n'est pas fiable : on ne s'en sert pas pour
    // estimer, seulement pour savoir qu'il faut monter.
    const r = chargeDeTravail([essai(50, 10, 5), essai(60, 10, 5)], CIBLE, INCREMENTS);
    expect(r.charge).toBeGreaterThan(60);
    expect(r.confiance).toBe("faible");
    expect(r.motif).toContain("loin de l'échec");
  });

  it("ne se laisse pas fausser par les premières séries d'échauffement", () => {
    // La médiane écarte l'essai volontairement léger, une moyenne ne le ferait pas.
    const avec = chargeDeTravail(
      [essai(30, 10, 4), essai(70, 10, 2), essai(72.5, 10, 2)],
      CIBLE,
      INCREMENTS,
    );
    expect(avec.charge).toBeGreaterThan(60);
  });

  it("ne prétend rien sans essai", () => {
    expect(chargeDeTravail([], CIBLE, INCREMENTS)).toEqual({
      charge: 0, confiance: "faible", motif: "aucun essai exploitable",
    });
  });
});

describe("arrondirAIncrement", () => {
  it("retient le plus petit incrément disponible", () => {
    // Le pas de 2,5 est retenu, pas celui de 5 : 66,3 tombe sur 67,5.
    expect(arrondirAIncrement(66.3, { ...CHARGE_INCONNUE, incrementsPossibles: [2.5, 5] })).toBe(67.5);
    expect(arrondirAIncrement(67.4, parPas(5))).toBe(65);
    expect(arrondirAIncrement(68, parPas(5))).toBe(70);
  });
});

describe("toleranceVolume", () => {
  const exposition = (series: number, courbatureLendemain: number, tenue: boolean | null = true): ExpositionObservee =>
    ({ series, courbatureLendemain, performanceSuivanteTenue: tenue });

  it("ne conclut rien sur une seule exposition", () => {
    const t = toleranceVolume([exposition(12, 3)]);
    expect(t.motif).toContain("pas encore assez");
    expect(t.observations).toBe(1);
  });

  it("relève le volume quand la récupération est franche", () => {
    const t = toleranceVolume([exposition(10, 2), exposition(10, 1), exposition(10, 2)]);
    expect(t.seriesRecommandees).toBeGreaterThan(10);
  });

  it("abaisse le volume quand les courbatures sont fortes", () => {
    const t = toleranceVolume([exposition(16, 8), exposition(16, 7)]);
    expect(t.seriesRecommandees).toBeLessThan(16);
    expect(t.motif).toContain("courbatures");
  });

  it("abaisse le volume quand les performances reculent ensuite", () => {
    const t = toleranceVolume([exposition(14, 4, false), exposition(14, 5, false)]);
    expect(t.seriesRecommandees).toBeLessThan(14);
    expect(t.motif).toContain("recul");
  });

  it("ne descend jamais sous un plancher utile", () => {
    const t = toleranceVolume([exposition(2, 9), exposition(2, 9)]);
    expect(t.seriesRecommandees).toBeGreaterThanOrEqual(4);
  });
});

describe("niveauDeReprise", () => {
  it("nomme le cas d'un pratiquant expérimenté après une longue coupure", () => {
    // Les schémas moteurs reviennent vite, la tolérance au volume non : c'est
    // cette dissociation que la catégorie doit porter.
    expect(niveauDeReprise({ moisDInterruption: 5, anneesDePratique: 4 }))
      .toBe("intermediaire_deconditionne");
  });

  it("traite une courte pratique interrompue comme un début", () => {
    expect(niveauDeReprise({ moisDInterruption: 6, anneesDePratique: 1 })).toBe("debutant");
  });

  it("ne déclasse pas un pratiquant assidu", () => {
    expect(niveauDeReprise({ moisDInterruption: 0, anneesDePratique: 6 })).toBe("avance");
    expect(niveauDeReprise({ moisDInterruption: 1, anneesDePratique: 2 })).toBe("intermediaire");
  });
});
