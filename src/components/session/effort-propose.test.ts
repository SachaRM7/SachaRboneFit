import { describe, it, expect } from "vitest";
import { champEffortPropose, effortPropose, effortSaisi } from "./effort-propose";
import { rpeVersReserve } from "@/lib/engine/reserve";

/**
 * Le bug prioritaire de ce chantier, en séance.
 *
 * Le tableau de séries pré-remplissait la colonne RPE avec
 * `Math.max(6, (exercice.rpeCible ?? 8) - rpeReduction)`, et cette valeur
 * partait en base à la validation, touchée ou non. Chaque exercice sans cible
 * — tous ceux que propose le Coach — produisait donc des `rpe_effectif` de 8
 * que personne n'avait ressentis.
 */

describe("sans cible d'effort, rien n'est proposé", () => {
  it("7 — une cible absente ne propose aucun effort", () => {
    expect(effortPropose(null, 0)).toBeNull();
    expect(effortPropose(undefined, 0)).toBeNull();
    // Le contrôle négatif : réintroduire `?? 8` fait échouer cette ligne.
    expect(effortPropose(null, 0)).not.toBe(8);
  });

  it("8 — le champ de saisie reste vide", () => {
    expect(champEffortPropose(null, 0)).toBe("");
    expect(champEffortPropose(undefined, 2)).toBe("");
  });

  it("9 — un champ vide validé enregistre une absence, pas un nombre", () => {
    // « L'absence de saisie doit rester une absence de donnée. »
    expect(effortSaisi("")).toBeNull();
    expect(effortSaisi("   ")).toBeNull();
    expect(effortSaisi("abc")).toBeNull();
  });

  it("10 — une saisie réelle est enregistrée telle quelle", () => {
    expect(effortSaisi("9")).toBe(9);
    expect(effortSaisi("7,5")).toBe(7.5);
    expect(effortSaisi("7.5")).toBe(7.5);
  });
});

describe("avec une cible d'effort, elle est proposée", () => {
  it("11 — sans réduction, la cible est proposée telle quelle", () => {
    expect(effortPropose(8, 0)).toBe(8);
    expect(champEffortPropose(8, 0)).toBe("8");
  });

  it("12 — la proposition n'est qu'un point de départ : la saisie prime", () => {
    // Ce que le champ propose et ce qui part en base sont deux choses : la
    // seconde ne lit que le champ.
    expect(effortSaisi(champEffortPropose(9, 0))).toBe(9);
    expect(effortSaisi(champEffortPropose(null, 0))).toBeNull();
  });
});

describe("la réduction module une cible, elle n'en crée pas", () => {
  it("elle s'applique à une cible existante", () => {
    expect(effortPropose(9, 1)).toBe(8);
    expect(effortPropose(8, 1.5)).toBe(6.5);
  });

  it("elle ne descend pas sous le plancher", () => {
    expect(effortPropose(8, 5)).toBe(6);
  });

  it("elle laisse null à null, quelle que soit sa valeur", () => {
    // Contrôle négatif : transformer null en valeur via `rpeReduction` casse ici.
    for (const reduction of [0, 0.5, 1, 2, 3]) {
      expect(effortPropose(null, reduction)).toBeNull();
      expect(champEffortPropose(null, reduction)).toBe("");
    }
  });
});

describe("en calibration, le menu réserve n'invente pas de réponse", () => {
  it("un champ vide ne sélectionne aucune réserve", () => {
    // Le menu se posait sur « 2 » sans que personne l'ait choisi, et cette
    // réserve non choisie devenait un RPE 8.
    expect(rpeVersReserve(effortSaisi(""))).toBeNull();
  });

  it("une cible de calibration se retrouve dans le menu", () => {
    // `RPE_CALIBRATION = 7`, inchangé par ce chantier : 3 reps en réserve.
    expect(rpeVersReserve(effortSaisi(champEffortPropose(7, 0)))).toBe(3);
  });
});
