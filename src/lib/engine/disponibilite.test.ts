import { describe, it, expect } from "vitest";
import {
  exercicesRealisables,
  besoinCouvert,
  deductionPermise,
  exigeUnAppareil,
  statutInventaire,
  apportDeChaqueEquipement,
  type ExerciceDuCatalogue,
} from "./disponibilite";

const ex = (
  id: string,
  equipement: string | null,
  pilier = "P1_poussee",
  slug: string | null = null,
): ExerciceDuCatalogue => ({
  id,
  nom: `Exercice ${id}`,
  pilier,
  categorieRole: "pilier",
  musclesPrincipaux: ["pectoraux"],
  equipement,
  slug,
});

const CATALOGUE = [
  ex("pompes", "poids_du_corps"),
  ex("developpe-barre", "barre"),
  ex("developpe-halteres", "halteres"),
  ex("poulie-vis-a-vis", "poulie"),
  ex("presse", "machine", "P3_squat"),
];

describe("besoinCouvert", () => {
  it("laisse passer le poids du corps partout", () => {
    // Des pompes ne demandent rien : les refuser dans un lieu « sans matériel »
    // serait absurde.
    expect(besoinCouvert("poids_du_corps", [])).toBe(true);
  });

  it("exige que le lieu possède le matériel demandé", () => {
    expect(besoinCouvert("barre", ["halteres"])).toBe(false);
    expect(besoinCouvert("barre", ["halteres", "barre"])).toBe(true);
  });

  it("ne punit pas un besoin inconnu", () => {
    // Refuser faute d'information reviendrait à sanctionner une donnée manquante.
    expect(besoinCouvert(null, [])).toBe(true);
  });
});

describe("exercicesRealisables", () => {
  it("déduit du matériel du lieu, sans aucune saisie par exercice", () => {
    // Le cœur du modèle : déclarer « il y a des haltères » suffit.
    const r = exercicesRealisables({
      catalogue: CATALOGUE,
      equipementsDuLieu: ["halteres"],
      instances: [],
    });
    expect(r.map((x) => x.exerciceId).sort()).toEqual(["developpe-halteres", "pompes"]);
    expect(r.every((x) => x.origine === "materiel")).toBe(true);
  });

  it("rend une maison utilisable sans deuxième bibliothèque", () => {
    const maison = exercicesRealisables({
      catalogue: CATALOGUE,
      equipementsDuLieu: [],
      instances: [],
    });
    expect(maison.map((x) => x.exerciceId)).toEqual(["pompes"]);
  });

  it("ajoute le matériel apporté à celui du lieu", () => {
    // Des élastiques dans le sac changent ce qui est faisable aujourd'hui.
    const r = exercicesRealisables({
      catalogue: CATALOGUE,
      equipementsDuLieu: [],
      instances: [],
      equipementsApportes: ["halteres"],
    });
    expect(r.map((x) => x.exerciceId).sort()).toEqual(["developpe-halteres", "pompes"]);
  });

  it("préfère les incréments mesurés d'un appareil à ceux supposés", () => {
    const r = exercicesRealisables({
      catalogue: CATALOGUE,
      equipementsDuLieu: ["machine"],
      instances: [
        { id: "i-1", exerciseId: "presse", machineNom: "Presse Matrix", incrementsPossibles: [7.5] },
      ],
    });
    const presse = r.find((x) => x.exerciceId === "presse")!;
    expect(presse.origine).toBe("instance");
    expect(presse.instanceId).toBe("i-1");
    expect(presse.incrementsPossibles).toEqual([7.5]);
  });

  it("retient un appareil décrit même si le type n'est pas coché", () => {
    // L'avoir décrit vaut déclaration de présence : on l'a vu sur place.
    const r = exercicesRealisables({
      catalogue: CATALOGUE,
      equipementsDuLieu: [],
      instances: [
        { id: "i-1", exerciseId: "presse", machineNom: "Presse", incrementsPossibles: [5] },
      ],
    });
    expect(r.map((x) => x.exerciceId).sort()).toEqual(["pompes", "presse"]);
  });

  it("ne rend qu'une entrée par exercice, même avec deux appareils", () => {
    const r = exercicesRealisables({
      catalogue: CATALOGUE,
      equipementsDuLieu: ["machine"],
      instances: [
        { id: "i-1", exerciseId: "presse", machineNom: "Presse A", incrementsPossibles: [5] },
        { id: "i-2", exerciseId: "presse", machineNom: "Presse B", incrementsPossibles: [10] },
      ],
    });
    expect(r.filter((x) => x.exerciceId === "presse")).toHaveLength(1);
  });

  it("n'invente aucun incrément quand l'appareil précis n'en donne aucun", () => {
    const r = exercicesRealisables({
      catalogue: CATALOGUE,
      equipementsDuLieu: ["barre"],
      instances: [
        { id: "i-1", exerciseId: "developpe-barre", machineNom: "Barre", incrementsPossibles: null },
      ],
    });
    expect(r.find((x) => x.exerciceId === "developpe-barre")!.incrementsPossibles)
      .toEqual([]);
  });

  it("donne des incréments plausibles à un exercice seulement déduit", () => {
    const r = exercicesRealisables({
      catalogue: CATALOGUE,
      equipementsDuLieu: ["barre", "halteres"],
      instances: [],
    });
    expect(r.find((x) => x.exerciceId === "developpe-barre")!.incrementsPossibles).toEqual([1.25, 2.5, 5]);
    expect(r.find((x) => x.exerciceId === "developpe-halteres")!.incrementsPossibles).toEqual([2]);
  });
});

describe("appareils précis plutôt que « machine »", () => {
  // Une seule case « machine » rendait faisables vingt-six exercices exigeant
  // quinze appareils : avoir vu une presse proposait un leg curl absent.
  const presse = ex("presse", "machine", "P3_squat", "leg-press");
  const legCurl = ex("leg-curl", "machine", "jambes_iso", "leg-curl");

  it("n'ouvre pas tout le parc machines d'un coup", () => {
    const r = exercicesRealisables({
      catalogue: [presse, legCurl],
      equipementsDuLieu: ["leg_press"],
      instances: [],
    });
    expect(r.map((x) => x.exerciceId)).toEqual(["presse"]);
  });

  it("ouvre chaque appareil déclaré, et seulement lui", () => {
    const r = exercicesRealisables({
      catalogue: [presse, legCurl],
      equipementsDuLieu: ["leg_press", "leg_curl"],
      instances: [],
    });
    expect(r.map((x) => x.exerciceId).sort()).toEqual(["leg-curl", "presse"]);
  });

  it("regroupe les variantes d'un même appareil", () => {
    // Trois leg curls — allongé, assis, debout — ne sont qu'une machine.
    const r = exercicesRealisables({
      catalogue: [
        ex("lc1", "machine", "jambes_iso", "leg-curl"),
        ex("lc2", "machine", "jambes_iso", "lying-leg-curl"),
        ex("lc3", "machine", "jambes_iso", "seated-leg-curl"),
      ],
      equipementsDuLieu: ["leg_curl"],
      instances: [],
    });
    expect(r).toHaveLength(3);
  });

  it("laisse les familles non ambiguës telles quelles", () => {
    // Une barre est une barre : la découper n'apprendrait rien.
    const r = exercicesRealisables({
      catalogue: [ex("squat-barre", "barre", "P3_squat", "back-squat")],
      equipementsDuLieu: ["barre"],
      instances: [],
    });
    expect(r).toHaveLength(1);
  });

  it("un appareil décrit reste prioritaire sur la déclaration", () => {
    // On l'a saisi, donc on l'a vu : inutile d'exiger la case en plus.
    const r = exercicesRealisables({
      catalogue: [presse],
      equipementsDuLieu: [],
      instances: [
        { id: "i-1", exerciseId: "presse", machineNom: "Presse", incrementsPossibles: [10] },
      ],
    });
    expect(r).toHaveLength(1);
    expect(r[0]!.origine).toBe("instance");
  });
});

describe("apportDeChaqueEquipement", () => {
  it("classe ce qui débloquerait le plus d'exercices ici", () => {
    // De quoi guider la saisie : cocher « poulie » d'abord si c'est ce qui rend
    // le plus de choses possibles.
    const catalogue = [...CATALOGUE, ex("poulie-2", "poulie"), ex("poulie-3", "poulie")];
    const apport = apportDeChaqueEquipement(catalogue, ["halteres"]);
    expect(apport[0]).toEqual({ equipement: "poulie", exercicesEnPlus: 3 });
    expect(apport.map((a) => a.equipement)).not.toContain("halteres");
    // Le poids du corps ne se coche pas : il est toujours là.
    expect(apport.map((a) => a.equipement)).not.toContain("poids_du_corps");
  });
});


/**
 * Ce qu'un lieu déclare savoir de lui-même.
 *
 * Cocher « Poulie » rendait faisables les vingt-trois exercices à la poulie du
 * catalogue, y compris dans une salle dont chaque appareil avait été relevé un
 * par un — puis la calibration matérialisait ces exercices déduits en vraies
 * lignes d'inventaire. Ces tests fixent où la déduction s'arrête.
 */
describe("statut d'inventaire", () => {
  const catalogue = [
    {
      id: "e-poulie", nom: "Tirage poulie", pilier: "P2_tirage",
      categorieRole: "accessoire", musclesPrincipaux: ["dorsaux"],
      equipement: "poulie", slug: "straight-arm-pulldown",
    },
    {
      id: "e-presse", nom: "Presse à cuisses", pilier: "P3_squat",
      categorieRole: "pilier", musclesPrincipaux: ["quadriceps"],
      equipement: "machine", slug: "leg-press",
    },
    {
      id: "e-pompe", nom: "Pompes", pilier: "P1_poussee",
      categorieRole: "accessoire", musclesPrincipaux: ["pectoraux"],
      equipement: "poids_du_corps", slug: "push-up",
    },
  ];

  /** Une seule machine réellement décrite : la presse. */
  const presseDecrite = [{
    id: "i-presse", exerciseId: "e-presse", machineNom: "Leg Press 45°",
    incrementsPossibles: [5],
  }];

  const faisables = (statut: "inconnu" | "partiel" | "complet" | undefined, instances = presseDecrite) =>
    exercicesRealisables({
      catalogue,
      // La poulie est COCHÉE, mais aucune poulie n'est décrite.
      equipementsDuLieu: ["poulie", "leg_press"],
      instances,
      statut,
    });

  describe("inconnu — le comportement historique", () => {
    it("laisse la famille cochée rendre un exercice faisable", () => {
      const ids = faisables("inconnu").map((r) => r.exerciceId);
      expect(ids).toContain("e-poulie");
      expect(ids).toContain("e-presse");
      expect(ids).toContain("e-pompe");
    });

    it("est ce qu'on obtient sans se prononcer", () => {
      // Aucune salle existante ne change de comportement tant que personne
      // n'a déclaré quoi que ce soit.
      expect(faisables(undefined).map((r) => r.exerciceId))
        .toEqual(faisables("inconnu").map((r) => r.exerciceId));
    });

    it("marque l'origine de chaque exercice", () => {
      const parId = new Map(faisables("inconnu").map((r) => [r.exerciceId, r]));
      expect(parId.get("e-presse")?.origine).toBe("instance");
      expect(parId.get("e-poulie")?.origine).toBe("materiel");
    });
  });

  describe("partiel — les instances priment, la famille complète encore", () => {
    it("garde l'appareil décrit comme appareil décrit", () => {
      const presse = faisables("partiel").find((r) => r.exerciceId === "e-presse");
      expect(presse?.origine).toBe("instance");
      // Ses incréments sont mesurés, pas déduits du type de matériel.
      expect(presse?.incrementsPossibles).toEqual([5]);
    });

    it("autorise encore la famille cochée à compléter", () => {
      // C'est ce qui distingue « partiel » de « complet », et ce que l'écran
      // doit signaler : des exercices reposent sur du matériel supposé.
      const poulie = faisables("partiel").find((r) => r.exerciceId === "e-poulie");
      expect(poulie).toBeDefined();
      expect(poulie?.origine).toBe("materiel");
    });
  });

  describe("complet — plus rien n'est déduit", () => {
    it("écarte l'exercice dont l'appareil n'est pas décrit", () => {
      // La poulie est cochée. Aucune poulie n'a été vue. Le lieu a été
      // parcouru : ce qui n'y est pas décrit n'y est pas.
      expect(faisables("complet").map((r) => r.exerciceId)).not.toContain("e-poulie");
    });

    it("garde l'exercice dont l'appareil est décrit", () => {
      const presse = faisables("complet").find((r) => r.exerciceId === "e-presse");
      expect(presse?.origine).toBe("instance");
    });

    it("ne touche pas au poids du corps", () => {
      // Une pompe ne demande aucun appareil : il n'y a rien à ne pas trouver.
      expect(faisables("complet").map((r) => r.exerciceId)).toContain("e-pompe");
    });

    it("n'a plus aucun exercice d'origine « materiel » exigeant un appareil", () => {
      // L'invariant, dit d'un seul trait : dans une salle complète, tout
      // exercice qui demande une machine vient d'une instance réelle.
      for (const r of faisables("complet")) {
        if (r.equipement && r.equipement !== "poids_du_corps") {
          expect(r.origine, r.nom).toBe("instance");
        }
      }
    });
  });

  describe("la règle de déduction, isolée", () => {
    it("n'est refusée que sur un inventaire complet", () => {
      expect(deductionPermise("inconnu")).toBe(true);
      expect(deductionPermise("partiel")).toBe(true);
      expect(deductionPermise("complet")).toBe(false);
    });

    it("ne considère pas le poids du corps comme un appareil", () => {
      expect(exigeUnAppareil("poids_du_corps")).toBe(false);
      expect(exigeUnAppareil(null)).toBe(false);
      expect(exigeUnAppareil("poulie")).toBe(true);
      // Une barre de traction est un appareil : son absence de l'inventaire
      // d'une salle complète est une absence tout court.
      expect(exigeUnAppareil("barre_traction")).toBe(true);
    });

    it("lit une valeur absente ou inconnue comme « inconnu »", () => {
      expect(statutInventaire(null)).toBe("inconnu");
      expect(statutInventaire(undefined)).toBe("inconnu");
      expect(statutInventaire("n'importe quoi")).toBe("inconnu");
      expect(statutInventaire("complet")).toBe("complet");
    });
  });
});
