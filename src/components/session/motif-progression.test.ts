import { describe, it, expect } from "vitest";
import { classeDuMotif, estUneMontee, tonDuMotif } from "./motif-progression";
import type { MotifProgression } from "@/lib/engine/double-progression";

/**
 * Le défaut visible que ce chantier corrige.
 *
 * `messageProgression` était peint en `text-gain` quelle que soit la décision
 * qu'il racontait : « 1 série sur 3, on refait la séance entière » s'affichait
 * en vert et en gras, dans la couleur que le carnet réserve aux progrès. Et le
 * bandeau de séance comptait chaque message comme une « charge en hausse », ce
 * qui n'était pas une couleur trompeuse mais une phrase fausse.
 */

const TOUS: MotifProgression[] = [
  "montee", "montee_effort_maximal", "consolidation_effort",
  "reference_tronquee", "butee_materiel", "increments_inconnus",
];

describe("le vert du gain est réservé aux hausses", () => {
  it("une montée le porte", () => {
    expect(classeDuMotif("montee")).toContain("text-gain");
    expect(classeDuMotif("montee_effort_maximal")).toContain("text-gain");
  });

  it("une référence tronquée ne le porte JAMAIS", () => {
    // Le défaut d'origine, en un test.
    expect(classeDuMotif("reference_tronquee")).not.toContain("text-gain");
    expect(tonDuMotif("reference_tronquee")).toBe("avertissement");
  });

  it("une consolidation ne le porte pas non plus", () => {
    expect(classeDuMotif("consolidation_effort")).not.toContain("text-gain");
    expect(tonDuMotif("consolidation_effort")).toBe("neutre");
  });

  it("une butée et des incréments inconnus informent sans juger", () => {
    // Deux faits sur le matériel, pas sur l'athlète : ni gain, ni reproche.
    for (const m of ["butee_materiel", "increments_inconnus"] as const) {
      expect(tonDuMotif(m)).toBe("neutre");
      expect(classeDuMotif(m)).not.toContain("text-gain");
      expect(classeDuMotif(m)).not.toContain("text-perte");
    }
  });

  it("seuls les deux motifs de hausse portent le vert", () => {
    const enVert = TOUS.filter((m) => classeDuMotif(m).includes("text-gain"));
    expect(enVert).toEqual(["montee", "montee_effort_maximal"]);
  });
});

describe("l'absence de motif n'affirme rien", () => {
  it("sans motif, le ton est neutre", () => {
    expect(tonDuMotif(null)).toBe("neutre");
    expect(tonDuMotif(undefined)).toBe("neutre");
    expect(classeDuMotif(null)).not.toContain("text-gain");
  });
});

describe("« charges en hausse » ne compte que les hausses", () => {
  it("les deux motifs de montée en sont", () => {
    expect(estUneMontee("montee")).toBe(true);
    expect(estUneMontee("montee_effort_maximal")).toBe(true);
  });

  it("aucun autre motif n'en est", () => {
    for (const m of ["consolidation_effort", "reference_tronquee", "butee_materiel", "increments_inconnus"] as const) {
      expect(estUneMontee(m)).toBe(false);
    }
    expect(estUneMontee(null)).toBe(false);
  });

  it("une butée n'est pas une hausse, malgré son message « fourchette complétée »", () => {
    // La phrase commence comme une réussite ; la charge, elle, n'a pas bougé.
    expect(estUneMontee("butee_materiel")).toBe(false);
  });
});

describe("aucune classe hors du carnet", () => {
  it("les tons n'emploient que des jetons existants du projet", () => {
    const autorisees = new Set(["text-gain", "text-perte", "text-encre-2", "font-semibold"]);
    for (const m of [...TOUS, null]) {
      for (const classe of classeDuMotif(m).split(" ")) {
        expect(autorisees.has(classe)).toBe(true);
      }
    }
  });

  it("chaque motif a un ton, aucun n'est oublié", () => {
    for (const m of TOUS) {
      expect(["gain", "avertissement", "neutre"]).toContain(tonDuMotif(m));
    }
  });
});
