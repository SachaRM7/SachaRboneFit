import { describe, it, expect } from "vitest";
import {
  recordsDeLExercice,
  recordsFranchis,
  etapeDuParcours,
  type SerieRealisee,
} from "./records";

const serie = (date: string, charge: number, reps: number, rir: number | null = null): SerieRealisee =>
  ({ date, charge, reps, rir });

describe("recordsDeLExercice", () => {
  it("ne prétend rien sans données", () => {
    const r = recordsDeLExercice([]);
    expect(r.debutDuParcours).toBeNull();
    expect(r.parPlage).toHaveLength(0);
  });

  it("qualifie la première mesure de référence, pas de record", () => {
    // Le point de la demande : féliciter un point de départ n'a pas de sens.
    const r = recordsDeLExercice([serie("2026-08-31", 50, 10)]);
    const dix = r.parPlage.find((p) => p.plage === 10)!;
    expect(dix.nature).toBe("baseline");
    expect(dix.progressionDepuisDebut).toBeNull();
    expect(r.debutDuParcours).toBe("2026-08-31");
  });

  it("devient un record dès qu'une performance en dépasse une autre", () => {
    const r = recordsDeLExercice([
      serie("2026-08-31", 50, 10),
      serie("2026-09-07", 65, 10),
    ]);
    const dix = r.parPlage.find((p) => p.plage === 10)!;
    expect(dix.nature).toBe("record");
    expect(dix.charge).toBe(65);
    expect(dix.progressionDepuisDebut).toBe(30);
  });

  it("tient les plages indépendamment les unes des autres", () => {
    // 70 × 12 est un record de la plage 12 alors que 80 × 8 existe : ce ne sont
    // pas les mêmes qualités.
    const r = recordsDeLExercice([
      serie("2026-08-31", 60, 12),
      serie("2026-09-07", 80, 8),
      serie("2026-09-14", 70, 12),
    ]);
    expect(r.parPlage.find((p) => p.plage === 12)!.charge).toBe(70);
    expect(r.parPlage.find((p) => p.plage === 8)!.charge).toBe(80);
  });

  it("fait profiter les plages inférieures d'une série longue", () => {
    // Une série de 12 informe aussi sur « au moins 10 » et « au moins 8 ».
    const r = recordsDeLExercice([serie("2026-08-31", 60, 12)]);
    expect(r.parPlage.map((p) => p.plage)).toEqual([1, 3, 5, 8, 10, 12]);
    expect(r.parPlage.find((p) => p.plage === 8)!.charge).toBe(60);
  });

  it("retient le meilleur maximum estimé et le meilleur volume de séance", () => {
    const r = recordsDeLExercice([
      serie("2026-08-31", 60, 10, 2),
      serie("2026-08-31", 60, 10, 2),
      serie("2026-09-07", 80, 5, 1),
    ]);
    expect(r.meilleureCharge!.charge).toBe(80);
    expect(r.meilleur1RM!.charge).toBe(80);
    // Deux séries de 60 × 10 le même jour pèsent plus qu'une de 80 × 5.
    expect(r.meilleurVolumeSeance).toEqual({ volume: 1200, date: "2026-08-31" });
  });

  it("reconstitue l'ordre même si les séries arrivent en désordre", () => {
    const r = recordsDeLExercice([
      serie("2026-09-07", 65, 10),
      serie("2026-08-31", 50, 10),
    ]);
    expect(r.debutDuParcours).toBe("2026-08-31");
    expect(r.parPlage.find((p) => p.plage === 10)!.nature).toBe("record");
  });
});

describe("recordsFranchis", () => {
  it("ne célèbre pas une première mesure", () => {
    expect(recordsFranchis(serie("2026-08-31", 50, 10), [])).toEqual([]);
  });

  it("annonce le record quand la charge dépasse l'antérieur", () => {
    const franchis = recordsFranchis(
      serie("2026-09-07", 65, 10),
      [serie("2026-08-31", 50, 10)],
    );
    // Une série de 10 bat les plages 1, 3, 5, 8 et 10.
    expect(franchis.map((f) => f.plage)).toEqual([10, 8, 5, 3, 1]);
    expect(franchis[0]!.plage).toBe(10);
    expect(franchis[0]!.progressionPourcent).toBe(30);
    expect(franchis[0]!.chargePrecedente).toBe(50);
  });

  it("n'annonce rien quand la performance n'égale que l'existant", () => {
    expect(recordsFranchis(serie("2026-09-07", 50, 10), [serie("2026-08-31", 50, 10)]))
      .toEqual([]);
  });

  it("annonce un record de plage haute sans record de charge", () => {
    // 70 × 12 après 80 × 8 : rien sur la plage 8, un record sur la plage 12.
    const franchis = recordsFranchis(
      serie("2026-09-14", 70, 12),
      [serie("2026-08-31", 60, 12), serie("2026-09-07", 80, 8)],
    );
    const plages = franchis.map((f) => f.plage);
    expect(plages).toContain(12);
    expect(plages).not.toContain(8);
  });

  it("présente d'abord la plage la plus exigeante", () => {
    const franchis = recordsFranchis(
      serie("2026-09-07", 65, 12),
      [serie("2026-08-31", 50, 12)],
    );
    expect(franchis[0]!.plage).toBe(12);
  });
});

describe("etapeDuParcours", () => {
  it("suit la progression d'un exercice depuis rien", () => {
    expect(etapeDuParcours([])).toBe("pas_de_donnees");
    expect(etapeDuParcours([serie("2026-08-31", 50, 10)])).toBe("calibration");
    expect(etapeDuParcours([serie("2026-08-31", 50, 10), serie("2026-09-02", 55, 10)]))
      .toBe("reference_etablie");
    expect(etapeDuParcours([
      serie("2026-08-31", 50, 10), serie("2026-09-02", 55, 10), serie("2026-09-05", 60, 10),
    ])).toBe("progression");
  });

  it("compte les séances, pas les séries", () => {
    const memeJour = [
      serie("2026-08-31", 50, 10), serie("2026-08-31", 50, 10), serie("2026-08-31", 50, 9),
    ];
    expect(etapeDuParcours(memeJour)).toBe("calibration");
  });
});
