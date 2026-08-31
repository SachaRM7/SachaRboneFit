import { describe, it, expect } from "vitest";
import {
  BORNES, NOUVELLE_LIGNE, OPERATIONS, apercuEnTexte, construireApercu, empreinteDe,
  estPerimee, prescription, projeter,
  type LigneProgramme,
} from "./propositions";

/**
 * Le coach propose, il n'écrit pas.
 *
 * Ce qui est vérifié ici est le cœur du chemin d'écriture : ce qu'une opération
 * produit, ce qu'elle refuse, et ce que l'athlète lit avant de décider. Aucun
 * de ces tests ne touche à la base — c'est précisément l'intérêt d'avoir séparé
 * la projection de la persistance : le calcul qui décide de tout est
 * vérifiable sans rien monter.
 */

const SEANCE: LigneProgramme[] = [
  { id: "l1", ordre: 1, exerciseInstanceId: "i1", nom: "Développé couché", seriesCibles: 4, repsMin: 6, repsMax: 10 },
  { id: "l2", ordre: 2, exerciseInstanceId: "i2", nom: "Tirage horizontal", seriesCibles: 4, repsMin: 8, repsMax: 12 },
  { id: "l3", ordre: 3, exerciseInstanceId: "i3", nom: "Élévations latérales", seriesCibles: 3, repsMin: 12, repsMax: 15 },
];

const CATALOGUE: Record<string, string> = {
  i1: "Développé couché", i2: "Tirage horizontal", i3: "Élévations latérales",
  i4: "Développé incliné", i5: "Curl pupitre",
};
const nommer = (id: string) => CATALOGUE[id] ?? null;

describe("le catalogue d'opérations", () => {
  it("ne contient que des opérations métier nommées", () => {
    // Pas d'update_program(json) : ce qui n'est pas listé est impossible.
    expect([...OPERATIONS]).toEqual([
      "remplacer_exercice", "ajuster_volume", "ajouter_exercice", "retirer_exercice",
    ]);
  });
});

describe("retirer un exercice", () => {
  it("le sort de la séance et renumérote ce qui reste", () => {
    const { lignes, refus } = projeter(
      SEANCE, { type: "retirer_exercice", ligneId: "l2" }, nommer,
    );
    expect(refus).toBeNull();
    expect(lignes.map((l) => l.id)).toEqual(["l1", "l3"]);
    // L'aperçu doit montrer l'ordre que la séance aura, pas un trou.
    expect(lignes.map((l) => l.ordre)).toEqual([1, 2]);
  });

  it("refuse de vider la séance de son dernier exercice", () => {
    const { refus } = projeter(
      [SEANCE[0]!], { type: "retirer_exercice", ligneId: "l1" }, nommer,
    );
    expect(refus).toMatch(/dernier exercice/);
  });

  it("refuse une ligne déjà partie", () => {
    const { refus } = projeter(
      SEANCE, { type: "retirer_exercice", ligneId: "l9" }, nommer,
    );
    expect(refus).toMatch(/n'existe plus/);
  });

  it("se lit comme un retrait, et chiffre le volume perdu", () => {
    const { lignes } = projeter(SEANCE, { type: "retirer_exercice", ligneId: "l3" }, nommer);
    const apercu = construireApercu(SEANCE, lignes);
    expect(apercu.lignes.filter((l) => l.mouvement === "retire")).toEqual([
      { mouvement: "retire", nom: "Élévations latérales", avant: "3 × 12-15", apres: null },
    ]);
    expect(apercu.lignes.filter((l) => l.mouvement === "ajoute")).toHaveLength(0);
    expect(apercu.resume).toContain("−3 séries");
  });
});

describe("remplacer un exercice", () => {
  it("échange la machine et garde la prescription", () => {
    const { lignes, refus } = projeter(
      SEANCE, { type: "remplacer_exercice", ligneId: "l1", versInstanceId: "i4" }, nommer,
    );
    expect(refus).toBeNull();
    expect(lignes[0]).toMatchObject({
      id: "l1", ordre: 1, exerciseInstanceId: "i4", nom: "Développé incliné",
      seriesCibles: 4, repsMin: 6, repsMax: 10,
    });
    // Les autres lignes ne bougent pas : une proposition ne touche qu'à ce
    // qu'elle annonce.
    expect(lignes.slice(1)).toEqual(SEANCE.slice(1));
  });

  it("refuse une machine qui n'existe pas dans la salle", () => {
    const { refus, lignes } = projeter(
      SEANCE, { type: "remplacer_exercice", ligneId: "l1", versInstanceId: "inconnue" }, nommer,
    );
    expect(refus).toMatch(/n'existe pas/);
    expect(lignes).toEqual(SEANCE);
  });

  it("refuse de créer un doublon dans la séance", () => {
    const { refus } = projeter(
      SEANCE, { type: "remplacer_exercice", ligneId: "l1", versInstanceId: "i2" }, nommer,
    );
    expect(refus).toMatch(/déjà dans la séance/);
  });

  it("refuse une ligne qui n'est plus là", () => {
    const { refus } = projeter(
      SEANCE, { type: "remplacer_exercice", ligneId: "disparue", versInstanceId: "i4" }, nommer,
    );
    expect(refus).toMatch(/n'existe plus/);
  });
});

describe("ajuster le volume", () => {
  it("ne change que ce qui est renseigné", () => {
    const { lignes, refus } = projeter(
      SEANCE, { type: "ajuster_volume", ligneId: "l3", seriesCibles: 4 }, nommer,
    );
    expect(refus).toBeNull();
    expect(lignes[2]).toMatchObject({ seriesCibles: 4, repsMin: 12, repsMax: 15 });
  });

  it("refuse au-delà des bornes, dans les deux sens", () => {
    for (const series of [0, BORNES.seriesMax + 1, 2.5]) {
      const { refus } = projeter(SEANCE, { type: "ajuster_volume", ligneId: "l1", seriesCibles: series }, nommer);
      expect(refus, `séries = ${series}`).toMatch(/séries/);
    }
  });

  it("refuse une fourchette inversée", () => {
    const { refus } = projeter(
      SEANCE, { type: "ajuster_volume", ligneId: "l1", repsMin: 12, repsMax: 6 }, nommer,
    );
    expect(refus).toMatch(/inversée/);
  });

  it("refuse un ajustement qui ne change rien", () => {
    // Sans ça, l'athlète recevrait une carte à confirmer pour un non-événement.
    const { refus } = projeter(
      SEANCE, { type: "ajuster_volume", ligneId: "l1", seriesCibles: 4, repsMin: 6, repsMax: 10 }, nommer,
    );
    expect(refus).toMatch(/ne change rien/);
  });
});

describe("ajouter un exercice", () => {
  it("place la ligne à la fin, sans identifiant définitif", () => {
    const { lignes, refus } = projeter(
      SEANCE,
      { type: "ajouter_exercice", exerciseInstanceId: "i5", seriesCibles: 3, repsMin: 8, repsMax: 12 },
      nommer,
    );
    expect(refus).toBeNull();
    expect(lignes).toHaveLength(4);
    // L'identifiant viendra de l'insertion : la projection ne l'invente pas.
    expect(lignes[3]).toMatchObject({ id: NOUVELLE_LIGNE, ordre: 4, nom: "Curl pupitre" });
  });

  it("refuse de dépasser la taille maximale d'une séance", () => {
    const pleine: LigneProgramme[] = Array.from({ length: BORNES.lignesMax }, (_, i) => ({
      id: `l${i}`, ordre: i + 1, exerciseInstanceId: `x${i}`, nom: `Exercice ${i}`,
      seriesCibles: 3, repsMin: 8, repsMax: 12,
    }));
    const { refus } = projeter(
      pleine,
      { type: "ajouter_exercice", exerciseInstanceId: "i5", seriesCibles: 3, repsMin: 8, repsMax: 12 },
      nommer,
    );
    expect(refus).toMatch(new RegExp(`${BORNES.lignesMax}`));
  });

  it("refuse un exercice déjà présent", () => {
    const { refus } = projeter(
      SEANCE,
      { type: "ajouter_exercice", exerciseInstanceId: "i2", seriesCibles: 3, repsMin: 8, repsMax: 12 },
      nommer,
    );
    expect(refus).toMatch(/déjà dans la séance/);
  });
});

describe("l'empreinte, pour refuser une proposition devenue fausse", () => {
  it("ne bouge pas quand rien ne bouge", () => {
    expect(empreinteDe(SEANCE)).toBe(empreinteDe([...SEANCE].reverse()));
  });

  it("change dès qu'une prescription change", () => {
    const modifiee = SEANCE.map((l) => (l.id === "l1" ? { ...l, seriesCibles: 5 } : l));
    expect(empreinteDe(modifiee)).not.toBe(empreinteDe(SEANCE));
  });

  it("change quand une ligne apparaît ou disparaît", () => {
    expect(empreinteDe(SEANCE.slice(0, 2))).not.toBe(empreinteDe(SEANCE));
  });

  it("ignore ce que la proposition ne touche pas", () => {
    // Le nom affiché n'entre pas dans l'empreinte : renommer un exercice au
    // catalogue ne doit pas périmer une proposition sur les séries.
    const renommee = SEANCE.map((l) => ({ ...l, nom: `${l.nom} (nouvelle machine)` }));
    expect(empreinteDe(renommee)).toBe(empreinteDe(SEANCE));
  });
});

describe("la péremption", () => {
  it("laisse passer une proposition récente et refuse une vieille", () => {
    const maintenant = new Date("2026-08-31T12:00:00Z");
    const recente = new Date(maintenant.getTime() - (BORNES.validiteMinutes - 1) * 60_000);
    const vieille = new Date(maintenant.getTime() - (BORNES.validiteMinutes + 1) * 60_000);
    expect(estPerimee(recente, maintenant)).toBe(false);
    expect(estPerimee(vieille, maintenant)).toBe(true);
  });
});

describe("l'aperçu, construit par différence", () => {
  it("lit un remplacement comme un départ et une arrivée", () => {
    const { lignes } = projeter(
      SEANCE, { type: "remplacer_exercice", ligneId: "l1", versInstanceId: "i4" }, nommer,
    );
    const apercu = construireApercu(SEANCE, lignes);
    const mouvements = apercu.lignes.filter((l) => l.mouvement !== "inchange");
    expect(mouvements).toEqual([
      { mouvement: "retire", nom: "Développé couché", avant: "4 × 6-10", apres: null },
      { mouvement: "ajoute", nom: "Développé incliné", avant: null, apres: "4 × 6-10" },
    ]);
    expect(apercu.resume).toMatch(/Un exercice remplacé/);
    // Un remplacement à prescription égale ne change pas le volume.
    expect(apercu.seriesApres).toBe(apercu.seriesAvant);
  });

  it("chiffre l'effet d'un ajustement sur le volume de la séance", () => {
    const { lignes } = projeter(
      SEANCE, { type: "ajuster_volume", ligneId: "l3", seriesCibles: 5 }, nommer,
    );
    const apercu = construireApercu(SEANCE, lignes);
    expect(apercu.seriesAvant).toBe(11);
    expect(apercu.seriesApres).toBe(13);
    expect(apercu.resume).toContain("+2 séries");
    expect(apercu.lignes.find((l) => l.mouvement === "modifie")).toMatchObject({
      nom: "Élévations latérales", avant: "3 × 12-15", apres: "5 × 12-15",
    });
  });

  it("annonce un ajout et l'attribue à la bonne ligne", () => {
    const { lignes } = projeter(
      SEANCE,
      { type: "ajouter_exercice", exerciseInstanceId: "i5", seriesCibles: 3, repsMin: 10, repsMax: 10 },
      nommer,
    );
    const apercu = construireApercu(SEANCE, lignes);
    const ajouts = apercu.lignes.filter((l) => l.mouvement === "ajoute");
    expect(ajouts).toEqual([
      { mouvement: "ajoute", nom: "Curl pupitre", avant: null, apres: "3 × 10" },
    ]);
    expect(apercu.lignes.filter((l) => l.mouvement === "retire")).toHaveLength(0);
  });

  it("laisse les lignes intactes marquées comme telles", () => {
    const { lignes } = projeter(SEANCE, { type: "ajuster_volume", ligneId: "l1", seriesCibles: 5 }, nommer);
    const apercu = construireApercu(SEANCE, lignes);
    expect(apercu.lignes.filter((l) => l.mouvement === "inchange")).toHaveLength(2);
  });

  it("porte les avertissements sans les transformer en refus", () => {
    const apercu = construireApercu(SEANCE, SEANCE, ["Épaules à 22 séries cette semaine"]);
    expect(apercu.avertissements).toEqual(["Épaules à 22 séries cette semaine"]);
    expect(apercuEnTexte(apercu)).toContain("Épaules à 22 séries");
  });

  it("écrit une prescription comme elle se lit", () => {
    expect(prescription({ seriesCibles: 4, repsMin: 6, repsMax: 10 })).toBe("4 × 6-10");
    // Une fourchette réduite à un point ne s'écrit pas « 10-10 ».
    expect(prescription({ seriesCibles: 5, repsMin: 10, repsMax: 10 })).toBe("5 × 10");
  });
});

describe("le même calcul produit toujours le même aperçu", () => {
  it("deux projections identiques donnent deux aperçus identiques", () => {
    // C'est ce qui autorise à recalculer au moment d'appliquer plutôt qu'à
    // rejouer un après figé : le déterminisme est la garantie que ce qui sera
    // écrit est ce qui a été montré.
    const operation = { type: "ajuster_volume", ligneId: "l2", repsMin: 6, repsMax: 8 } as const;
    const a = construireApercu(SEANCE, projeter(SEANCE, operation, nommer).lignes);
    const b = construireApercu(SEANCE, projeter(SEANCE, operation, nommer).lignes);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
