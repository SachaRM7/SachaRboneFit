import { describe, it, expect } from "vitest";
import {
  qualiteAdaptation,
  SEUILS_ADAPTATION,
  LIBELLES_QUALITE,
  EXPLICATIONS_QUALITE,
  type QualiteAdaptation,
} from "./seuils-adaptation";

const juger = (patch: Partial<Parameters<typeof qualiteAdaptation>[0]> = {}) =>
  qualiteAdaptation({
    total: 6,
    niveaux: Array(6).fill("conserve"),
    retires: 0,
    piliersPerdus: [],
    ...patch,
  });

describe("les trois niveaux", () => {
  it("équivalente : rien de perdu, le stimulus est intact", () => {
    expect(juger().qualite).toBe("equivalente");
    // Un même exercice sur un autre appareil, ou un même profil de tension,
    // produisent le même effet : ce n'est pas une dégradation.
    expect(juger({ niveaux: ["conserve", "meme_exercice", "profil_identique", "conserve", "conserve", "conserve"] }).qualite)
      .toBe("equivalente");
    expect(juger().motifs).toEqual([]);
  });

  it("dégradée : le travail est fait, mais il a bougé", () => {
    const r = juger({ niveaux: ["conserve", "meme_muscle", "conserve", "conserve", "conserve", "conserve"] });
    expect(r.qualite).toBe("degradee");
    expect(r.motifs.join(" ")).toMatch(/angle différent/);
  });

  it("dégradée aussi quand un exercice est perdu sans que ce soit grave", () => {
    const r = juger({ total: 6, retires: 1 });
    expect(r.qualite).toBe("degradee");
    expect(r.motifs.join(" ")).toMatch(/retiré/);
  });

  it("insuffisante : au-delà du tiers perdu", () => {
    const r = juger({ total: 6, retires: 3 });
    expect(r.qualite).toBe("insuffisante");
    expect(r.motifs.join(" ")).toMatch(/3 exercices sur 6/);
  });

  it("insuffisante : un pilier entier disparaît", () => {
    // Même en ne perdant qu'un exercice : si c'était le seul du pilier, la
    // séance ne fait plus ce qu'elle devait faire.
    const r = juger({ total: 6, retires: 1, piliersPerdus: ["P3_squat"] });
    expect(r.qualite).toBe("insuffisante");
    expect(r.motifs.join(" ")).toMatch(/P3_squat/);
  });

  it("cumule les motifs plutôt que d'en retenir un seul", () => {
    const r = juger({ total: 3, retires: 2, piliersPerdus: ["P3_squat"] });
    expect(r.motifs).toHaveLength(2);
  });

  it("n'est jamais insuffisante quand rien n'est perdu", () => {
    const r = juger({ niveaux: Array(6).fill("meme_pilier"), retires: 0 });
    expect(r.qualite).toBe("degradee");
  });
});

describe("seuils centralisés", () => {
  it("se règlent sans toucher au moteur", () => {
    const strict = { ...SEUILS_ADAPTATION, partPerdueToleree: 0 };
    expect(juger({ total: 6, retires: 1 }).qualite).toBe("degradee");
    expect(juger({ total: 6, retires: 1, seuils: strict }).qualite).toBe("insuffisante");
  });

  it("laissent désactiver la règle du pilier perdu", () => {
    const souple = { ...SEUILS_ADAPTATION, pilierPerduEstBloquant: false };
    expect(juger({ piliersPerdus: ["core"], retires: 1 }).qualite).toBe("insuffisante");
    expect(juger({ piliersPerdus: ["core"], retires: 1, seuils: souple }).qualite).toBe("degradee");
  });

  it("permettent d'élargir ce qui compte comme équivalent", () => {
    const large = {
      ...SEUILS_ADAPTATION,
      niveauxEquivalents: [...SEUILS_ADAPTATION.niveauxEquivalents, "meme_muscle" as const],
    };
    const niveaux = ["conserve", "meme_muscle", "conserve", "conserve", "conserve", "conserve"] as const;
    expect(juger({ niveaux: [...niveaux] }).qualite).toBe("degradee");
    expect(juger({ niveaux: [...niveaux], seuils: large }).qualite).toBe("equivalente");
  });

  it("portent un libellé et une explication pour chaque niveau", () => {
    for (const q of ["equivalente", "degradee", "insuffisante"] as QualiteAdaptation[]) {
      expect(LIBELLES_QUALITE[q]).toBeTruthy();
      expect(EXPLICATIONS_QUALITE[q]).toBeTruthy();
    }
  });
});

describe("séance vide", () => {
  it("ne juge rien quand il n'y a rien à juger", () => {
    expect(qualiteAdaptation({ total: 0, niveaux: [], retires: 0, piliersPerdus: [] }).qualite)
      .toBe("equivalente");
  });
});
