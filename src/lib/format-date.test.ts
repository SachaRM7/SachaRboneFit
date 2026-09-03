import { describe, it, expect } from "vitest";
import {
  jourAvecJourDeSemaine, jourCourt, jourEnToutesLettres, midiLocal, moisEnToutesLettres,
} from "./format-date";

/**
 * Le décalage d'un jour, celui qu'on ne voit pas en le relisant.
 *
 * `new Date("2026-09-03")` vaut minuit UTC. Le rendre dans un fuseau à l'ouest
 * de Greenwich affiche la veille — la séance du 3 devient « 2 septembre ». Le
 * test le vérifie sur l'instant produit, pas sur la chaîne rendue : le format
 * dépend de la machine qui exécute les tests, le jour non.
 */
describe("midiLocal", () => {
  it("place la date à midi, jamais à minuit", () => {
    const d = midiLocal("2026-09-03");
    expect(d.getHours()).toBe(12);
    expect(d.getDate()).toBe(3);
    expect(d.getMonth()).toBe(8);
    expect(d.getFullYear()).toBe(2026);
  });

  it("garde le bon jour sur toute l'année, quel que soit le fuseau", () => {
    /*
     * Le test tourne dans le fuseau de la machine, et celle d'intégration
     * continue est en UTC — où le défaut est invisible, les deux lectures
     * tombant le même jour. Vérifier le RENDU ne prouverait donc rien.
     *
     * L'invariant, lui, se vérifie partout : la date rendue est celle qu'on a
     * demandée. Sur 365 jours, un fuseau décalé le ferait échouer sur tous.
     * (Contrôle fait à la main sous America/Los_Angeles : la lecture naïve y
     * affiche « 2 sept. » pour le 3 septembre, celle-ci « 3 sept. ».)
     */
    const debut = Date.UTC(2026, 0, 1);
    for (let i = 0; i < 365; i += 1) {
      const jour = new Date(debut + i * 86_400_000).toISOString().slice(0, 10);
      const rendu = midiLocal(jour);
      const [a, m, j] = jour.split("-").map(Number);
      expect(
        [rendu.getFullYear(), rendu.getMonth() + 1, rendu.getDate()],
        `${jour} rendu un autre jour`,
      ).toEqual([a, m, j]);
    }
  });

  it("ne bronche pas sur un changement d'heure", () => {
    // Le dernier dimanche d'octobre : à minuit, l'heure existe deux fois.
    expect(midiLocal("2026-10-25").getDate()).toBe(25);
    expect(midiLocal("2026-03-29").getDate()).toBe(29);
  });
});

describe("les formats", () => {
  it("rendent tous le bon jour", () => {
    for (const rendu of [
      jourCourt("2026-09-03"),
      jourEnToutesLettres("2026-09-03"),
      jourAvecJourDeSemaine("2026-09-03"),
    ]) {
      expect(rendu, rendu).toContain("3");
      expect(rendu, rendu).not.toContain("2 ");
    }
  });

  it("disent le mois d'un en-tête sans jour", () => {
    const rendu = moisEnToutesLettres("2026-09");
    expect(rendu).toContain("2026");
    expect(rendu.toLowerCase()).toContain("septembre");
  });

  it("distinguent le format court du format long", () => {
    expect(jourCourt("2026-09-03").length).toBeLessThan(
      jourEnToutesLettres("2026-09-03").length,
    );
    expect(jourAvecJourDeSemaine("2026-09-03").length).toBeGreaterThan(
      jourEnToutesLettres("2026-09-03").length,
    );
  });

  it("passent le premier du mois, qui est le cas limite", () => {
    // Un jour de moins ferait basculer sur le mois précédent : c'est là que le
    // décalage se voit le plus.
    expect(jourEnToutesLettres("2026-09-01")).toContain("1");
    expect(jourEnToutesLettres("2026-09-01").toLowerCase()).toContain("septembre");
    expect(jourEnToutesLettres("2026-01-01").toLowerCase()).toContain("janvier");
  });
});
