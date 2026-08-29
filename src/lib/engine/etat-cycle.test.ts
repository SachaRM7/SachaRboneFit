import { describe, it, expect } from "vitest";
import { classerEtatCycle, tendancePerformance, type EntreeSeance, type SignauxCorps } from "./etat-cycle";

const seances = (valeurs: number[]): EntreeSeance[] =>
  valeurs.map((v, i) => ({
    date: `2026-08-${String(28 - i).padStart(2, "0")}`,
    meilleur1RM: v,
    rpeMoyen: 8,
    seriesRealisees: 12,
  }));

const signaux = (p: Partial<SignauxCorps> = {}): SignauxCorps => ({
  sommeilRecent: [7.5, 7, 8, 7],
  courbatureMax: 3,
  douleurSignalee: false,
  ...p,
});

describe("tendancePerformance", () => {
  it("reste stable en dessous du bruit de mesure", () => {
    expect(tendancePerformance(seances([100, 100.5, 100, 99.8]))).toBe("stable");
  });

  it("détecte une hausse et une baisse", () => {
    // Les séances vont de la plus récente à la plus ancienne.
    expect(tendancePerformance(seances([110, 108, 100, 99]))).toBe("hausse");
    expect(tendancePerformance(seances([95, 96, 105, 106]))).toBe("baisse");
  });

  it("ne conclut rien sur trop peu de séances", () => {
    expect(tendancePerformance(seances([120, 90]))).toBe("stable");
  });
});

describe("classerEtatCycle", () => {
  it("qualifie d'attendue une fatigue en surcharge tant que les perfs tiennent", () => {
    const etat = classerEtatCycle({
      phasePrevue: "surcharge",
      semainesSansDecharge: 3,
      seancesRecentes: seances([100, 100, 99.5, 100]),
      signaux: signaux({ courbatureMax: 8 }),
    });
    expect(etat.statutFatigue).toBe("elevee_attendue");
    expect(etat.dechargeConseillee).toBe(false);
  });

  it("bascule en anormale quand les performances lâchent en surcharge", () => {
    // C'est le cas que la spec décrit : la baisse arrive plus tôt que prévu.
    const etat = classerEtatCycle({
      phasePrevue: "surcharge",
      semainesSansDecharge: 3,
      seancesRecentes: seances([90, 92, 104, 105]),
      signaux: signaux({ sommeilRecent: [5, 5.5, 4.5, 6] }),
    });
    expect(etat.statutFatigue).toBe("elevee_anormale");
    expect(etat.dechargeConseillee).toBe(true);
    expect(etat.motifs).toContain("les performances reculent");
  });

  it("conseille une décharge sur une douleur inhabituelle, quelle que soit la phase", () => {
    const etat = classerEtatCycle({
      phasePrevue: "accumulation",
      semainesSansDecharge: 1,
      seancesRecentes: seances([100, 101, 100, 100]),
      signaux: signaux({ douleurSignalee: true }),
    });
    expect(etat.dechargeConseillee).toBe(true);
  });

  it("conseille une décharge après six semaines sans", () => {
    const etat = classerEtatCycle({
      phasePrevue: "accumulation",
      semainesSansDecharge: 6,
      seancesRecentes: seances([100, 100, 100, 100]),
      signaux: signaux(),
    });
    expect(etat.dechargeConseillee).toBe(true);
    expect(etat.motifs).toContain("6 semaines sans décharge");
  });

  it("ne déclenche rien quand tout va bien", () => {
    const etat = classerEtatCycle({
      phasePrevue: "accumulation",
      semainesSansDecharge: 2,
      seancesRecentes: seances([104, 102, 100, 99]),
      signaux: signaux(),
    });
    expect(etat.statutFatigue).toBe("basse");
    expect(etat.tendancePerformance).toBe("hausse");
    expect(etat.dechargeConseillee).toBe(false);
    expect(etat.motifs).toHaveLength(0);
  });

  it("n'invente jamais une phase de surcharge", () => {
    // La phase vient du programme, jamais du calendrier : ce module la relaie.
    const etat = classerEtatCycle({
      phasePrevue: "accumulation",
      semainesSansDecharge: 4,
      seancesRecentes: seances([100, 100, 100, 100]),
      signaux: signaux({ courbatureMax: 9 }),
    });
    expect(etat.phase).toBe("accumulation");
    expect(etat.statutFatigue).toBe("elevee_anormale");
  });
});
