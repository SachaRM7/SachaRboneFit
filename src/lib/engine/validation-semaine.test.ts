import { describe, it, expect } from "vitest";
import { validerImpactSemaine, type ImpactSemaine } from "./validation-semaine";

const impact = (p: Partial<ImpactSemaine> = {}): ImpactSemaine => ({
  seriesRealisees: {},
  seriesProposees: {},
  joursRestants: 3,
  ...p,
});

const codes = (r: ReturnType<typeof validerImpactSemaine>) => r.anomalies.map((a) => a.code);

describe("validerImpactSemaine", () => {
  it("détecte le déséquilibre que des séances individuellement parfaites produisent", () => {
    // Le cas décrit : chaque séance validée, la semaine ratée.
    const r = validerImpactSemaine(impact({
      seriesRealisees: { epaules: 18, ischios: 4, pectoraux: 14, dorsaux: 12 },
      seriesProposees: { epaules: 4 },
    }));
    expect(r.totalParMuscle.epaules).toBe(22);
    expect(r.totalParMuscle.ischios).toBe(4);
  });

  it("signale un rapport poussée / tirage qui dérive", () => {
    const r = validerImpactSemaine(impact({
      seriesRealisees: { pectoraux: 18, dorsaux: 6 },
      seriesProposees: { pectoraux: 4 },
    }));
    expect(codes(r)).toContain("desequilibre_antagonistes");
    expect(r.equilibres["poussée / tirage"]).toBeCloseTo(22 / 6, 1);
  });

  it("ne juge pas un rapport sur trop peu de volume", () => {
    const r = validerImpactSemaine(impact({
      seriesRealisees: { pectoraux: 3, dorsaux: 1 },
      seriesProposees: {},
    }));
    expect(codes(r)).not.toContain("desequilibre_antagonistes");
  });

  it("signale un dépassement net de la cible", () => {
    const r = validerImpactSemaine(impact({
      seriesRealisees: { pectoraux: 20 },
      seriesProposees: { pectoraux: 6 },
      cibles: { pectoraux: 16 },
    }));
    expect(codes(r)).toContain("volume_hebdo_excessif");
  });

  it("ne signale un manque que s'il n'est plus rattrapable", () => {
    // Trois jours restants laissent le temps de combler : rien à signaler.
    const tot = validerImpactSemaine(impact({
      seriesProposees: { ischios: 2 },
      cibles: { ischios: 16 },
      joursRestants: 3,
    }));
    expect(codes(tot)).not.toContain("volume_hebdo_inatteignable");

    // Le dernier jour, le même retard devient définitif.
    const tard = validerImpactSemaine(impact({
      seriesProposees: { ischios: 2 },
      cibles: { ischios: 16 },
      joursRestants: 0,
    }));
    expect(codes(tard)).toContain("volume_hebdo_inatteignable");
  });

  it("bloque quand le muscle laissé de côté est prioritaire", () => {
    const r = validerImpactSemaine(impact({
      seriesProposees: { ischios: 1 },
      cibles: { ischios: 18 },
      prioritaires: ["ischios"],
      joursRestants: 0,
    }));
    expect(r.valide).toBe(false);
    expect(r.anomalies.some((a) => a.gravite === "bloquant")).toBe(true);
  });

  it("valide une semaine équilibrée", () => {
    const r = validerImpactSemaine(impact({
      seriesRealisees: { pectoraux: 8, dorsaux: 8, quadriceps: 6, ischios: 6 },
      seriesProposees: { pectoraux: 4, dorsaux: 4 },
      cibles: { pectoraux: 14, dorsaux: 14 },
      joursRestants: 2,
    }));
    expect(r.valide).toBe(true);
    expect(r.anomalies).toHaveLength(0);
  });
});
