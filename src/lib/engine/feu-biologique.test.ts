import { describe, it, expect } from "vitest";
import { computeFeuJour, computeFeuTendance } from "./feu-biologique";
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

describe("feu du jour", () => {
  it("tous les criteres remplis : vert", () => {
    const r = computeFeuJour(base);
    expect(r.feu).toBe("vert");
    expect(r.nbEchecs).toBe(0);
  });

  it("un seul critere en echec : orange", () => {
    expect(computeFeuJour({ ...base, sommeilHeures: 5 }).feu).toBe("orange");
    expect(computeFeuJour({ ...base, energieDepart: 6 }).feu).toBe("orange");
    expect(computeFeuJour({ ...base, courbatures: [{ muscle: "quadriceps", intensite: 6 }] }).feu).toBe("orange");
  });

  it("deux criteres en echec : rouge", () => {
    expect(computeFeuJour({ ...base, sommeilHeures: 5, energieDepart: 6 }).feu).toBe("rouge");
  });

  it("energie tres basse : rouge quels que soient les autres criteres", () => {
    const r = computeFeuJour({ ...base, energieDepart: 3 });
    expect(r.feu).toBe("rouge");
  });

  it("les seuils sont inclusifs comme documente", () => {
    expect(computeFeuJour({ ...base, sommeilHeures: 6 }).criteresSommeil).toBe(true);
    expect(computeFeuJour({ ...base, sommeilHeures: 5.9 }).criteresSommeil).toBe(false);
    expect(computeFeuJour({ ...base, energieDepart: 7 }).criteresEnergie).toBe(true);
    expect(computeFeuJour({ ...base, energieDepart: 6 }).criteresEnergie).toBe(false);
  });

  it("retient la courbature la plus intense, pas la premiere", () => {
    const r = computeFeuJour({
      ...base,
      courbatures: [
        { muscle: "core", intensite: 2 },
        { muscle: "ischios", intensite: 9 },
      ],
    });
    expect(r.criteresCourbatures).toBe(false);
  });
});

describe("feu de tendance", () => {
  const perf = (id: string, rm: number) => ({
    exerciseInstanceId: id,
    exerciseName: id,
    volumeTotal: rm * 10,
    estimated1RM: rm,
  });

  it("moins de trois seances : pas de conclusion", () => {
    const r = computeFeuTendance({ sessions: [] });
    expect(r.feu).toBe("vert");
    expect(r.raison).toContain("Pas assez");
  });

  it("progression sur la majorite des piliers : vert", () => {
    const r = computeFeuTendance({
      sessions: [
        { date: "2026-08-01", feuJour: "vert", pilierPerfs: [perf("a", 100), perf("b", 100)] },
        { date: "2026-08-08", feuJour: "vert", pilierPerfs: [perf("a", 104), perf("b", 103)] },
        { date: "2026-08-15", feuJour: "vert", pilierPerfs: [perf("a", 108), perf("b", 106)] },
      ],
    });
    expect(r.feu).toBe("vert");
    expect(r.contexteNormal).toBe(true);
  });

  it("regression en contexte normal : rouge", () => {
    const r = computeFeuTendance({
      sessions: [
        { date: "2026-08-01", feuJour: "vert", pilierPerfs: [perf("a", 100)] },
        { date: "2026-08-08", feuJour: "vert", pilierPerfs: [perf("a", 96)] },
        { date: "2026-08-15", feuJour: "vert", pilierPerfs: [perf("a", 92)] },
      ],
    });
    expect(r.feu).toBe("rouge");
  });

  it("regression en contexte degrade : orange, pas rouge", () => {
    const r = computeFeuTendance({
      sessions: [
        { date: "2026-08-01", feuJour: "rouge", pilierPerfs: [perf("a", 100)] },
        { date: "2026-08-08", feuJour: "orange", pilierPerfs: [perf("a", 96)] },
        { date: "2026-08-15", feuJour: "rouge", pilierPerfs: [perf("a", 92)] },
      ],
    });
    expect(r.contexteNormal).toBe(false);
    expect(r.feu).toBe("orange");
  });

  it("une variation sous la marge de bruit compte comme une stagnation", () => {
    // 100 -> 99 : 1 %, sous le seuil. Déclenchait auparavant un feu rouge,
    // donc un deload, sur ce qui n'est qu'un écart de mesure.
    const r = computeFeuTendance({
      sessions: [
        { date: "2026-08-01", feuJour: "vert", pilierPerfs: [perf("a", 100)] },
        { date: "2026-08-08", feuJour: "vert", pilierPerfs: [perf("a", 99.5)] },
        { date: "2026-08-15", feuJour: "vert", pilierPerfs: [perf("a", 99)] },
      ],
    });
    expect(r.feu).toBe("orange");
    expect(r.raison).toContain("Stagnation");
  });

  it("une régression franche reste détectée", () => {
    const r = computeFeuTendance({
      sessions: [
        { date: "2026-08-01", feuJour: "vert", pilierPerfs: [perf("a", 100)] },
        { date: "2026-08-08", feuJour: "vert", pilierPerfs: [perf("a", 97)] },
        { date: "2026-08-15", feuJour: "vert", pilierPerfs: [perf("a", 94)] },
      ],
    });
    expect(r.feu).toBe("rouge");
  });

  it("stagnation stricte : orange", () => {
    const r = computeFeuTendance({
      sessions: [
        { date: "2026-08-01", feuJour: "vert", pilierPerfs: [perf("a", 100)] },
        { date: "2026-08-08", feuJour: "vert", pilierPerfs: [perf("a", 100)] },
        { date: "2026-08-15", feuJour: "vert", pilierPerfs: [perf("a", 100)] },
      ],
    });
    expect(r.feu).toBe("orange");
    expect(r.raison).toContain("Stagnation");
  });
});
