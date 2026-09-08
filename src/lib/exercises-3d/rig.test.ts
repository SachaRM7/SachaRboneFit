import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { applyMovement, JOINTS, makeBones, type MovementId } from "./rig";
import { EXERCISE_3D_BY_SLUG, renderingForExercise } from "./catalogue";
import { CATALOGUE_PAR_SLUG } from "../referentiels/catalogue";

describe("Correspondance exacte avec le catalogue", () => {
  it("ne remplace pas un exercice avec barre ou poulie par une variante sans charge ou avec haltères", () => {
    for (const slug of [
      "squat",
      "hack-squat",
      "cable-curl",
      "unknown",
      null,
      undefined,
    ])
      expect(renderingForExercise(slug)).toBeNull();
  });
  it("relie uniquement les deux variantes avec haltères existantes", () => {
    for (const [slug, movement] of Object.entries(EXERCISE_3D_BY_SLUG)) {
      expect(CATALOGUE_PAR_SLUG.get(slug)?.equipement).toBe("halteres");
      expect(renderingForExercise(slug)).toBe(movement);
    }
  });
});

describe("Rig des démonstrations", () => {
  it.each<MovementId>(["squat", "bicep-curl", "lateral-raise"])(
    "%s boucle sans saut et garde des transformations finies",
    (movement) => {
      const bones = makeBones();
      applyMovement(bones, movement, 0);
      const initial = bones.map((b) => b.matrixWorld.elements.slice());
      for (let step = 0; step <= 100; step++) {
        applyMovement(bones, movement, step / 100);
        expect(
          bones.every((b) => b.matrixWorld.elements.every(Number.isFinite)),
        ).toBe(true);
      }
      bones.forEach((b, i) =>
        b.matrixWorld.elements.forEach((v, j) =>
          expect(v).toBeCloseTo(initial[i]![j]!, 8),
        ),
      );
    },
  );
  it("garde les deux chevilles au même point pendant le squat", () => {
    const bones = makeBones();
    for (let step = 0; step <= 100; step++) {
      applyMovement(bones, "squat", step / 100);
      for (const index of [11, 14]) {
        const ankle = bones[index]!.getWorldPosition(new Vector3());
        expect(
          ankle.distanceTo(new Vector3().fromArray(JOINTS[index]!.p)),
        ).toBeLessThan(1e-8);
      }
    }
  });
});
