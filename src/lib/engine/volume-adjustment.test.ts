import { describe, it, expect } from "vitest";
import { computeVolumeAdjustment } from "./volume-adjustment";
import type { DailyStateInput } from "@/lib/validators/daily-state";

const base: DailyStateInput = {
  date: "2026-08-26",
  sommeilHeures: 8,
  jeuneBool: false,
  shiftRecentBool: false,
  shiftType: "aucun",
  energieDepart: 8,
  courbatures: [],
};

describe("ajustement de volume", () => {
  it("journee normale : aucun ajustement", () => {
    const r = computeVolumeAdjustment(base, []);
    expect(r.totalPct).toBe(0);
    expect(r.raisons).toEqual([]);
    expect(r.proposeDeloadImprovise).toBe(false);
  });

  it("applique chaque penalite documentee", () => {
    expect(computeVolumeAdjustment({ ...base, sommeilHeures: 5 }, []).totalPct).toBe(-25);
    expect(computeVolumeAdjustment({ ...base, jeuneBool: true }, []).totalPct).toBe(-15);
    expect(computeVolumeAdjustment({ ...base, shiftRecentBool: true, shiftType: "nuit" }, []).totalPct).toBe(-20);
  });

  it("un shift de jour ne penalise pas", () => {
    expect(computeVolumeAdjustment({ ...base, shiftRecentBool: true, shiftType: "jour" }, []).totalPct).toBe(0);
  });

  it("plafonne le cumul a -40 %", () => {
    const r = computeVolumeAdjustment(
      { ...base, sommeilHeures: 4, jeuneBool: true, shiftRecentBool: true, shiftType: "nuit" },
      [],
    );
    expect(r.totalPct).toBe(-40);
    expect(r.raisons).toHaveLength(3);
  });

  it("energie <= 4 propose un deload improvise", () => {
    expect(computeVolumeAdjustment({ ...base, energieDepart: 4 }, []).proposeDeloadImprovise).toBe(true);
    expect(computeVolumeAdjustment({ ...base, energieDepart: 5 }, []).proposeDeloadImprovise).toBe(false);
  });
});

describe("report sur courbatures — le bug central de l'audit", () => {
  it("rapproche le vocabulaire de saisie et celui de la base", () => {
    // La courbature est saisie "Quadriceps", l'exercice cible "quads" en base.
    // Avant le referentiel, l'egalite stricte echouait et rien n'etait jamais reporte.
    const r = computeVolumeAdjustment(
      { ...base, courbatures: [{ muscle: "Quadriceps", intensite: 9 }] },
      ["quads"],
    );
    expect(r.proposeReport).toBe(true);
    expect(r.musclesAReporter).toEqual(["quads"]);
  });

  it("respecte le seuil strict de 7", () => {
    const cible = ["quads"];
    expect(computeVolumeAdjustment({ ...base, courbatures: [{ muscle: "Quadriceps", intensite: 8 }] }, cible).proposeReport).toBe(true);
    expect(computeVolumeAdjustment({ ...base, courbatures: [{ muscle: "Quadriceps", intensite: 7 }] }, cible).proposeReport).toBe(false);
  });

  it("ne reporte pas un muscle non cible par la seance", () => {
    const r = computeVolumeAdjustment(
      { ...base, courbatures: [{ muscle: "Pectoraux", intensite: 9 }] },
      ["quads", "ischios"],
    );
    expect(r.proposeReport).toBe(false);
    expect(r.musclesAReporter).toEqual([]);
  });

  it("gere plusieurs courbatures et ne retient que celles au-dessus du seuil", () => {
    const r = computeVolumeAdjustment(
      {
        ...base,
        courbatures: [
          { muscle: "Ischio-jambiers", intensite: 9 },
          { muscle: "Fessiers", intensite: 3 },
        ],
      },
      ["ischios", "fessiers"],
    );
    expect(r.musclesAReporter).toEqual(["ischios"]);
  });
});
