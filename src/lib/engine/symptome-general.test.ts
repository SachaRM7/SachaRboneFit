import { describe, it, expect } from "vitest";
import { prudenceSymptomes, conduitePourUn } from "./symptome-general";
import { SYMPTOMES_GENERAUX, type SymptomeDeclare } from "@/lib/referentiels/symptomes";

/**
 * La règle qui décide ce qu'on fait d'un symptôme — et surtout ce qu'elle ne
 * fait pas.
 *
 * Le risque de ce lot n'est pas de sous-réagir : c'est de SURRÉAGIR. Une
 * application qui transforme « léger mal de tête » en séance annulée apprend à
 * son utilisateur à ne plus rien déclarer, et on perd la donnée en même temps
 * que la confiance. Le premier bloc de ce fichier est donc consacré à ce qui
 * ne doit PAS arriver.
 */

const s = (
  symptome: SymptomeDeclare["symptome"], intensite: number,
): SymptomeDeclare => ({ symptome, intensite, moment: "pendant_seance" });

describe("un signal faible reste un signal, pas une urgence", () => {
  it("le mal de tête du 6 septembre ne change rien à la séance", () => {
    // Le cas terrain, exactement : léger, déclaré en pleine Calibration B.
    for (const intensite of [1, 2, 3]) {
      const r = prudenceSymptomes([s("mal_de_tete", intensite)]);
      expect(r.conduite, `mal de tête ${intensite}/10`).toBe("continuer");
    }
  });

  it("et il est quand même consigné, avec son motif", () => {
    // Consigner sans agir est le comportement attendu, pas une absence de
    // comportement : le débrief et le coach doivent pouvoir le relire.
    const r = prudenceSymptomes([s("mal_de_tete", 2)]);
    expect(r.motif).toContain("Mal de tête 2/10");
    expect(r.decisif).not.toBeNull();
  });

  it("rien de déclaré ne produit ni conduite ni phrase", () => {
    const r = prudenceSymptomes([]);
    expect(r.conduite).toBe("continuer");
    expect(r.motif).toBe("");
    expect(r.decisif).toBeNull();
  });

  it("aucun symptôme faible, quel qu'il soit, ne fait arrêter", () => {
    for (const { valeur } of SYMPTOMES_GENERAUX) {
      expect(conduitePourUn(s(valeur, 1)), `${valeur} 1/10`).toBe("continuer");
    }
  });
});

describe("le barème ordinaire", () => {
  it("4 à 6 propose d'alléger", () => {
    for (const i of [4, 5, 6]) expect(conduitePourUn(s("mal_de_tete", i))).toBe("alleger");
  });

  it("7 et au-delà propose de terminer", () => {
    for (const i of [7, 9, 10]) expect(conduitePourUn(s("nausee", i))).toBe("arreter");
  });

  it("les frontières sont exactement là où elles sont écrites", () => {
    // 3/4 et 6/7 : les deux seuls endroits où un point d'intensité change la
    // conduite. Un test qui ne les vise pas ne prouve rien du barème.
    expect(conduitePourUn(s("autre", 3))).toBe("continuer");
    expect(conduitePourUn(s("autre", 4))).toBe("alleger");
    expect(conduitePourUn(s("autre", 6))).toBe("alleger");
    expect(conduitePourUn(s("autre", 7))).toBe("arreter");
  });
});

describe("trois symptômes descendent d'un cran, et seulement trois", () => {
  /*
   * Vertige, malaise, essoufflement inhabituel : ils dégradent la capacité à
   * tenir une charge en sécurité, ce qui se constate sans compétence médicale.
   * L'exception est unique et bornée — c'est ce que ce bloc vérifie.
   */
  const prudents = ["vertige", "malaise", "essoufflement_inhabituel"] as const;

  it("ils allègent dès 3 et font terminer dès 5", () => {
    for (const p of prudents) {
      expect(conduitePourUn(s(p, 2)), `${p} 2/10`).toBe("continuer");
      expect(conduitePourUn(s(p, 3)), `${p} 3/10`).toBe("alleger");
      expect(conduitePourUn(s(p, 5)), `${p} 5/10`).toBe("arreter");
    }
  });

  it("les autres gardent le barème ordinaire au même niveau", () => {
    // La preuve que l'exception est bien une exception : à 5/10, un mal de tête
    // allège là où un vertige fait terminer.
    expect(conduitePourUn(s("mal_de_tete", 5))).toBe("alleger");
    expect(conduitePourUn(s("nausee", 5))).toBe("alleger");
    expect(conduitePourUn(s("autre", 5))).toBe("alleger");
    expect(conduitePourUn(s("vertige", 5))).toBe("arreter");
  });

  it("« autre » n'hérite jamais de la prudence renforcée", () => {
    // Sinon le champ ouvert deviendrait le plus strict de tous, et personne ne
    // l'utiliserait pour ce qu'il est : un symptôme qu'on ne sait pas nommer.
    expect(conduitePourUn(s("autre", 4))).toBe("alleger");
    expect(conduitePourUn(s("autre", 6))).toBe("alleger");
  });
});

describe("plusieurs symptômes à la fois", () => {
  it("la conduite la plus prudente l'emporte, sans moyenne", () => {
    /*
     * Un mal de tête à 2 et un vertige à 6. Une moyenne donnerait 4, donc
     * « alléger » — alors que l'un des deux signaux dit « arrêter ». C'est
     * l'endroit précis où une arithmétique séduisante produit la mauvaise
     * décision.
     */
    const r = prudenceSymptomes([s("mal_de_tete", 2), s("vertige", 6)]);
    expect(r.conduite).toBe("arreter");
    expect(r.decisif?.symptome).toBe("vertige");
  });

  it("l'ordre de déclaration ne change pas le résultat", () => {
    const a = prudenceSymptomes([s("vertige", 6), s("mal_de_tete", 2)]);
    const b = prudenceSymptomes([s("mal_de_tete", 2), s("vertige", 6)]);
    expect(a.conduite).toBe(b.conduite);
    expect(a.decisif?.symptome).toBe(b.decisif?.symptome);
  });

  it("à conduite égale, c'est le plus intense qui est cité", () => {
    const r = prudenceSymptomes([s("mal_de_tete", 4), s("nausee", 6)]);
    expect(r.conduite).toBe("alleger");
    expect(r.decisif?.symptome).toBe("nausee");
    expect(r.motif).toContain("Nausée 6/10");
  });

  it("deux symptômes faibles restent deux symptômes faibles", () => {
    // Cumuler les signaux — « deux symptômes, donc c'est grave » — serait une
    // surprotection que rien ne justifie.
    const r = prudenceSymptomes([s("mal_de_tete", 2), s("nausee", 3)]);
    expect(r.conduite).toBe("continuer");
  });
});

describe("le motif se lit sans rien diagnostiquer", () => {
  it("il nomme le symptôme et l'intensité, jamais une cause", () => {
    const r = prudenceSymptomes([s("nausee", 8)]);
    expect(r.motif).toBe("Nausée 8/10. Proposé de terminer la séance.");
  });

  it("aucune phrase du moteur ne ressemble à un avis médical", () => {
    const interdits = /migraine|hypoglyc|infection|tension|malaise vagal|médecin|consulte|traitement|médicament|déshydrat/i;
    for (const { valeur } of SYMPTOMES_GENERAUX) {
      for (const i of [1, 5, 9]) {
        expect(prudenceSymptomes([s(valeur, i)]).motif).not.toMatch(interdits);
      }
    }
  });
});
