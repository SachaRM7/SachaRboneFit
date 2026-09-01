import { describe, it, expect } from "vitest";
import {
  DEFINITIONS_PROFIL, DEFINITIONS_TYPE, PROFILS_TENSION, TYPES_MOUVEMENT,
  distanceProfil, estUnProfil, estUnType, profilCompatible,
} from "./profils-tension";
import { CATALOGUE } from "@/lib/referentiels/catalogue";

/**
 * Ce que les trois profils autorisent, et ce qu'ils ne classent pas.
 *
 * La règle vivait recopiée dans deux modules sous une forme qui rendait le
 * profil le plus neutre le plus difficile à remplacer. Ces tests fixent l'axe
 * et son unique conséquence : voisins compatibles, opposés non.
 */

describe("l'axe des profils", () => {
  it("compte trois positions, dans cet ordre", () => {
    expect(PROFILS_TENSION).toEqual(["stretch", "mi_range", "contract"]);
  });

  it("mesure un écart, pas une supériorité", () => {
    // Symétrique : aucun sens de lecture ne vaut mieux que l'autre.
    expect(distanceProfil("stretch", "contract")).toBe(2);
    expect(distanceProfil("contract", "stretch")).toBe(2);
    expect(distanceProfil("stretch", "mi_range")).toBe(1);
    expect(distanceProfil("mi_range", "contract")).toBe(1);
    expect(distanceProfil("contract", "contract")).toBe(0);
  });

  it("ne fabrique pas de distance quand un profil manque", () => {
    expect(distanceProfil("stretch", null)).toBeNull();
    expect(distanceProfil(undefined, "contract")).toBeNull();
    expect(distanceProfil("stretch", "inconnu")).toBeNull();
  });

  it("nomme les trois profils sans les hiérarchiser", () => {
    for (const p of PROFILS_TENSION) {
      expect(DEFINITIONS_PROFIL[p]).toMatch(/tension/i);
      expect(DEFINITIONS_PROFIL[p]).not.toMatch(/meilleur|supérieur|préférable|optimal/i);
    }
  });
});

describe("mi_range : le comportement retenu", () => {
  it("reste accepté comme remplaçant d'un stretch et d'un contract", () => {
    // Comportement d'avant, conservé : le profil neutre dépanne les deux bords.
    expect(profilCompatible("stretch", "mi_range")).toBe(true);
    expect(profilCompatible("contract", "mi_range")).toBe(true);
  });

  it("accepte désormais d'être remplacé par ses deux voisins", () => {
    // C'était l'asymétrie non écrite : un mi_range n'acceptait que du
    // mi_range, donc le profil le plus neutre était le plus dur à remplacer.
    expect(profilCompatible("mi_range", "stretch")).toBe(true);
    expect(profilCompatible("mi_range", "contract")).toBe(true);
    expect(profilCompatible("mi_range", "mi_range")).toBe(true);
  });

  it("ne rend pas stretch et contract interchangeables", () => {
    // La borne du joker : c'est là que la substitution cesse d'être fidèle.
    expect(profilCompatible("stretch", "contract")).toBe(false);
    expect(profilCompatible("contract", "stretch")).toBe(false);
  });

  it("n'écarte pas un exercice faute d'information", () => {
    expect(profilCompatible("stretch", undefined)).toBe(true);
  });
});

describe("les deux natures de mouvement", () => {
  it("se définissent par l'organisation du mouvement, pas par le ciblage", () => {
    expect(DEFINITIONS_TYPE.isolation).toMatch(/une seule articulation/i);
    expect(DEFINITIONS_TYPE.polyarticulaire).toMatch(/plusieurs articulations|segments/i);
    // « Isolation » ne veut pas dire « ça cible bien tel muscle » : sinon un
    // curl incliné et une traction supination tomberaient dans la même case.
    expect(DEFINITIONS_TYPE.isolation).not.toMatch(/cibl/i);
  });

  it("ne se déduisent d'aucun rôle", () => {
    expect(TYPES_MOUVEMENT).toEqual(["polyarticulaire", "isolation"]);
    expect(estUnType("pilier")).toBe(false);
    expect(estUnProfil("polyarticulaire")).toBe(false);
  });
});

/**
 * Le catalogue est la donnée d'entrée du moteur : une taxonomie incohérente
 * s'y propagerait silencieusement, jusque dans le filtre de substitution et
 * l'empreinte de redondance.
 */
describe("cohérence du catalogue", () => {
  const catalogue = CATALOGUE as Array<{ slug: string; type: string; profilTension: string }>;

  it("renseigne les deux champs partout", () => {
    for (const e of catalogue) {
      expect(estUnType(e.type), `${e.slug} : type`).toBe(true);
      expect(estUnProfil(e.profilTension), `${e.slug} : profil`).toBe(true);
    }
  });

  it("classe en isolation les mouvements à une seule articulation motrice", () => {
    // Ces onze-là étaient déclarés polyarticulaires. Un écarté ne mobilise que
    // l'épaule, un shrug que l'élévation scapulaire, une abduction que la
    // hanche, un straight-arm pulldown que l'épaule à coude fixe.
    const local = [
      "cable-fly", "dumbbell-fly", "incline-cable-fly", "pec-deck",
      "shrug", "dumbbell-shrug", "cable-kickback", "machine-glute-kickback",
      "hip-abduction-machine", "hip-adduction-machine", "straight-arm-pulldown",
    ];
    for (const slug of local) {
      expect(catalogue.find((e) => e.slug === slug)?.type, slug).toBe("isolation");
    }
  });

  it("classe en polyarticulaire les mouvements globaux, même quand un muscle domine", () => {
    // Un dip mobilise coude et épaule ; un ab-wheel, un dead-bug et un
    // pallof press coordonnent plusieurs segments ; un pull-through est un
    // hip hinge global. Qu'un muscle domine n'en fait pas des isolations.
    const global = [
      "bench-dip", "ab-wheel", "dead-bug", "face-pull", "hanging-leg-raise",
      "cable-woodchop", "pallof-press", "half-kneeling-pallof-press",
      "cable-pull-through", "hip-thrust", "back-extension",
    ];
    for (const slug of global) {
      expect(catalogue.find((e) => e.slug === slug)?.type, slug).toBe("polyarticulaire");
    }
  });

  it("garde en isolation les flexions locales du tronc", () => {
    // La frontière tient : un crunch fléchit le rachis et rien d'autre, là où
    // un ab-wheel engage la chaîne entière.
    for (const slug of ["cable-crunch", "weighted-crunch"]) {
      expect(catalogue.find((e) => e.slug === slug)?.type, slug).toBe("isolation");
    }
  });
});
