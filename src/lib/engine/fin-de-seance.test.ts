import { describe, it, expect } from "vitest";
import {
  dureeDeLaSeance,
  exercicesSansReserve,
  couvertureReserve,
  recapDeLaSeance,
  DUREE_PLAUSIBLE_MAX_MINUTES,
  serieRenseignee,
  type SerieBrute,
} from "./fin-de-seance";

const T0 = new Date("2026-08-03T18:00:00Z").getTime();
const min = (n: number) => T0 + n * 60_000;

const serie = (p: Partial<SerieBrute> = {}): SerieBrute => ({
  exerciseInstanceId: "a",
  numeroSerie: 1,
  repsEffectuees: 10,
  charge: 60,
  rpeEffectif: 8,
  ...p,
});

describe("série sans charge externe", () => {
  it("considère zéro kilogramme ajouté comme une série renseignée", () => {
    expect(serieRenseignee(serie({ charge: 0, repsEffectuees: 12 }))).toBe(true);
  });
});

describe("durée de la séance", () => {
  it("compte jusqu'à la dernière série validée", () => {
    const d = dureeDeLaSeance({
      demarreeA: T0,
      maintenant: min(70),
      series: [
        serie({ numeroSerie: 1, validatedAt: min(12) }),
        serie({ numeroSerie: 2, validatedAt: min(58) }),
      ],
    });
    expect(d.minutes).toBe(58);
    expect(d.source).toBe("dernier_geste");
  });

  it("ignore la traîne d'une séance reprise le lendemain", () => {
    // Le brouillon vit dans le navigateur : commencée hier soir, clôturée ce
    // matin, l'horloge annonce quinze heures. C'est cette valeur qui partait
    // dans la médiane « durée habituelle ».
    const d = dureeDeLaSeance({
      demarreeA: T0,
      maintenant: min(15 * 60),
      series: [
        serie({ numeroSerie: 1, validatedAt: min(5) }),
        serie({ numeroSerie: 2, validatedAt: min(52) }),
      ],
    });
    expect(d.minutes).toBe(52);
    expect(d.reprisePlusTard).toBe(true);
  });

  it("ne signale pas une reprise pour un simple rangement", () => {
    const d = dureeDeLaSeance({
      demarreeA: T0,
      maintenant: min(58),
      series: [serie({ validatedAt: min(50) })],
    });
    expect(d.reprisePlusTard).toBe(false);
  });

  it("se rabat sur l'horloge quand aucune série n'a été validée", () => {
    const d = dureeDeLaSeance({
      demarreeA: T0,
      maintenant: min(42),
      series: [serie({ validatedAt: undefined })],
    });
    expect(d.minutes).toBe(42);
    expect(d.source).toBe("horloge");
  });

  it("borne une horloge invraisemblable et le signale", () => {
    const d = dureeDeLaSeance({
      demarreeA: T0,
      maintenant: min(3 * 24 * 60),
      series: [serie({ validatedAt: undefined })],
    });
    expect(d.minutes).toBe(DUREE_PLAUSIBLE_MAX_MINUTES);
    expect(d.source).toBe("aucune");
    expect(d.reprisePlusTard).toBe(true);
  });

  it("ne descend jamais sous une minute", () => {
    const d = dureeDeLaSeance({
      demarreeA: T0,
      maintenant: min(0.2),
      series: [serie({ validatedAt: T0 })],
    });
    expect(d.minutes).toBe(1);
  });

  it("ne tient pas compte d'une série vide, même validée", () => {
    // Une ligne ouverte puis abandonnée ne prolonge pas la séance.
    const d = dureeDeLaSeance({
      demarreeA: T0,
      maintenant: min(90),
      series: [
        serie({ numeroSerie: 1, validatedAt: min(40) }),
        serie({ numeroSerie: 2, repsEffectuees: null, charge: null, validatedAt: min(85) }),
      ],
    });
    expect(d.minutes).toBe(40);
  });
});

describe("ce qui reste à renseigner", () => {
  it("regroupe les séries muettes par exercice", () => {
    const manquants = exercicesSansReserve([
      serie({ exerciseInstanceId: "dev", numeroSerie: 1, rpeEffectif: null }),
      serie({ exerciseInstanceId: "dev", numeroSerie: 2, rpeEffectif: null }),
      serie({ exerciseInstanceId: "dev", numeroSerie: 3, rpeEffectif: 8 }),
      serie({ exerciseInstanceId: "squat", numeroSerie: 1, rpeEffectif: null }),
    ]);
    expect(manquants).toEqual([
      { exerciseInstanceId: "dev", series: [1, 2] },
      { exerciseInstanceId: "squat", series: [1] },
    ]);
  });

  it("ne réclame rien pour une série qui n'a pas été faite", () => {
    expect(
      exercicesSansReserve([
        serie({ repsEffectuees: null, charge: null, rpeEffectif: null }),
      ]),
    ).toEqual([]);
  });

  it("ne réclame rien quand tout est renseigné", () => {
    expect(exercicesSansReserve([serie(), serie({ numeroSerie: 2 })])).toEqual([]);
  });

  it("mesure la couverture sur les seules séries faites", () => {
    const series = [
      serie({ numeroSerie: 1, rpeEffectif: 8 }),
      serie({ numeroSerie: 2, rpeEffectif: null }),
      // Non faite : ne compte ni au numérateur ni au dénominateur.
      serie({ numeroSerie: 3, repsEffectuees: null, charge: null, rpeEffectif: null }),
    ];
    expect(couvertureReserve(series)).toBe(0.5);
    expect(couvertureReserve([])).toBe(0);
  });
});

describe("récapitulatif", () => {
  it("compte exercices, séries et tonnage sur ce qui a été fait", () => {
    const r = recapDeLaSeance({
      demarreeA: T0,
      maintenant: min(60),
      series: [
        serie({ exerciseInstanceId: "dev", numeroSerie: 1, charge: 60, repsEffectuees: 10, validatedAt: min(10) }),
        serie({ exerciseInstanceId: "dev", numeroSerie: 2, charge: 60, repsEffectuees: 8, validatedAt: min(20) }),
        serie({ exerciseInstanceId: "squat", numeroSerie: 1, charge: 100, repsEffectuees: 5, validatedAt: min(45) }),
        serie({ exerciseInstanceId: "squat", numeroSerie: 2, repsEffectuees: null, charge: null }),
      ],
    });
    expect(r.exercices).toBe(2);
    expect(r.series).toBe(3);
    expect(r.tonnage).toBe(60 * 10 + 60 * 8 + 100 * 5);
    expect(r.duree.minutes).toBe(45);
    expect(r.couvertureReserve).toBe(1);
    expect(r.aCompleter).toEqual([]);
  });
});
