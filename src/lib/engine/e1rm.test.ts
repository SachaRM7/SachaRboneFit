import { describe, it, expect } from "vitest";
import {
  estimer1RM,
  estimer1RMDepuisRpe,
  estimer1RMSansReserve,
  reserveDepuisRpe,
  REPS_EFFECTIVES_MAXIMALES,
} from "./records";
import { estimer1RM as estimer1RMCalibration } from "./calibration";
import { progressionDeLExercice } from "./score-progression";
import { bilanProgression } from "./bilan-progression";

/**
 * Une seule définition du maximum estimé.
 *
 * La formule d'Epley vivait en sept exemplaires divergents : certains
 * ignoraient la réserve, d'autres arrondissaient à la source, d'autres encore
 * oubliaient la garde sur une série d'une répétition. Deux écrans pouvaient
 * donc désigner deux « meilleures séries » différentes pour le même historique.
 *
 * Ce que ces tests fixent : les mêmes données produisent le même maximum
 * partout où l'application prétend mesurer la même chose.
 */

const SERIE = { date: "2026-08-01", charge: 100, reps: 10 };

describe("définition de référence", () => {
  it("compte la réserve dans les répétitions effectives", () => {
    // 10 répétitions à RIR 3 informent autant qu'une série de 13.
    expect(estimer1RM({ ...SERIE, rir: 3 })).toBeCloseTo(estimer1RM({ ...SERIE, reps: 13 }), 10);
  });

  it("ne dérive pas sur les séries très longues", () => {
    const long = estimer1RM({ ...SERIE, reps: 40 });
    const plafond = estimer1RM({ ...SERIE, reps: REPS_EFFECTIVES_MAXIMALES });
    expect(long).toBe(plafond);
  });

  it("rend la charge telle quelle pour un vrai maximum à une répétition", () => {
    // Sans cette garde, un maximum de 100 kg était rapporté à 103,3 kg.
    expect(estimer1RM({ ...SERIE, reps: 1 })).toBe(100);
    expect(estimer1RM({ ...SERIE, reps: 1, rir: 0 })).toBe(100);
  });

  it("refuse une série vide plutôt que de rendre un nombre", () => {
    expect(estimer1RM({ ...SERIE, charge: 0 })).toBe(0);
    expect(estimer1RM({ ...SERIE, reps: 0 })).toBe(0);
  });

  it("n'arrondit pas : l'arrondi appartient à l'affichage", () => {
    expect(estimer1RM({ ...SERIE, reps: 7 })).not.toBe(Math.round(estimer1RM({ ...SERIE, reps: 7 })));
  });
});

describe("réserve déduite du RPE", () => {
  it("traduit le RPE en répétitions restantes", () => {
    expect(reserveDepuisRpe(8)).toBe(2);
    expect(reserveDepuisRpe(10)).toBe(0);
    expect(reserveDepuisRpe(6.5)).toBe(4);
  });

  it("ne descend pas sous zéro et laisse passer l'absence de RPE", () => {
    expect(reserveDepuisRpe(11)).toBe(0);
    expect(reserveDepuisRpe(null)).toBeNull();
    expect(reserveDepuisRpe(undefined)).toBeNull();
    expect(reserveDepuisRpe(Number.NaN)).toBeNull();
  });
});

describe("les variantes sont nommées, jamais implicites", () => {
  it("l'entrée « colonnes de la base » donne le même résultat que la référence", () => {
    expect(estimer1RMDepuisRpe(100, 10, 8)).toBe(estimer1RM({ ...SERIE, rir: 2 }));
  });

  it("sans RPE, elle retombe exactement sur la variante sans réserve", () => {
    expect(estimer1RMDepuisRpe(100, 10, null)).toBe(estimer1RMSansReserve(100, 10));
  });

  it("la variante sans réserve sous-estime, et c'est son objet", () => {
    // Son nom dit ce qu'elle fait : elle ignore la marge avant l'échec.
    expect(estimer1RMSansReserve(100, 10)).toBeLessThan(estimer1RMDepuisRpe(100, 10, 8));
  });

  it("la calibration mesure exactement comme la référence", () => {
    const parCalibration = estimer1RMCalibration({ charge: 100, reps: 10, rirRapporte: 3 });
    expect(parCalibration).toBe(estimer1RM({ ...SERIE, rir: 3 }));
  });
});

describe("un même historique, un même maximum partout", () => {
  /** Trois séances identiques, décrites comme chaque surface les reçoit. */
  const DATES = ["2026-07-13", "2026-07-20", "2026-07-27"];
  const CHARGES = [100, 105, 110];
  const RPE = 8;

  it("progression et bilan lisent le même maximum de départ et d'arrivée", () => {
    const series = DATES.map((date, i) => ({
      date, charge: CHARGES[i]!, reps: 10, rir: reserveDepuisRpe(RPE),
    }));

    const parScore = progressionDeLExercice(series, "2026-08-03")!;
    const bilan = bilanProgression({
      aujourdhui: "2026-08-03",
      seances: DATES.map((date) => ({ date, dureeMinutes: 60 })),
      series: DATES.map((date, i) => ({
        date,
        exerciseInstanceId: "i",
        exerciceNom: "Développé",
        charge: CHARGES[i]!,
        reps: 10,
        rir: reserveDepuisRpe(RPE),
        musclesPrincipaux: ["pectoraux"],
        musclesSecondaires: [],
      })),
      stagnations: [],
      frequenceMinParSemaine: 2,
      frequenceCibleParSemaine: 3,
      frequenceMaxParSemaine: 4,
    });

    expect(bilan.enProgression).toHaveLength(1);
    expect(bilan.enProgression[0]!.e1rmDebut).toBe(parScore.e1rmDebut);
    expect(bilan.enProgression[0]!.e1rmActuel).toBe(parScore.e1rmActuel);
    // Et ce maximum est bien celui de la définition de référence.
    expect(parScore.e1rmActuel).toBe(
      Math.round(estimer1RMDepuisRpe(110, 10, RPE) * 10) / 10,
    );
  });

  it("une réserve bien documentée change le maximum, une réserve absente non", () => {
    const avec = DATES.map((date, i) => ({ date, charge: CHARGES[i]!, reps: 10, rir: 2 }));
    const sans = DATES.map((date, i) => ({ date, charge: CHARGES[i]!, reps: 10, rir: null }));

    const a = progressionDeLExercice(avec, "2026-08-03")!;
    const b = progressionDeLExercice(sans, "2026-08-03")!;

    expect(a.reserveUtilisee).toBe(true);
    expect(b.reserveUtilisee).toBe(false);
    expect(a.e1rmActuel).toBeGreaterThan(b.e1rmActuel);
    // Le gain relatif, lui, ne dépend pas de la réserve : elle décale les deux
    // bornes de la même façon.
    expect(a.progressionPct).toBeCloseTo(b.progressionPct, 5);
  });

  it("des données anciennes sans RPE restent exploitables", () => {
    const sansRpe = DATES.map((date, i) => ({ date, charge: CHARGES[i]!, reps: 10, rir: null }));
    const p = progressionDeLExercice(sansRpe, "2026-08-03")!;
    // Le score arrondit à la décimale, pas à l'unité.
    const auDixieme = (v: number) => Math.round(v * 10) / 10;
    expect(p.e1rmDebut).toBe(auDixieme(estimer1RMSansReserve(100, 10)));
    expect(p.ameliorations).toBe(2);
  });
});

describe("le seuil de couverture du RPE, inchangé et centralisé", () => {
  it("reste celui du score de progression", async () => {
    const { POIDS } = await import("./score-progression");
    // Valeur provisoire assumée, à réévaluer sur données réelles — pas ici.
    expect(POIDS.partRpeSuffisante).toBe(0.6);
  });

  it("accepte la réserve au-dessus du seuil, la refuse en dessous", async () => {
    const { reserveFiable } = await import("./score-progression");
    const serie = (rir: number | null) => ({ date: "", charge: 100, reps: 10, rir });

    // 2 sur 3 : au-dessus de 60 %.
    expect(reserveFiable([serie(2), serie(2), serie(null)])).toBe(true);
    // 1 sur 3 : en dessous — la réserve ne doit pas décider.
    expect(reserveFiable([serie(2), serie(null), serie(null)])).toBe(false);
  });
});
