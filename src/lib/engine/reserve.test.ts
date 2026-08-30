import { describe, it, expect } from "vitest";
import {
  reserveVersRpe,
  rpeVersReserve,
  reserveExploitable,
  CHOIX_RESERVE,
  LIBELLES_RESERVE,
  RESERVE_MAX,
} from "./reserve";

describe("conversion réserve / RPE", () => {
  it("traduit la réponse de l'utilisateur en RPE", () => {
    expect(reserveVersRpe(0)).toBe(10);
    expect(reserveVersRpe(3)).toBe(7);
    expect(reserveVersRpe(5)).toBe(5);
  });

  it("ne descend jamais sous le plancher, quoi qu'on lui donne", () => {
    // « 5 ou plus » est le dernier choix : au-delà, la mesure ne dit plus rien.
    expect(reserveVersRpe(12)).toBe(10 - RESERVE_MAX);
    expect(reserveVersRpe(-3)).toBe(10);
  });

  it("fait l'aller-retour sans perte sur les valeurs proposées", () => {
    for (const r of CHOIX_RESERVE) expect(rpeVersReserve(reserveVersRpe(r))).toBe(r);
  });

  it("ne prétend pas connaître une réserve absente", () => {
    expect(rpeVersReserve(null)).toBeNull();
    expect(rpeVersReserve(undefined)).toBeNull();
    expect(rpeVersReserve(Number.NaN)).toBeNull();
  });

  it("borne une valeur venue d'ailleurs", () => {
    // Un RPE de 4 saisi à la main avant ce changement ne doit pas produire 6.
    expect(rpeVersReserve(4)).toBe(RESERVE_MAX);
    expect(rpeVersReserve(11)).toBe(0);
  });

  it("propose un libellé pour chaque choix", () => {
    for (const r of CHOIX_RESERVE) expect(LIBELLES_RESERVE[r]).toBeTruthy();
  });
});

describe("reserveExploitable", () => {
  it("écarte une série trop loin de l'effort pour fixer une charge", () => {
    expect(reserveExploitable(0)).toBe(true);
    expect(reserveExploitable(4)).toBe(true);
    expect(reserveExploitable(5)).toBe(false);
    expect(reserveExploitable(null)).toBe(false);
  });
});
