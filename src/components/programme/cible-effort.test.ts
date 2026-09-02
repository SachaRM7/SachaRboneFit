import { describe, it, expect } from "vitest";
import {
  CHOIX_CIBLE_EFFORT,
  NON_PRESCRIT,
  choixDepuisCible,
  cibleDepuisChoix,
  libelleCibleEffort,
} from "./cible-effort";
import { CHOIX_RESERVE, reserveVersRpe, rpeVersReserve } from "@/lib/engine/reserve";

/**
 * Le défaut que ce chantier corrige, côté programme.
 *
 * Le menu « RPE cible » s'ouvrait sur 8 et n'offrait aucune option vide : tout
 * exercice ajouté à la main partait avec une prescription que personne n'avait
 * formulée, et il fallait retirer puis recréer l'exercice pour la corriger.
 */

describe("l'effort cible est facultatif", () => {
  it("1 — « Non prescrit » est la première option du menu", () => {
    expect(CHOIX_CIBLE_EFFORT[0]?.valeur).toBe(NON_PRESCRIT);
    expect(CHOIX_CIBLE_EFFORT[0]?.libelle).toBe("Non prescrit");
  });

  it("2 — « Non prescrit » donne null, jamais un nombre de repli", () => {
    expect(cibleDepuisChoix(NON_PRESCRIT)).toBeNull();
    // Le contrôle négatif du chantier : si un `?? 8` revenait ici, ceci casse.
    expect(cibleDepuisChoix(NON_PRESCRIT)).not.toBe(8);
  });

  it("3 — le menu propose une réserve, pas un RPE", () => {
    const libelles = CHOIX_CIBLE_EFFORT.map((c) => c.libelle);
    expect(libelles).toEqual([
      "Non prescrit",
      "5 reps en réserve",
      "4 reps en réserve",
      "3 reps en réserve",
      "2 reps en réserve",
      "1 rep en réserve",
      "0 rep en réserve",
    ]);
    // Aucun RPE ne s'affiche : l'échelle qu'on ne sait pas lire reste en base.
    for (const l of libelles) expect(l).not.toMatch(/RPE/i);
  });

  it("4 — chaque réserve offerte se convertit avec la fonction du moteur", () => {
    for (const reserve of CHOIX_RESERVE) {
      expect(cibleDepuisChoix(String(reserve))).toBe(reserveVersRpe(reserve));
    }
    // Et concrètement : 2 reps en réserve, c'est RPE 8.
    expect(cibleDepuisChoix("2")).toBe(8);
    expect(cibleDepuisChoix("0")).toBe(10);
    expect(cibleDepuisChoix("5")).toBe(5);
  });

  it("5 — une cible enregistrée revient sélectionnée dans le menu", () => {
    expect(choixDepuisCible(8)).toBe("2");
    expect(choixDepuisCible(10)).toBe("0");
    expect(choixDepuisCible(null)).toBe(NON_PRESCRIT);
    expect(choixDepuisCible(undefined)).toBe(NON_PRESCRIT);
  });

  it("6 — l'aller-retour menu → base → menu ne déforme rien", () => {
    for (const choix of CHOIX_CIBLE_EFFORT.map((c) => c.valeur)) {
      expect(choixDepuisCible(cibleDepuisChoix(choix))).toBe(choix);
    }
  });
});

describe("22 — une seule conversion, celle du moteur", () => {
  it("la table du menu est exactement `reserveVersRpe`", () => {
    // Aucune seconde correspondance : deux conversions qui divergent d'un
    // demi-point suffiraient à faire mentir l'historique.
    const offertes = CHOIX_CIBLE_EFFORT.filter((c) => c.valeur !== NON_PRESCRIT);
    for (const c of offertes) {
      const rpe = cibleDepuisChoix(c.valeur)!;
      expect(rpe).toBe(reserveVersRpe(Number(c.valeur)));
      expect(rpeVersReserve(rpe)).toBe(Number(c.valeur));
    }
  });

  it("une valeur de menu inconnue ne fabrique pas de cible", () => {
    expect(cibleDepuisChoix("n'importe quoi")).toBeNull();
    expect(cibleDepuisChoix(null)).toBeNull();
    expect(cibleDepuisChoix(undefined)).toBeNull();
  });
});

describe("ce qui s'affiche à côté d'un exercice", () => {
  it("sans cible, l'écran le dit au lieu de se taire", () => {
    expect(libelleCibleEffort(null)).toBe("Effort : non prescrit");
    expect(libelleCibleEffort(undefined)).toBe("Effort : non prescrit");
    // Surtout : aucun RPE 8 affiché là où rien n'est prescrit.
    expect(libelleCibleEffort(null)).not.toMatch(/8/);
  });

  it("avec une cible, il parle réserve", () => {
    expect(libelleCibleEffort(8)).toBe("Effort : 2 reps en réserve");
    expect(libelleCibleEffort(9)).toBe("Effort : 1 rep en réserve");
    expect(libelleCibleEffort(10)).toBe("Effort : 0 rep en réserve");
  });

  it("une donnée ancienne en demi-point s'affiche sans planter", () => {
    // L'ancien menu proposait 7,5 : ces lignes existent en base et ne sont
    // pas corrigées automatiquement.
    expect(libelleCibleEffort(7.5)).toBe("Effort : 3 reps en réserve");
  });
});
