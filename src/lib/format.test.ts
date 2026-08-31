import { describe, it, expect } from "vitest";
import { nombre, avecUnite, pourcentage, pluriel, compte } from "./format";
import { libellePilier, libelleFeu, libelleMuscle, libelleCategorieRole } from "@/lib/referentiels/libelles";
import { libelleCycle, LIBELLES_PHASE, LIBELLES_FATIGUE } from "@/lib/referentiels/cycle";
import { messageErreur } from "./messages";

/**
 * Ces tests portent sur les tables de présentation et les formats, pas sur des
 * phrases exactes : une microcopie doit pouvoir être retouchée sans casser la
 * suite. Ce qui est vérifié, c'est qu'aucune valeur du modèle n'atteint
 * l'écran, et que les nombres s'écrivent en français.
 */

const lisible = (s: string) => s.split("\u202f").join(" ");

describe("formats français", () => {
  it("sépare les milliers et met une virgule décimale", () => {
    expect(lisible(nombre(24180))).toBe("24 180");
    expect(nombre(25.4, 1)).toBe("25,4");
    expect(lisible(nombre(1234567))).toBe("1 234 567");
  });

  it("n'affiche pas de décimale quand il n'y en a pas à montrer", () => {
    expect(nombre(60, 1)).toBe("60");
    expect(nombre(82.5, 1)).toBe("82,5");
  });

  it("lie le nombre à son unité par une espace insécable", () => {
    const s = avecUnite(82.5, "kg", 1);
    expect(lisible(s)).toBe("82,5 kg");
    // U+202F : l'unité ne peut pas se retrouver seule en début de ligne.
    expect(s).toContain("\u202f");
    expect(s).not.toContain(" kg");
  });

  it("écrit un pourcentage signé à la française", () => {
    expect(lisible(pourcentage(25.4, 1, true))).toBe("+25,4 %");
    expect(lisible(pourcentage(-10, 1))).toBe("-10 %");
    expect(lisible(pourcentage(0, 1, true))).toBe("0 %");
  });

  it("accorde le pluriel, zéro compris", () => {
    // En français, zéro reste au singulier.
    expect(pluriel(0, "séance")).toBe("séance");
    expect(pluriel(1, "séance")).toBe("séance");
    expect(pluriel(2, "séance")).toBe("séances");
    expect(pluriel(2, "record", "records")).toBe("records");
    expect(lisible(compte(3, "séance"))).toBe("3 séances");
    expect(lisible(compte(1, "séance"))).toBe("1 séance");
    // Une unité n'est pas un nom : elle passe par `avecUnite`, sans pluriel.
    expect(lisible(avecUnite(1200, "kg"))).toBe("1 200 kg");
  });
});

describe("aucune valeur du modèle n'atteint l'écran", () => {
  it("traduit tous les piliers du moteur", () => {
    const PILIERS = [
      "P1_poussee", "P2_tirage", "P3_squat", "P4_hanche",
      "epaules", "jambes_iso", "bras_triceps", "bras_biceps", "core",
    ];
    for (const p of PILIERS) {
      const libelle = libellePilier(p);
      expect(libelle).not.toBe(p);
      expect(libelle).not.toMatch(/_/);
      expect(libelle).not.toMatch(/^P\d/);
    }
  });

  it("dit une seule chose pour le gainage, partout", () => {
    // Trois tables de piliers coexistaient, dont une seule disait « Core ».
    expect(libellePilier("core")).toBe("Gainage");
  });

  it("traduit le feu du jour en ce qu'il signifie", () => {
    for (const f of ["vert", "orange", "rouge"]) {
      expect(libelleFeu(f)).not.toBe(f);
    }
    expect(libelleFeu("orange")).toMatch(/récupération/i);
  });

  it("traduit les muscles et les rôles sans laisser de tiret bas", () => {
    for (const m of ["haut_dos", "deltoide_posterieur", "avant_bras", "core"]) {
      expect(libelleMuscle(m)).not.toMatch(/_/);
    }
    for (const r of ["pilier", "substitut", "accessoire"]) {
      expect(libelleCategorieRole(r)).not.toMatch(/_/);
    }
  });

  it("traduit les phases et les statuts de fatigue du moteur", () => {
    for (const p of ["accumulation", "surcharge", "decharge", "hors_cycle"]) {
      expect(LIBELLES_PHASE[p]).toBeDefined();
      expect(LIBELLES_PHASE[p]).not.toMatch(/_/);
    }
    // « elevee_attendue » doit dire que la fatigue est cohérente avec la phase.
    expect(LIBELLES_FATIGUE.elevee_attendue).toMatch(/prévu|attendu/i);
    for (const f of ["basse", "attendue", "elevee_attendue", "elevee_anormale"]) {
      expect(LIBELLES_FATIGUE[f]).not.toMatch(/_/);
    }
  });

  it("traduit les anciens vocabulaires de cycle sans les réécrire", () => {
    expect(libelleCycle("mecanique").libelle).toBe("Dominante charge");
    expect(libelleCycle("metabolique").libelle).toBe("Dominante volume");
    // Une valeur inconnue est humanisée, jamais affichée telle quelle.
    expect(libelleCycle("bloc_perso_2024").libelle).not.toMatch(/_/);
  });

  it("distingue une référence d'un record", () => {
    // Le vocabulaire compte : une première mesure n'est pas un exploit.
    expect(libelleCycle("calibration").libelle).toBe("Reprise & calibration");
    expect(libelleCycle("calibration").intention).toMatch(/apprends/i);
  });
});

describe("messages d'erreur", () => {
  it("dit ce qui a échoué et quoi faire, jamais un code", () => {
    const m = messageErreur("enregistrer ta séance", null, 500);
    expect(m).toMatch(/enregistrer ta séance/);
    expect(m).toMatch(/réessaie/i);
    expect(m).not.toMatch(/500|HTTP|Error/);
  });

  it("traduit les statuts qui ont un sens pour l'utilisateur", () => {
    expect(messageErreur("x", null, 401)).toMatch(/session a expiré/i);
    expect(messageErreur("x", null, 403)).toMatch(/pas permise/i);
    expect(messageErreur("x", null, 429)).toMatch(/attends/i);
  });

  it("relaie un message métier lisible, et écarte un message technique", () => {
    expect(messageErreur("x", "Cette salle contient encore des exercices.")).toBe(
      "Cette salle contient encore des exercices.",
    );
    for (const technique of [
      "Failed to fetch",
      "HTTP 500",
      "invalid_payload",
      "TypeError: undefined is not a function",
    ]) {
      const m = messageErreur("enregistrer ta séance", technique);
      expect(m).not.toContain(technique);
      expect(m).toMatch(/réessaie/i);
    }
  });
});
