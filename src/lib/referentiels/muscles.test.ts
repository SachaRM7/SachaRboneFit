import { describe, it, expect } from "vitest";
import { MUSCLES, LIBELLES, versMuscle, versMuscles, memeMuscle, musclesDeLaZone, ZONES_DOULEUR } from "./muscles";

describe("referentiel musculaire", () => {
  it("expose un libelle pour chaque muscle", () => {
    for (const m of MUSCLES) {
      expect(LIBELLES[m], `libelle manquant pour ${m}`).toBeTruthy();
    }
  });

  it("reconnait sa propre valeur canonique", () => {
    for (const m of MUSCLES) {
      expect(versMuscle(m)).toBe(m);
    }
  });

  it("reconnait chaque libelle affiche", () => {
    for (const m of MUSCLES) {
      expect(versMuscle(LIBELLES[m]), `libelle non reconnu : ${LIBELLES[m]}`).toBe(m);
    }
  });

  it("renvoie null sur une valeur inconnue plutot que de la laisser passer", () => {
    expect(versMuscle("clavicule")).toBeNull();
    expect(versMuscle("")).toBeNull();
    expect(versMuscle(null)).toBeNull();
    expect(versMuscle(undefined)).toBeNull();
  });

  it("ignore accents, casse et separateurs", () => {
    expect(versMuscle("ÉPAULES")).toBe("epaules");
    expect(versMuscle("epaules")).toBe("epaules");
    expect(versMuscle("Ischio-jambiers")).toBe("ischios");
    expect(versMuscle("ischio jambiers")).toBe("ischios");
  });
});

describe("reconciliation des trois anciens vocabulaires", () => {
  // C'est le bug d'origine : ces trois colonnes ne se rencontraient jamais.
  const cas: Array<[base: string, saisie: string, attendu: string]> = [
    ["quads", "Quadriceps", "quadriceps"],
    ["pecs", "Pectoraux", "pectoraux"],
    ["dos", "Dorsaux", "dorsaux"],
    ["ischios", "Ischio-jambiers", "ischios"],
    ["fessiers", "Fessiers", "fessiers"],
    ["biceps", "Biceps", "biceps"],
    ["triceps", "Triceps", "triceps"],
    ["core", "Abdominaux", "core"],
  ];

  it.each(cas)("base %s et saisie %s designent tous deux %s", (base, saisie, attendu) => {
    expect(versMuscle(base)).toBe(attendu);
    expect(versMuscle(saisie)).toBe(attendu);
    expect(memeMuscle(base, saisie)).toBe(true);
  });

  it("rapproche les variantes d'epaule de l'ancien seed", () => {
    expect(versMuscle("epaule_ant")).toBe("epaules");
    expect(versMuscle("epaule_lat")).toBe("epaules");
    expect(versMuscle("epaule")).toBe("epaules");
    expect(versMuscle("epaule_post")).toBe("deltoide_posterieur");
    expect(versMuscle("rotateurs")).toBe("deltoide_posterieur");
  });

  it("absorbe le vocabulaire de la bibliotheque workout-guide", () => {
    expect(versMuscle("Chest")).toBe("pectoraux");
    expect(versMuscle("Lats")).toBe("dorsaux");
    expect(versMuscle("Upper Back")).toBe("haut_dos");
    expect(versMuscle("Hamstrings")).toBe("ischios");
    expect(versMuscle("Glutes")).toBe("fessiers");
    expect(versMuscle("Rear Delts")).toBe("deltoide_posterieur");
    expect(versMuscle("Grip")).toBe("avant_bras");
  });
});

describe("versMuscles", () => {
  it("deduplique et ecarte l'inconnu", () => {
    expect(versMuscles(["quads", "Quadriceps", "clavicule", null])).toEqual(["quadriceps"]);
  });

  it("renvoie un tableau vide sur une entree absente", () => {
    expect(versMuscles(null)).toEqual([]);
    expect(versMuscles([])).toEqual([]);
  });
});

describe("zones de douleur", () => {
  it("chaque zone pointe vers des muscles du referentiel", () => {
    for (const { zone, muscles } of ZONES_DOULEUR) {
      expect(muscles.length, `zone sans muscle : ${zone}`).toBeGreaterThan(0);
      for (const m of muscles) expect(MUSCLES).toContain(m);
    }
  });

  it("une douleur a l'epaule cible bien les muscles d'epaule", () => {
    // Cas concret du rapport d'audit : avant, cette resolution renvoyait toujours vide.
    const muscles = musclesDeLaZone("Épaule");
    expect(muscles).toContain("epaules");
    expect(muscles).toContain("deltoide_posterieur");
  });

  it("resout une zone quelle que soit sa casse ou ses accents", () => {
    expect(musclesDeLaZone("epaule")).toEqual(musclesDeLaZone("Épaule"));
    expect(musclesDeLaZone("BAS DU DOS")).toContain("lombaires");
  });
});
