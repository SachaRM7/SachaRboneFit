import { describe, it, expect } from "vitest";
import {
  executionReelle, faitEffort, faitRepos, faitTempo, faitVolume,
} from "./execution-reelle";

/**
 * Ce module rapproche le prescrit du réalisé, et s'arrête là.
 *
 * Ce que ces tests verrouillent avant tout, c'est ce qu'il NE fait PAS : aucun
 * verdict « respecté », aucun seuil, aucun zéro à la place d'une absence. Un
 * signal manquant reste manquant — c'est la seule façon de ne pas transformer
 * une convention en mesure.
 */

describe("effort : la cible, le réel, et l'écart signé", () => {
  it("cible 8, réel 9 : +1", () => {
    const f = faitEffort({ rpeCible: 8, rpeReels: [9] });
    expect(f.rpeCible).toBe(8);
    expect(f.rpeReel).toBe(9);
    expect(f.ecartRpe).toBe(1);
  });

  it("cible 8, réel 7 : −1, le signe est conservé", () => {
    // Plus dur que prévu et plus facile que prévu sont deux informations
    // différentes. Une valeur absolue les confondrait.
    expect(faitEffort({ rpeCible: 8, rpeReels: [7] }).ecartRpe).toBe(-1);
  });

  it("cible absente : écart inconnu, jamais zéro", () => {
    const f = faitEffort({ rpeCible: null, rpeReels: [9] });
    expect(f.rpeCible).toBeNull();
    expect(f.rpeReel).toBe(9);
    expect(f.ecartRpe).toBeNull();
  });

  it("réel absent : écart inconnu", () => {
    const f = faitEffort({ rpeCible: 8, rpeReels: [null, undefined] });
    expect(f.rpeReel).toBeNull();
    expect(f.ecartRpe).toBeNull();
  });

  it("le réel est la moyenne des séries renseignées, les trous ignorés", () => {
    const f = faitEffort({ rpeCible: 8, rpeReels: [8, null, 9] });
    expect(f.rpeReel).toBe(8.5);
    expect(f.ecartRpe).toBe(0.5);
  });

  it("aucun booléen n'est produit", () => {
    const f = faitEffort({ rpeCible: 8, rpeReels: [10] });
    expect(Object.keys(f).sort()).toEqual(["ecartRpe", "rpeCible", "rpeReel"]);
    expect(Object.values(f).some((v) => typeof v === "boolean")).toBe(false);
  });

  it("un écart nul est un écart, pas un verdict", () => {
    expect(faitEffort({ rpeCible: 8, rpeReels: [8] }).ecartRpe).toBe(0);
  });
});

describe("tempo : signalé ou inconnu, jamais déduit", () => {
  it("un signalement de non-respect est conservé", () => {
    expect(faitTempo({ prescrit: "3-0-1-0", respects: [false, false] }).respecte).toBe(false);
  });

  it("un `true` déjà en base est lu tel quel", () => {
    // La colonne existe depuis l'origine ; rien ne la produit aujourd'hui, mais
    // une valeur présente n'est pas jetée.
    expect(faitTempo({ prescrit: "3-0-1-0", respects: [true, true] }).respecte).toBe(true);
  });

  it("rien de dit reste inconnu — jamais promu en respecté", () => {
    expect(faitTempo({ prescrit: "3-0-1-0", respects: [null, undefined] }).respecte).toBeNull();
  });

  it("une seule série signalée hors tempo suffit à dire non", () => {
    // On ne moyenne pas des booléens : « une série hors tempo » est
    // l'information, pas « la majorité l'était ».
    expect(faitTempo({ prescrit: "3-0-1-0", respects: [true, false, true] }).respecte).toBe(false);
  });

  it("aucun tempo prescrit : rien à respecter", () => {
    expect(faitTempo({ prescrit: null, respects: [] }).prescrit).toBeNull();
    expect(faitTempo({ prescrit: "   ", respects: [] }).prescrit).toBeNull();
  });
});

describe("repos : un intervalle observé, pas un verdict", () => {
  it("écart en secondes et en pourcentage", () => {
    const f = faitRepos({ prescritSecondes: 120, observations: [null, 150, 150] });
    expect(f.prescritSecondes).toBe(120);
    expect(f.observeSecondes).toBe(150);
    expect(f.ecartSecondes).toBe(30);
    expect(f.ecartPourcent).toBe(25);
  });

  it("un repos plus court donne un écart négatif", () => {
    const f = faitRepos({ prescritSecondes: 120, observations: [60] });
    expect(f.ecartSecondes).toBe(-60);
    expect(f.ecartPourcent).toBe(-50);
  });

  it("aucune observation : inconnu, jamais 0 seconde", () => {
    const f = faitRepos({ prescritSecondes: 120, observations: [null, null] });
    expect(f.observeSecondes).toBeNull();
    expect(f.ecartSecondes).toBeNull();
    expect(f.ecartPourcent).toBeNull();
  });

  it("aucune prescription : écart inconnu plutôt qu'infini", () => {
    const f = faitRepos({ prescritSecondes: null, observations: [90] });
    expect(f.observeSecondes).toBe(90);
    expect(f.ecartSecondes).toBeNull();
    expect(f.ecartPourcent).toBeNull();
  });

  it("une prescription nulle vaut absence, pas division par zéro", () => {
    const f = faitRepos({ prescritSecondes: 0, observations: [90] });
    expect(f.ecartPourcent).toBeNull();
    expect(Number.isFinite(f.ecartPourcent as number)).toBe(false);
  });

  it("la première série ne fausse pas la moyenne", () => {
    // Son `null` est ignoré, pas compté comme zéro.
    expect(faitRepos({ prescritSecondes: 120, observations: [null, 120] }).observeSecondes).toBe(120);
  });

  it("aucun verdict de comparabilité n'est produit", () => {
    const f = faitRepos({ prescritSecondes: 120, observations: [400] });
    expect(Object.keys(f).sort()).toEqual([
      "ecartPourcent", "ecartSecondes", "observeSecondes", "prescritSecondes",
    ]);
  });
});

describe("volume : la sémantique de PR #5, citée et non rejouée", () => {
  it("1 série sur 3 attendues : incomplète", () => {
    expect(faitVolume({ attendues: 3, realisees: 1 }).etat).toBe("incomplete");
  });

  it("3 sur 3 : complète", () => {
    expect(faitVolume({ attendues: 3, realisees: 3 }).etat).toBe("complete");
  });

  it("4 sur 3 : complète, on ne punit pas le travail en plus", () => {
    expect(faitVolume({ attendues: 3, realisees: 4 }).etat).toBe("complete");
  });

  it("attendu inconnu : inconnu, ni complète ni incomplète", () => {
    expect(faitVolume({ attendues: null, realisees: 3 }).etat).toBe("inconnu");
    expect(faitVolume({ attendues: 0, realisees: 3 }).etat).toBe("inconnu");
    expect(faitVolume({ attendues: Number.NaN, realisees: 3 }).etat).toBe("inconnu");
  });
});

describe("les quatre faits ensemble", () => {
  it("une séance ancienne, sans aucun de ces signaux, se lit sans erreur", () => {
    const f = executionReelle({
      seriesAttendues: null, rpeCible: null, tempoPrescrit: null,
      reposPrescritSecondes: null,
      series: [{ }, { }, { }],
    });
    expect(f.volume.etat).toBe("inconnu");
    expect(f.effort.ecartRpe).toBeNull();
    expect(f.tempo.respecte).toBeNull();
    expect(f.repos.ecartSecondes).toBeNull();
    expect(f.volume.realisees).toBe(3);
  });

  it("une séance complètement renseignée rend les quatre faits", () => {
    const f = executionReelle({
      seriesAttendues: 3, rpeCible: 8, tempoPrescrit: "3-0-1-0",
      reposPrescritSecondes: 120,
      series: [
        { rpe: 9, tempoRespecte: false, reposReelSecondes: null },
        { rpe: 9, tempoRespecte: false, reposReelSecondes: 140 },
        { rpe: 9, tempoRespecte: false, reposReelSecondes: 160 },
      ],
    });
    expect(f.volume.etat).toBe("complete");
    expect(f.effort.ecartRpe).toBe(1);
    expect(f.tempo.respecte).toBe(false);
    expect(f.repos.observeSecondes).toBe(150);
    expect(f.repos.ecartPourcent).toBe(25);
  });

  it("aucun agrégat, aucun score, aucun verdict global", () => {
    const f = executionReelle({
      seriesAttendues: 3, rpeCible: 8, tempoPrescrit: "3-0-1-0",
      reposPrescritSecondes: 120, series: [{ rpe: 8 }],
    });
    expect(Object.keys(f).sort()).toEqual(["effort", "repos", "tempo", "volume"]);
    const plat = JSON.stringify(f);
    for (const interdit of ["score", "equivalente", "degradee", "insuffisante", "verdict"]) {
      expect(plat).not.toContain(interdit);
    }
  });
});
