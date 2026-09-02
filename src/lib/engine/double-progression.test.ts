import { describe, it, expect } from "vitest";
import { computeNextSets, type ExerciseTarget } from "./double-progression";
import { CHARGE_INCONNUE } from "./charges";

const cible: ExerciseTarget = {
  fourchetteRepsMin: 6,
  fourchetteRepsMax: 8,
  seriesCibles: 3,
  charge: { ...CHARGE_INCONNUE, incrementsPossibles: [2.5, 5] },
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

  it("sans increment declare, ne propose aucune charge", () => {
    // Le module retombait sur 2,5 kg : une machine dont personne n'avait
    // regardé la pile recevait donc une prescription au chiffre près. La
    // fourchette est bien complétée, et c'est tout ce qu'on peut affirmer.
    const r = computeNextSets(
      { sets: [{ numero: 1, reps: 8, charge: 40 }, { numero: 2, reps: 8, charge: 40 }, { numero: 3, reps: 8, charge: 40 }] },
      { ...cible, charge: CHARGE_INCONNUE },
    );
    expect(r.charge).toBeNull();
    expect(r.fourchetteCompletee).toBe(true);
    expect(r.messageProgression).toMatch(/ne sont pas renseignés/);
  });

  it("historique vide : se comporte comme une absence d'historique", () => {
    const r = computeNextSets({ sets: [] }, cible);
    expect(r.charge).toBe(0);
    expect(r.fourchetteCompletee).toBe(false);
  });
});

describe("le RPE entre dans la décision", () => {
  // Il était saisi à chaque série, stocké, et lu par aucun module : compléter la
  // fourchette à RPE 10 et à RPE 7 déclenchait la même augmentation.

  it("fourchette complétée à effort modéré : progression normale", () => {
    const r = computeNextSets(
      { sets: [
        { numero: 1, reps: 8, charge: 80, rpe: 7 },
        { numero: 2, reps: 8, charge: 80, rpe: 7.5 },
        { numero: 3, reps: 8, charge: 80, rpe: 8 },
      ] },
      cible,
    );
    expect(r.charge).toBe(82.5);
    expect(r.consolidation).toBe(false);
    expect(r.messageProgression).toContain("+2.5 kg");
  });

  it("fourchette complétée à effort maximal : on charge quand même, mais on prévient", () => {
    const r = computeNextSets(
      { sets: [
        { numero: 1, reps: 8, charge: 80, rpe: 9.5 },
        { numero: 2, reps: 8, charge: 80, rpe: 10 },
        { numero: 3, reps: 8, charge: 80, rpe: 10 },
      ] },
      cible,
    );
    expect(r.charge).toBe(82.5);
    expect(r.fourchetteCompletee).toBe(true);
    expect(r.messageProgression).toContain("piquer");
  });

  it("fourchette non complétée à effort maximal : on répète, on n'ajoute rien", () => {
    // Ajouter du travail sur un effort déjà maximal ne produit pas de progression.
    const r = computeNextSets(
      { sets: [
        { numero: 1, reps: 7, charge: 80, rpe: 10 },
        { numero: 2, reps: 6, charge: 80, rpe: 10 },
        { numero: 3, reps: 6, charge: 80, rpe: 10 },
      ] },
      cible,
    );
    expect(r.consolidation).toBe(true);
    expect(r.charge).toBe(80);
    expect(r.reps).toEqual([7, 6, 6]);
    expect(r.messageProgression).toContain("sans ajouter");
  });

  it("fourchette non complétée à effort modéré : une répétition de plus", () => {
    const r = computeNextSets(
      { sets: [
        { numero: 1, reps: 7, charge: 80, rpe: 7 },
        { numero: 2, reps: 7, charge: 80, rpe: 7.5 },
        { numero: 3, reps: 7, charge: 80, rpe: 8 },
      ] },
      cible,
    );
    expect(r.consolidation).toBe(false);
    expect(r.reps).toEqual([8, 7, 7]);
  });

  it("sans RPE enregistré, le comportement historique est conservé", () => {
    const r = computeNextSets(
      { sets: [
        { numero: 1, reps: 7, charge: 80 },
        { numero: 2, reps: 7, charge: 80 },
        { numero: 3, reps: 7, charge: 80 },
      ] },
      cible,
    );
    expect(r.consolidation).toBe(false);
    expect(r.reps).toEqual([8, 7, 7]);
  });

  it("le seuil est à 9,5 : à 9 on progresse encore", () => {
    const auSeuil = (rpe: number) => computeNextSets(
      { sets: [
        { numero: 1, reps: 7, charge: 80, rpe },
        { numero: 2, reps: 7, charge: 80, rpe },
        { numero: 3, reps: 7, charge: 80, rpe },
      ] },
      cible,
    );
    expect(auSeuil(9).consolidation).toBe(false);
    expect(auSeuil(9.5).consolidation).toBe(true);
  });
});

/**
 * Une référence n'est comparable que si elle porte les séries qu'on lui avait
 * demandées.
 *
 * Le défaut corrigé : `sets.every(...)` portait sur les séries PRÉSENTES. Une
 * seule série au haut de fourchette — les deux autres jamais faites — concluait
 * « fourchette complétée » et montait la charge. Reproductible sans base de
 * données, et aucun des treize cas ci-dessus ne le couvrait : ils utilisent tous
 * exactement trois séries pour une cible de trois.
 *
 * `seriesAttendues` est `session_plan_items.series_cibles` de la séance de
 * référence, donc le nombre APRÈS les adaptations déterministes de volume. Une
 * réduction décidée par le moteur est une prescription légitime : qui l'a
 * respectée a fait ce qu'on lui demandait.
 */
describe("référence tronquée", () => {
  const auMax = (n: number, rpe?: number) =>
    Array.from({ length: n }, (_, i) => ({
      numero: i + 1, reps: 8, charge: 80, ...(rpe === undefined ? {} : { rpe }),
    }));

  it("une seule série sur trois attendues : aucune montée de charge", () => {
    const r = computeNextSets({ sets: auMax(1), seriesAttendues: 3 }, cible);
    expect(r.fourchetteCompletee).toBe(false);
    expect(r.charge).toBe(80);
    expect(r.consolidation).toBe(true);
  });

  it("les trois séries attendues : la montée a lieu, comme avant", () => {
    const r = computeNextSets({ sets: auMax(3), seriesAttendues: 3 }, cible);
    expect(r.fourchetteCompletee).toBe(true);
    expect(r.charge).toBe(82.5);
    expect(r.consolidation).toBe(false);
  });

  it("plus de séries que demandé : on ne punit pas le travail en plus", () => {
    const r = computeNextSets({ sets: auMax(4), seriesAttendues: 3 }, cible);
    expect(r.fourchetteCompletee).toBe(true);
    expect(r.charge).toBe(82.5);
  });

  it("volume réduit par le moteur : deux séries demandées, deux faites → montée", () => {
    // Le cœur de la règle. La réduction vient du moteur ; l'athlète a fait ce
    // qu'on lui demandait. Lui compter la série retirée serait faux.
    const r = computeNextSets({ sets: auMax(2), seriesAttendues: 2 }, cible);
    expect(r.fourchetteCompletee).toBe(true);
    expect(r.charge).toBe(82.5);
  });

  it("nombre attendu inconnu : comportement historique, strictement", () => {
    const sansRien = computeNextSets({ sets: auMax(1) }, cible);
    const avecNull = computeNextSets({ sets: auMax(1), seriesAttendues: null }, cible);
    // Comportement d'avant le correctif : une série au max suffisait à monter.
    expect(sansRien.fourchetteCompletee).toBe(true);
    expect(sansRien.charge).toBe(82.5);
    expect(avecNull).toEqual(sansRien);
  });

  it("valeur attendue absurde : traitée comme inconnue plutôt que bloquante", () => {
    for (const attendues of [0, -1, Number.NaN]) {
      const r = computeNextSets({ sets: auMax(1), seriesAttendues: attendues }, cible);
      expect(r.fourchetteCompletee).toBe(true);
    }
  });

  it("tronquée sans être au maximum : le chemin « +1 répétition » ne bouge pas", () => {
    const r = computeNextSets(
      { sets: [{ numero: 1, reps: 7, charge: 80, rpe: 7 }], seriesAttendues: 3 },
      cible,
    );
    expect(r.consolidation).toBe(false);
    expect(r.reps).toEqual([8]);
    expect(r.messageProgression).toBeNull();
  });

  it("tronquée à effort maximal : la consolidation RPE l'emporte, sans doubler le message", () => {
    const r = computeNextSets({ sets: auMax(1, 10), seriesAttendues: 3 }, cible);
    expect(r.consolidation).toBe(true);
    expect(r.charge).toBe(80);
    expect(r.messageProgression).toContain("sans ajouter");
    expect(r.messageProgression).not.toContain("séance entière");
  });

  it("le message dit ce qui manque, et redemande la séance entière", () => {
    const r = computeNextSets({ sets: auMax(1), seriesAttendues: 3 }, cible);
    expect(r.messageProgression).toContain("1 série sur 3");
    expect(r.messageProgression).toContain("séance entière");
    // On redemande le format prescrit, pas le format tronqué.
    expect(r.reps).toEqual([8, 8, 8]);
  });

  it("le pluriel suit le nombre de séries faites", () => {
    const r = computeNextSets({ sets: auMax(2), seriesAttendues: 4 }, cible);
    expect(r.messageProgression).toContain("2 séries sur 4");
  });
});
