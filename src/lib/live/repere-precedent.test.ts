import { describe, it, expect } from "vitest";
import {
  choisirRepere, resumeRepere, type CandidatRepere, type CibleRepere,
} from "./repere-precedent";

/**
 * « La dernière fois » ne doit jamais mentir sur d'où vient le chiffre.
 *
 * LE PIÈGE
 *
 * Après une substitution, la nouvelle machine n'a pas d'historique. L'écran
 * paraît vide, et il est tentant d'y mettre la dernière performance de
 * l'ancienne. L'athlète chargerait alors 60 sur un appareil où 60 ne déplace
 * pas la même chose, et croirait avoir progressé ou régressé sans que rien de
 * tel ait eu lieu.
 *
 * Ce fichier tient donc surtout des REFUS.
 */

const surMachine = (over: Partial<CandidatRepere> = {}): CandidatRepere => ({
  exerciseInstanceId: "machine-A",
  exerciseId: "chest-press",
  conventionCharge: "pile_affichee",
  natureCharge: "resistance",
  date: "2026-09-01",
  series: [{ charge: 60, reps: 10 }],
  ...over,
});

const cible = (over: Partial<CibleRepere> = {}): CibleRepere => ({
  exerciseInstanceId: "machine-A",
  exerciseId: "chest-press",
  conventionCharge: "pile_affichee",
  natureCharge: "resistance",
  ...over,
});

describe("la même entrée est toujours le meilleur repère", () => {
  it("elle est retenue quand elle existe", () => {
    const r = choisirRepere(cible(), [surMachine()]);
    expect(r.niveau).toBe("meme_entree");
    expect(r.candidat?.exerciseInstanceId).toBe("machine-A");
  });

  it("et la plus récente gagne", () => {
    const r = choisirRepere(cible(), [
      surMachine({ date: "2026-09-01", series: [{ charge: 55, reps: 10 }] }),
      surMachine({ date: "2026-09-05", series: [{ charge: 60, reps: 10 }] }),
    ]);
    expect(r.candidat?.date).toBe("2026-09-05");
  });

  it("une séance sans série ne fait pas un repère", () => {
    // Une séance ouverte puis abandonnée ne mesure rien.
    const r = choisirRepere(cible(), [surMachine({ series: [] })]);
    expect(r.niveau).toBe("aucun");
  });
});

describe("une autre machine ne prête jamais sa charge", () => {
  it("le cas exact d'une substitution : machine B n'hérite pas de A", () => {
    /*
     * Une pile Matrix affichant 40 et une pile Technogym affichant 40 ne
     * déplacent pas la même chose — bras de levier, poulies, frottements. Le
     * nombre est un INDICE LOCAL, comparable à lui-même et à rien d'autre.
     */
    const r = choisirRepere(
      cible({ exerciseInstanceId: "machine-B" }),
      [surMachine({ exerciseInstanceId: "machine-A" })],
    );
    expect(r.niveau, "la charge de l'ancienne machine a été empruntée").toBe("aucun");
    expect(r.candidat).toBeNull();
    expect(r.message).toBe("Pas encore de repère sur cette machine");
  });

  it("même pour le même exercice, tant que la mesure est un indice de pile", () => {
    const r = choisirRepere(
      cible({ exerciseInstanceId: "machine-B", conventionCharge: "pile_affichee" }),
      [surMachine({ exerciseInstanceId: "machine-A", conventionCharge: "pile_affichee" })],
    );
    expect(r.niveau).toBe("aucun");
  });

  it("et une assistance ne se compare pas non plus d'un appareil à l'autre", () => {
    // Plus de kilos veut dire plus facile : le nombre ne se transporte pas.
    const r = choisirRepere(
      cible({ exerciseInstanceId: "assist-B", natureCharge: "assistance" }),
      [surMachine({ exerciseInstanceId: "assist-A", natureCharge: "assistance" })],
    );
    expect(r.niveau).toBe("aucun");
  });
});

describe("la charge libre, elle, se compare — sous conditions", () => {
  const barre = (over: Partial<CandidatRepere> = {}) => surMachine({
    exerciseId: "developpe-couche",
    conventionCharge: "poids_total",
    natureCharge: "resistance",
    ...over,
  });

  it("60 kg à la barre sont 60 kg partout", () => {
    /*
     * Le seul cas où un autre appareil vaut repère : la mesure porte des
     * kilogrammes réels, et la convention est la même. Deux bancs différents
     * n'y changent rien.
     */
    const r = choisirRepere(
      cible({
        exerciseInstanceId: "banc-2", exerciseId: "developpe-couche",
        conventionCharge: "poids_total", natureCharge: "resistance",
      }),
      [barre({ exerciseInstanceId: "banc-1" })],
    );
    expect(r.niveau).toBe("meme_charge_libre");
    expect(r.candidat?.exerciseInstanceId).toBe("banc-1");
  });

  it("mais pas entre deux conventions différentes", () => {
    // « Par haltère » et « poids total » sont deux nombres pour le même effort.
    const r = choisirRepere(
      cible({
        exerciseInstanceId: "banc-2", exerciseId: "developpe-couche",
        conventionCharge: "poids_par_haltere", natureCharge: "resistance",
      }),
      [barre({ exerciseInstanceId: "banc-1", conventionCharge: "poids_total" })],
    );
    expect(r.niveau).toBe("aucun");
  });

  it("ni entre deux mouvements différents", () => {
    const r = choisirRepere(
      cible({
        exerciseInstanceId: "banc-2", exerciseId: "developpe-incline",
        conventionCharge: "poids_total", natureCharge: "resistance",
      }),
      [barre({ exerciseInstanceId: "banc-1" })],
    );
    expect(r.niveau).toBe("aucun");
  });

  it("et deux exercices inconnus ne s'apparient pas", () => {
    // `null` n'est pas une identité : deux inconnues ne font pas une égalité.
    const r = choisirRepere(
      cible({ exerciseInstanceId: "x", exerciseId: null, conventionCharge: "poids_total" }),
      [barre({ exerciseInstanceId: "y", exerciseId: null })],
    );
    expect(r.niveau).toBe("aucun");
  });

  it("la même entrée reste prioritaire sur une charge libre équivalente", () => {
    // Elle est plus fidèle : même appareil, mêmes réglages, même ressenti.
    const r = choisirRepere(
      cible({
        exerciseInstanceId: "banc-1", exerciseId: "developpe-couche",
        conventionCharge: "poids_total", natureCharge: "resistance",
      }),
      [
        barre({ exerciseInstanceId: "banc-2", date: "2026-09-10" }),
        barre({ exerciseInstanceId: "banc-1", date: "2026-09-01" }),
      ],
    );
    expect(r.niveau).toBe("meme_entree");
    expect(r.candidat?.exerciseInstanceId).toBe("banc-1");
  });
});

describe("ce que l'écran affiche", () => {
  it("une charge et les répétitions, série par série", () => {
    const r = choisirRepere(cible(), [surMachine({
      series: [{ charge: 45, reps: 12 }, { charge: 45, reps: 11 }, { charge: 45, reps: 10 }],
    })]);
    expect(resumeRepere(r)).toBe("45 · 12 / 11 / 10");
  });

  it("une fourchette quand la charge a bougé en cours d'exercice", () => {
    const r = choisirRepere(cible(), [surMachine({
      series: [{ charge: 40, reps: 12 }, { charge: 45, reps: 8 }],
    })]);
    expect(resumeRepere(r)).toBe("40–45 · 12 / 8");
  });

  it("et RIEN quand il n'y a pas de repère — pas un chiffre emprunté", () => {
    const r = choisirRepere(cible({ exerciseInstanceId: "machine-B" }), [surMachine()]);
    expect(resumeRepere(r)).toBeNull();
    expect(r.message).toContain("Pas encore de repère");
  });
});
