import { describe, it, expect } from "vitest";
import {
  DISTANCE_MINIMALE, DOMINANCE_HORIZONTALE,
  directionDuGeste, indexApresGeste, indexValide,
} from "./navigation-seances";

/**
 * Ce que le glissement doit refuser de faire.
 *
 * Le cas qui compte n'est pas « le geste fonctionne » — ça se voit tout de
 * suite —, c'est « le geste ne se déclenche pas quand on lisait ». La page
 * défile verticalement : un changement d'onglet involontaire fait perdre sa
 * place, et le lien de cause à effet n'est pas évident pour qui le subit.
 */
describe("directionDuGeste", () => {
  it("ignore un geste trop court pour être un geste", () => {
    expect(directionDuGeste(DISTANCE_MINIMALE - 1, 0)).toBeNull();
    expect(directionDuGeste(-(DISTANCE_MINIMALE - 1), 0)).toBeNull();
    expect(directionDuGeste(0, 0)).toBeNull();
  });

  it("reconnaît un franc glissement horizontal", () => {
    expect(directionDuGeste(-120, 0)).toBe("suivante");
    expect(directionDuGeste(120, 0)).toBe("precedente");
  });

  it("suit le doigt : vers la gauche, on avance", () => {
    // Le contenu se déplace avec la main, comme une page qu'on pousse.
    expect(directionDuGeste(-DISTANCE_MINIMALE, 0)).toBe("suivante");
  });

  it("laisse passer un défilement vertical", () => {
    expect(directionDuGeste(0, -300)).toBeNull();
    expect(directionDuGeste(20, -300)).toBeNull();
  });

  it("laisse passer un défilement vertical qui part de travers", () => {
    // Le cas réel : un pouce qui remonte la page décrit rarement une
    // verticale. Avec une simple comparaison |dx| > |dy|, ce geste-là
    // changeait d'onglet une fois sur deux.
    expect(directionDuGeste(-60, -200)).toBeNull();
    // Et le geste franc passe, même s'il dérive un peu : 140 contre 80, la
    // main va clairement de côté.
    expect(directionDuGeste(-140, -80)).toBe("suivante");
  });

  it("exige la dominante annoncée, ni plus ni moins", () => {
    const dy = 100;
    const juste = dy * DOMINANCE_HORIZONTALE;
    expect(directionDuGeste(-(juste - 1), dy)).toBeNull();
    expect(directionDuGeste(-(juste + 1), dy)).toBe("suivante");
  });
});

describe("indexApresGeste", () => {
  it("avance et recule d'une séance", () => {
    expect(indexApresGeste(0, "suivante", 4)).toBe(1);
    expect(indexApresGeste(2, "precedente", 4)).toBe(1);
  });

  it("bute aux extrémités au lieu de boucler", () => {
    // Passer de D à A par un geste « suivante » se lit comme un retour en
    // arrière : aux bords, ne rien faire est l'information.
    expect(indexApresGeste(3, "suivante", 4)).toBe(3);
    expect(indexApresGeste(0, "precedente", 4)).toBe(0);
  });

  it("ne désigne rien quand il n'y a rien", () => {
    expect(indexApresGeste(0, "suivante", 0)).toBe(0);
  });
});

describe("indexValide", () => {
  it("recadre après la suppression de la séance affichée", () => {
    // On était sur la quatrième, il n'en reste que trois : sans recadrage,
    // l'écran annonce « aucune séance » alors qu'il en reste bien trois.
    expect(indexValide(3, 3)).toBe(2);
  });

  it("laisse un index valide tranquille", () => {
    expect(indexValide(1, 4)).toBe(1);
  });

  it("survit à une liste vide", () => {
    expect(indexValide(2, 0)).toBe(0);
  });
});
