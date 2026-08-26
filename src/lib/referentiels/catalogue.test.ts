import { describe, it, expect } from "vitest";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CATALOGUE, CATALOGUE_PAR_SLUG, urlIllustration } from "./catalogue";
import { MUSCLES } from "./muscles";
import { EQUIPEMENTS } from "./equipements";

const PILIERS = [
  "P1_poussee", "P2_tirage", "P3_squat", "P4_hanche",
  "epaules", "bras_biceps", "bras_triceps", "jambes_iso", "core",
];

const PUBLIC_EXERCICES = join(process.cwd(), "public", "exercices");

describe("catalogue d'exercices", () => {
  it("n'est pas vide", () => {
    expect(CATALOGUE.length).toBeGreaterThan(100);
  });

  it("n'a aucun slug en double", () => {
    const slugs = CATALOGUE.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("n'utilise que des piliers connus", () => {
    for (const e of CATALOGUE) {
      expect(PILIERS, `pilier inconnu sur ${e.slug}`).toContain(e.pilier);
    }
  });

  it("n'utilise que des muscles du referentiel", () => {
    for (const e of CATALOGUE) {
      for (const m of [...e.musclesPrincipaux, ...e.musclesSecondaires]) {
        expect(MUSCLES, `muscle inconnu sur ${e.slug} : ${m}`).toContain(m);
      }
    }
  });

  it("n'utilise que des equipements du referentiel", () => {
    for (const e of CATALOGUE) {
      expect(EQUIPEMENTS, `equipement inconnu sur ${e.slug}`).toContain(e.equipement);
    }
  });

  it("declare au moins un muscle principal par exercice", () => {
    for (const e of CATALOGUE) {
      expect(e.musclesPrincipaux.length, `aucun muscle principal sur ${e.slug}`).toBeGreaterThan(0);
    }
  });

  it("ne repete jamais un muscle principal dans les secondaires", () => {
    for (const e of CATALOGUE) {
      const chevauchement = e.musclesSecondaires.filter((m) => e.musclesPrincipaux.includes(m));
      expect(chevauchement, `chevauchement sur ${e.slug}`).toEqual([]);
    }
  });

  it("couvre les neuf piliers", () => {
    const couverts = new Set(CATALOGUE.map((e) => e.pilier));
    for (const p of PILIERS) expect(couverts, `pilier sans exercice : ${p}`).toContain(p);
  });

  it("propose au moins un exercice pilier par pilier de mouvement", () => {
    for (const p of ["P1_poussee", "P2_tirage", "P3_squat", "P4_hanche", "epaules"]) {
      const piliers = CATALOGUE.filter((e) => e.pilier === p && e.categorieRole === "pilier");
      expect(piliers.length, `aucun exercice pilier pour ${p}`).toBeGreaterThan(0);
    }
  });

  it("indexe chaque exercice par son slug", () => {
    expect(CATALOGUE_PAR_SLUG.size).toBe(CATALOGUE.length);
  });
});

describe("illustrations", () => {
  it("chaque exercice a ses fichiers sur disque", () => {
    const manquants: string[] = [];
    for (const e of CATALOGUE) {
      for (let frame = 1; frame <= e.nbFrames; frame++) {
        const chemin = join(PUBLIC_EXERCICES, e.slug, `frame-${frame}.svg`);
        if (!existsSync(chemin)) manquants.push(`${e.slug}/frame-${frame}.svg`);
      }
    }
    expect(manquants).toEqual([]);
  });

  it("ne laisse aucun dossier d'illustration orphelin", () => {
    const surDisque = readdirSync(PUBLIC_EXERCICES, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    const orphelins = surDisque.filter((slug) => !CATALOGUE_PAR_SLUG.has(slug));
    expect(orphelins).toEqual([]);
  });

  it("construit une URL publique coherente", () => {
    expect(urlIllustration("bench-press", 2)).toBe("/exercices/bench-press/frame-2.svg");
    expect(urlIllustration("bench-press")).toBe("/exercices/bench-press/frame-1.svg");
  });
});
