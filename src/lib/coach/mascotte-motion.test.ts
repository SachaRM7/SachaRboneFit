import { describe, expect, it } from "vitest";
import { imagesClesMascotte, MOUVEMENTS_MASCOTTE, poseMascotte, type MouvementMascotte } from "./mascotte-motion";

describe("essai Rossark : continuité et amplitude", () => {
  for (const mouvement of Object.keys(MOUVEMENTS_MASCOTTE) as MouvementMascotte[]) {
    const { duree } = MOUVEMENTS_MASCOTTE[mouvement];
    it(`${mouvement} conserve la pose originale aux deux extrémités`, () => {
      expect(poseMascotte(mouvement, 0)).toEqual({ sx: 1, sy: 1, angle: 0 });
      expect(poseMascotte(mouvement, duree)).toEqual(poseMascotte(mouvement, 0));
      // Pas de saut ni de vitesse brutale à la fermeture de la boucle.
      expect(Math.abs(poseMascotte(mouvement, duree - 1).angle)).toBeLessThan(0.0001);
      expect(Math.abs(poseMascotte(mouvement, 1).angle)).toBeLessThan(0.0001);
    });
    it(`${mouvement} reste discret sur toutes les images`, () => {
      for (let t = 0; t <= duree; t += 1000 / 60) {
        const pose = poseMascotte(mouvement, t);
        expect(pose.sy).toBeGreaterThanOrEqual(1);
        expect(pose.sy).toBeLessThanOrEqual(1.018);
        expect(Math.abs(pose.angle)).toBeLessThanOrEqual(1.4);
        expect(pose.sx * pose.sy ** 0.6).toBeCloseTo(1, 12);
      }
      const frames = imagesClesMascotte(mouvement);
      expect(frames.at(-1)?.transform).toBe(frames[0]?.transform);
    });
  }
});
