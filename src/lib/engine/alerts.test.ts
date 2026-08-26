import { describe, it, expect } from "vitest";
import { computeAlerts, type AlertsInput } from "./alerts";

const vide: AlertsInput = {
  completedRanges: [],
  semainesSansDeload: 0,
  stagnations: [],
  feuTendance: null,
};

describe("alertes", () => {
  it("rien a signaler : aucune alerte", () => {
    expect(computeAlerts(vide)).toEqual([]);
  });

  it("fourchette completee : alerte post-seance avec la charge suivante", () => {
    const [a] = computeAlerts({
      ...vide,
      completedRanges: [{ exerciseName: "Romanian Deadlift", currentCharge: 80, nextCharge: 82.5 }],
    });
    expect(a!.type).toBe("fourchette_completee");
    expect(a!.timing).toBe("post_seance");
    expect(a!.priority).toBe("info");
    expect(a!.actionLabel).toContain("82.5");
  });

  it("deload conseille a partir de cinq semaines, pas avant", () => {
    expect(computeAlerts({ ...vide, semainesSansDeload: 4 })).toHaveLength(0);
    const [a] = computeAlerts({ ...vide, semainesSansDeload: 5 });
    expect(a!.type).toBe("deload_recommande");
    expect(a!.timing).toBe("pre_seance");
    expect(a!.priority).toBe("warning");
  });

  it("stagnation signalee seulement en contexte normal", () => {
    const stag = { exerciseName: "Squat", semainesSansProgression: 3, contexteNormal: true };
    expect(computeAlerts({ ...vide, stagnations: [stag] })).toHaveLength(1);
    // En contexte degrade, la stagnation s'explique : on n'alerte pas.
    expect(computeAlerts({ ...vide, stagnations: [{ ...stag, contexteNormal: false }] })).toHaveLength(0);
  });

  it("stagnation en dessous de deux semaines : pas d'alerte", () => {
    expect(computeAlerts({
      ...vide,
      stagnations: [{ exerciseName: "Squat", semainesSansProgression: 1, contexteNormal: true }],
    })).toHaveLength(0);
  });

  it("tendance rouge : alerte de danger", () => {
    const [a] = computeAlerts({ ...vide, feuTendance: "rouge" });
    expect(a!.type).toBe("tendance_rouge");
    expect(a!.priority).toBe("danger");
  });

  it("tendance verte ou orange : aucune alerte de tendance", () => {
    expect(computeAlerts({ ...vide, feuTendance: "vert" })).toHaveLength(0);
    expect(computeAlerts({ ...vide, feuTendance: "orange" })).toHaveLength(0);
  });

  it("cumule les alertes de plusieurs sources", () => {
    const r = computeAlerts({
      completedRanges: [{ exerciseName: "Squat", currentCharge: 100, nextCharge: 105 }],
      semainesSansDeload: 6,
      stagnations: [{ exerciseName: "Bench", semainesSansProgression: 3, contexteNormal: true }],
      feuTendance: "rouge",
    });
    expect(r.map((a) => a.type).sort()).toEqual([
      "deload_recommande", "fourchette_completee", "stagnation", "tendance_rouge",
    ]);
  });
});
