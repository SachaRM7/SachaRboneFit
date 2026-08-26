import { describe, it, expect } from "vitest";
import { computeNextSets, type ExerciseTarget } from "./double-progression";

const cible: ExerciseTarget = {
  fourchetteRepsMin: 6,
  fourchetteRepsMax: 8,
  seriesCibles: 3,
  incrementsPossibles: [2.5, 5],
};

describe("double progression", () => {
  it("sans historique, propose le bas de fourchette et aucune charge", () => {
    const r = computeNextSets(null, cible);
    expect(r.charge).toBe(0);
    expect(r.reps).toEqual([6, 6, 6]);
    expect(r.fourchetteCompletee).toBe(false);
    expect(r.messageProgression).toBeNull();
  });

  it("toutes les series au max : ajoute le plus petit increment et redescend en bas de fourchette", () => {
    const r = computeNextSets(
      { sets: [
        { numero: 1, reps: 8, charge: 80 },
        { numero: 2, reps: 8, charge: 80 },
        { numero: 3, reps: 8, charge: 80 },
      ] },
      cible,
    );
    expect(r.charge).toBe(82.5);
    expect(r.reps).toEqual([6, 6, 6]);
    expect(r.fourchetteCompletee).toBe(true);
    expect(r.messageProgression).toContain("82.5");
  });

  it("fourchette non completee : garde la charge et ajoute une rep sur la premiere serie non maximale", () => {
    const r = computeNextSets(
      { sets: [
        { numero: 1, reps: 8, charge: 80 },
        { numero: 2, reps: 7, charge: 80 },
        { numero: 3, reps: 6, charge: 80 },
      ] },
      cible,
    );
    expect(r.charge).toBe(80);
    expect(r.reps).toEqual([8, 8, 6]);
    expect(r.fourchetteCompletee).toBe(false);
  });

  it("ne depasse jamais le haut de fourchette", () => {
    const r = computeNextSets(
      { sets: [{ numero: 1, reps: 7, charge: 60 }, { numero: 2, reps: 8, charge: 60 }, { numero: 3, reps: 8, charge: 60 }] },
      cible,
    );
    expect(Math.max(...r.reps)).toBeLessThanOrEqual(cible.fourchetteRepsMax);
  });

  it("depassement du haut de fourchette : traite comme fourchette completee", () => {
    const r = computeNextSets(
      { sets: [{ numero: 1, reps: 10, charge: 50 }, { numero: 2, reps: 9, charge: 50 }, { numero: 3, reps: 8, charge: 50 }] },
      cible,
    );
    expect(r.fourchetteCompletee).toBe(true);
    expect(r.charge).toBe(52.5);
  });

  it("sans increment declare, retombe sur 2.5 kg", () => {
    const r = computeNextSets(
      { sets: [{ numero: 1, reps: 8, charge: 40 }, { numero: 2, reps: 8, charge: 40 }, { numero: 3, reps: 8, charge: 40 }] },
      { ...cible, incrementsPossibles: [] },
    );
    expect(r.charge).toBe(42.5);
  });

  it("historique vide : se comporte comme une absence d'historique", () => {
    const r = computeNextSets({ sets: [] }, cible);
    expect(r.charge).toBe(0);
    expect(r.fourchetteCompletee).toBe(false);
  });
});
