import { describe, it, expect } from "vitest";
import {
  progressionDeLExercice,
  confiance,
  ampleur,
  recence,
  reserveFiable,
  POIDS,
  type SerieDatee,
} from "./score-progression";

const AUJOURDHUI = "2026-08-03";

const serie = (date: string, charge: number, reps: number, rir: number | null = null): SerieDatee =>
  ({ date, charge, reps, rir });

/** N séances hebdomadaires, la charge montant d'un pas constant. */
function serieProgressive(
  seances: number,
  chargeDepart: number,
  pas: number,
  reps = 10,
  finISO = "2026-08-01",
): SerieDatee[] {
  const fin = new Date(`${finISO}T00:00:00Z`);
  return Array.from({ length: seances }, (_, i) => {
    const d = new Date(fin);
    d.setUTCDate(d.getUTCDate() - 7 * (seances - 1 - i));
    return serie(d.toISOString().slice(0, 10), chargeDepart + pas * i, reps);
  });
}

describe("composantes", () => {
  it("refuse toute confiance sous le seuil de séances", () => {
    expect(confiance(2)).toBe(0);
    expect(confiance(POIDS.seancesMinimum)).toBe(POIDS.confianceAuMinimum);
    expect(confiance(POIDS.seancesPleineConfiance)).toBe(1);
    expect(confiance(30)).toBe(1);
  });

  it("fait saturer l'ampleur au-delà du gain de référence", () => {
    expect(ampleur(0)).toBe(0);
    expect(ampleur(POIDS.gainDeReference)).toBe(1);
    // C'est ici que se joue le biais : +25 % ne vaut pas plus que +12 %.
    expect(ampleur(25)).toBe(1);
    expect(ampleur(6)).toBeCloseTo(0.5, 2);
  });

  it("fait décroître la récence puis l'annule", () => {
    expect(recence(0)).toBe(1);
    expect(recence(POIDS.joursRecenceMaximale)).toBe(1);
    expect(recence(POIDS.joursRecenceNulle)).toBe(0);
    expect(recence(null)).toBe(0);
  });

  it("n'accepte la réserve que si elle est assez souvent renseignée", () => {
    expect(reserveFiable([serie("2026-07-01", 60, 10, 2), serie("2026-07-01", 60, 10, 2)])).toBe(true);
    expect(reserveFiable([serie("2026-07-01", 60, 10, 2), serie("2026-07-01", 60, 10)])).toBe(false);
    expect(reserveFiable([])).toBe(false);
  });
});

describe("le biais du pourcentage", () => {
  it("ne laisse pas un petit exercice devancer un gros du seul fait de sa charge", () => {
    // Le cas exact du problème : 8 → 10 kg fait +25 %, 100 → 110 kg fait +10 %.
    // Le premier tient sur trois séances, le second sur douze.
    const elevations = progressionDeLExercice(serieProgressive(3, 8, 1), AUJOURDHUI)!;
    const developpe = progressionDeLExercice(serieProgressive(12, 100, 0.91), AUJOURDHUI)!;

    // Le pourcentage donne bien l'avantage aux élévations…
    expect(elevations.progressionPct).toBeGreaterThan(developpe.progressionPct);
    // …mais le classement, non.
    expect(developpe.score).toBeGreaterThan(elevations.score);
  });

  it("laisse gagner le petit exercice quand il est aussi bien documenté", () => {
    // Le score ne pénalise pas la charge légère en soi : à documentation égale
    // et progression régulière, l'exercice léger n'est pas désavantagé.
    const leger = progressionDeLExercice(serieProgressive(12, 8, 0.25), AUJOURDHUI)!;
    const lourd = progressionDeLExercice(serieProgressive(12, 100, 3), AUJOURDHUI)!;
    expect(leger.score).toBeCloseTo(lourd.score, 5);
  });

  it("ne récompense pas deux séances, même spectaculaires", () => {
    // 50 → 100 kg d'une séance à l'autre : +100 %, et rien de comparable.
    expect(
      progressionDeLExercice([serie("2026-07-27", 50, 10), serie("2026-08-01", 100, 10)], AUJOURDHUI),
    ).toBeNull();
  });
});

describe("régularité et récence", () => {
  it("classe devant l'exercice qui progresse souvent, à gain égal", () => {
    // Même charge de départ, même charge d'arrivée, même nombre de séances.
    // L'un monte à chaque fois, l'autre a fait un bond puis plus rien.
    const regulier = progressionDeLExercice(serieProgressive(6, 100, 2), AUJOURDHUI)!;
    const unBond = progressionDeLExercice(
      [
        serie("2026-06-27", 100, 10),
        serie("2026-07-04", 110, 10),
        serie("2026-07-11", 110, 10),
        serie("2026-07-18", 110, 10),
        serie("2026-07-25", 110, 10),
        serie("2026-08-01", 110, 10),
      ],
      AUJOURDHUI,
    )!;

    expect(regulier.progressionPct).toBeCloseTo(unBond.progressionPct, 0);
    expect(regulier.ameliorations).toBe(5);
    expect(unBond.ameliorations).toBe(1);
    expect(regulier.score).toBeGreaterThan(unBond.score);
  });

  it("fait reculer une progression ancienne face à une progression récente", () => {
    const recent = progressionDeLExercice(serieProgressive(6, 100, 2, 10, "2026-08-01"), AUJOURDHUI)!;
    const ancien = progressionDeLExercice(serieProgressive(6, 100, 2, 10, "2026-05-01"), AUJOURDHUI)!;
    expect(recent.score).toBeGreaterThan(ancien.score);
    expect(ancien.composantes.recence).toBe(0);
  });
});

describe("ce qui compte comme une amélioration", () => {
  it("compte une hausse de répétitions à charge égale", () => {
    const p = progressionDeLExercice(
      [
        serie("2026-07-18", 60, 8),
        serie("2026-07-25", 60, 10),
        serie("2026-08-01", 60, 12),
      ],
      AUJOURDHUI,
    )!;
    expect(p.ameliorations).toBe(2);
    expect(p.progressionPct).toBeGreaterThan(0);
  });

  it("compte une hausse de charge à répétitions comparables", () => {
    const p = progressionDeLExercice(serieProgressive(3, 60, 5), AUJOURDHUI)!;
    expect(p.ameliorations).toBe(2);
    expect(p.meilleureSerie.charge).toBe(70);
  });

  it("compte une réserve plus grande à performance égale, quand le RPE est fiable", () => {
    // Même charge, mêmes répétitions, mais deux répétitions de plus en réserve :
    // la même série est devenue plus facile.
    const p = progressionDeLExercice(
      [
        serie("2026-07-18", 60, 10, 0),
        serie("2026-07-25", 60, 10, 1),
        serie("2026-08-01", 60, 10, 2),
      ],
      AUJOURDHUI,
    )!;
    expect(p.reserveUtilisee).toBe(true);
    expect(p.ameliorations).toBe(2);
    expect(p.progressionPct).toBeGreaterThan(0);
  });

  it("ignore la réserve quand elle est trop lacunaire", () => {
    // Une seule série sur trois porte un RPE : la prendre en compte ferait
    // gagner la séance où on a pensé à le noter, pas celle où on a progressé.
    const p = progressionDeLExercice(
      [
        serie("2026-07-18", 60, 10),
        serie("2026-07-25", 60, 10),
        serie("2026-08-01", 60, 10, 4),
      ],
      AUJOURDHUI,
    );
    expect(p).toBeNull();
  });

  it("ne retient pas un exercice qui n'a jamais rien dépassé", () => {
    const p = progressionDeLExercice(
      [
        serie("2026-07-18", 60, 10),
        serie("2026-07-25", 60, 10),
        serie("2026-08-01", 60, 10),
      ],
      AUJOURDHUI,
    );
    expect(p).toBeNull();
  });
});

describe("métriques brutes conservées", () => {
  it("rend l'historique nécessaire à l'affichage détaillé", () => {
    const p = progressionDeLExercice(serieProgressive(4, 60, 5), AUJOURDHUI)!;
    expect(p.seances).toBe(4);
    expect(p.ameliorations).toBe(3);
    expect(p.premiereSeance).toBe("2026-07-11");
    expect(p.derniereAmelioration).toBe("2026-08-01");
    expect(p.joursDepuisAmelioration).toBe(2);
    expect(p.e1rmDebut).toBeGreaterThan(0);
    expect(p.e1rmActuel).toBeGreaterThan(p.e1rmDebut);
    expect(p.meilleureSerie).toEqual({ charge: 75, reps: 10, date: "2026-08-01" });
    // Le pourcentage reste disponible, il ne sert simplement plus à classer.
    expect(p.progressionPct).toBeCloseTo(25, 0);
  });

  it("expose ses composantes pour qu'un ordre reste explicable", () => {
    const p = progressionDeLExercice(serieProgressive(8, 100, 2), AUJOURDHUI)!;
    expect(Object.keys(p.composantes).sort()).toEqual(
      ["ampleur", "confiance", "recence", "regularite"],
    );
    expect(p.composantes.confiance).toBe(1);
    for (const v of Object.values(p.composantes)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(p.score).toBeLessThanOrEqual(100);
  });
});
