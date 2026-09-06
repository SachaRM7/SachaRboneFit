import { describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  ANOMALIES_ILLUSTRATIONS,
  imagesAffichables,
  sequenceAnimation,
} from "./illustrations";

/**
 * Une seule variante par exercice, ou rien.
 */
const DOSSIER = path.resolve(import.meta.dirname, "../../../public/exercices");

describe("les images écartées", () => {
  it("le Cable Crunch ne montre plus les deux rendus à la fois", () => {
    // Le défaut constaté en séance : l'image 2 vient d'un autre tracé.
    expect(imagesAffichables("cable-crunch")).toEqual([1, 3]);
  });

  it("un exercice sans anomalie garde ses trois images", () => {
    expect(imagesAffichables("hanging-leg-raise")).toEqual([1, 2, 3]);
  });

  it("une image écartée ne revient pas par l'animation", () => {
    // C'était le vrai risque : filtrer l'affichage mais reconstruire la
    // séquence sur `nbFrames`, ce qui ramène l'intruse une fois sur deux.
    const sequence = sequenceAnimation(imagesAffichables("cable-crunch"));
    expect(sequence).not.toContain(2);
  });

  it("l'animation décrit un aller-retour, pas une boucle", () => {
    expect(sequenceAnimation([1, 2, 3])).toEqual([1, 2, 3, 2]);
    expect(sequenceAnimation([1, 3])).toEqual([1, 3]);
    // Une seule image ne s'anime pas.
    expect(sequenceAnimation([1])).toEqual([1]);
  });
});

describe("le manifeste reste ancré au disque", () => {
  it("chaque anomalie déclarée désigne un dossier qui existe", () => {
    // Un slug renommé laisserait une anomalie orpheline, donc une image
    // fautive de nouveau affichée sans que rien ne le signale.
    for (const slug of Object.keys(ANOMALIES_ILLUSTRATIONS)) {
      expect(existsSync(path.join(DOSSIER, slug)), `${slug} introuvable`).toBe(true);
    }
  });

  it("et des images qui existent vraiment", () => {
    for (const [slug, anomalie] of Object.entries(ANOMALIES_ILLUSTRATIONS)) {
      const present = readdirSync(path.join(DOSSIER, slug));
      for (const n of anomalie.imagesEcartees) {
        expect(present, `${slug}/frame-${n}.svg`).toContain(`frame-${n}.svg`);
      }
    }
  });

  it("chaque anomalie porte le constat qui la justifie", () => {
    // Écarter une image sans dire pourquoi, c'est une décision qu'on ne peut
    // plus réexaminer six mois plus tard.
    for (const [slug, a] of Object.entries(ANOMALIES_ILLUSTRATIONS)) {
      expect(a.constat.length, slug).toBeGreaterThan(40);
      expect(a.imagesEcartees.length, slug).toBeGreaterThan(0);
    }
  });

  it("aucun exercice ne se retrouve sans la moindre image", () => {
    for (const slug of Object.keys(ANOMALIES_ILLUSTRATIONS)) {
      expect(imagesAffichables(slug).length, slug).toBeGreaterThan(0);
    }
  });
});
