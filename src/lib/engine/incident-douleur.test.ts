import { describe, it, expect } from "vitest";
import {
  MOMENTS_DOULEUR, VERSION_CONTEXTE_DOULEUR,
  construireContexteDouleur, estMomentDouleur, signalementsDepuis,
} from "./incident-douleur";
import { suiteASignalement, INTENSITE_MINIMALE_REPETITION } from "./contraintes";
import { musclesDeLaZone } from "@/lib/referentiels/muscles";
import { regionsSignalees, zonesDesRegions } from "@/lib/referentiels/anatomie";

/**
 * Le chaînon manquant, et la dette qu'il ne doit pas effacer.
 *
 * L'écran écrivait `zones` + `niveau`, la règle lisait `muscle` + `intensite`.
 * Ces deux moitiés n'ont jamais communiqué : la détection de récurrence n'a pas
 * pu se déclencher une seule fois depuis qu'elle existe.
 *
 * La tentation était de repartir d'un format propre et d'oublier le reste. Ce
 * fichier vérifie surtout le contraire : un incident écrit AVANT ce lot doit
 * continuer de compter.
 */

const AVANT_HIER = "2026-09-01";
const AUJOURDHUI = "2026-09-06";

describe("le contexte canonique parle les deux vocabulaires", () => {
  const contexte = construireContexteDouleur({
    zones: zonesDesRegions(["face:epaule:gauche"]),
    regions: regionsSignalees(["face:epaule:gauche"]),
    niveau: 6,
    typeDouleur: "sourde",
    moment: "excentrique",
    arretConseille: false,
    aRetirer: ["11111111-1111-1111-1111-111111111111"],
    aAlleger: [],
  });

  it("il porte le nom que la règle lit ET le nom que l'historique porte", () => {
    expect(contexte.intensite).toBe(6);
    expect(contexte.niveau).toBe(6);
    expect(contexte.muscle).toBe("epaules");
    expect(contexte.zones).toEqual(["Épaule"]);
  });

  it("les muscles viennent des ZONES, jamais des régions", () => {
    // Le pont étroit : la face et le côté n'introduisent aucun muscle nouveau.
    expect(contexte.muscles.sort()).toEqual(musclesDeLaZone("Épaule").sort());
  });

  it("la région reste consignée, pour relire l'épisode", () => {
    expect(contexte.regions[0]).toMatchObject({
      zone: "Épaule", face: "face", cote: "gauche",
    });
  });

  it("le moment est persisté tel quel", () => {
    expect(contexte.moment).toBe("excentrique");
  });

  it("il est versionné, pour que la relecture sache à quoi elle a affaire", () => {
    expect(contexte.v).toBe(VERSION_CONTEXTE_DOULEUR);
  });

  it("les exercices touchés sont consignés une fois chacun", () => {
    const c = construireContexteDouleur({
      zones: ["Épaule"], regions: [], niveau: 5, typeDouleur: "sourde",
      arretConseille: false,
      aRetirer: ["a", "b"], aAlleger: ["b", "c"],
    });
    expect(c.a_retirer).toBe(2);
    expect(c.a_alleger).toBe(2);
    expect(c.exercices_concernes.sort()).toEqual(["a", "b", "c"]);
  });

  it("un moment absent reste absent, jamais deviné", () => {
    const c = construireContexteDouleur({
      zones: ["Épaule"], regions: [], niveau: 5, typeDouleur: "sourde",
      arretConseille: false, aRetirer: [], aAlleger: [],
    });
    expect(c.moment).toBeNull();
  });
});

describe("le moment de la gêne", () => {
  it("les six valeurs sont reconnues, et rien d'autre", () => {
    for (const m of MOMENTS_DOULEUR) expect(estMomentDouleur(m.valeur)).toBe(true);
    expect(estMomentDouleur("au réveil")).toBe(false);
    expect(estMomentDouleur(null)).toBe(false);
    expect(estMomentDouleur(3)).toBe(false);
  });

  it("chacune se lit en français, sans jargon de phase", () => {
    for (const m of MOMENTS_DOULEUR) {
      expect(m.libelle).toMatch(/\S/);
      expect(m.libelle).not.toContain("_");
    }
  });
});

describe("la relecture accepte les trois formes qui existent en base", () => {
  it("le format canonique", () => {
    const c = construireContexteDouleur({
      zones: ["Épaule"], regions: [], niveau: 7, typeDouleur: "aiguë",
      arretConseille: true, aRetirer: [], aAlleger: [],
    });
    const s = signalementsDepuis(c, AUJOURDHUI);
    expect(s.map((x) => x.muscle).sort()).toEqual(musclesDeLaZone("Épaule").sort());
    expect(s.every((x) => x.intensite === 7)).toBe(true);
  });

  it("l'ANCIEN format de l'écran — `zones` + `niveau`", () => {
    // Exactement ce qu'un incident de septembre porte en base. Il doit compter.
    const ancien = { zones: ["Genou"], niveau: 6, type_douleur: "sourde" };
    const s = signalementsDepuis(ancien, AVANT_HIER);
    expect(s.map((x) => x.muscle).sort()).toEqual(["ischios", "quadriceps"]);
    expect(s.every((x) => x.intensite === 6 && x.dateISO === AVANT_HIER)).toBe(true);
  });

  it("l'écriture serveur — `muscle` + `intensite`", () => {
    const s = signalementsDepuis({ muscle: "epaules", intensite: 8 }, AUJOURDHUI);
    expect(s).toEqual([{ muscle: "epaules", intensite: 8, dateISO: AUJOURDHUI }]);
  });

  it("un vocabulaire d'avant le référentiel unique passe encore", () => {
    // « pecs », « quads » : ils ont existé en base, `versMuscle` les connaît.
    expect(signalementsDepuis({ muscle: "pecs", niveau: 5 }, AUJOURDHUI))
      .toEqual([{ muscle: "pectoraux", intensite: 5, dateISO: AUJOURDHUI }]);
  });

  it("une intensité écrite en texte est lue, pas jetée", () => {
    expect(signalementsDepuis({ zones: ["Mollets"], niveau: "5" }, AUJOURDHUI))
      .toEqual([{ muscle: "mollets", intensite: 5, dateISO: AUJOURDHUI }]);
  });
});

describe("la relecture ne devine jamais", () => {
  it("sans intensité lisible, il n'y a rien à comparer", () => {
    // Compter un incident sans intensité comme une répétition fabriquerait une
    // récurrence qui n'a pas été vécue.
    expect(signalementsDepuis({ zones: ["Épaule"] }, AUJOURDHUI)).toEqual([]);
    expect(signalementsDepuis({ zones: ["Épaule"], niveau: "beaucoup" }, AUJOURDHUI)).toEqual([]);
  });

  it("une zone inconnue ne produit pas de muscle inventé", () => {
    expect(signalementsDepuis({ zones: ["Oreille"], niveau: 5 }, AUJOURDHUI)).toEqual([]);
  });

  it("un contexte vide, nul ou d'un autre type ne casse rien", () => {
    for (const brut of [null, undefined, {}, "douleur", 42, []]) {
      expect(signalementsDepuis(brut, AUJOURDHUI)).toEqual([]);
    }
  });

  it("un incident d'un autre SOS ne se lit pas comme une douleur", () => {
    // `machine_occupee` porte un contexte sans rapport ; il ne doit pas
    // ressortir comme un signalement.
    expect(signalementsDepuis({ machine: "Seated Row", attente_min: 10 }, AUJOURDHUI))
      .toEqual([]);
  });

  it("un muscle n'est jamais compté deux fois", () => {
    // « Épaule » et « Nuque » partagent `epaules` : deux zones, un muscle.
    const s = signalementsDepuis(
      { zones: ["Épaule", "Nuque / cervicales"], niveau: 5, muscle: "epaules" },
      AUJOURDHUI,
    );
    expect(new Set(s.map((x) => x.muscle)).size).toBe(s.length);
  });
});

describe("bout à bout : un ancien incident déclenche une récurrence", () => {
  it("septembre + aujourd'hui = deux signalements, donc une proposition", () => {
    // La démonstration complète du défaut corrigé. L'ancien incident est relu
    // par la couche de compatibilité, puis remis à la règle EXISTANTE — aucun
    // seuil n'est recopié ici.
    const ancien = signalementsDepuis(
      { zones: ["Épaule"], niveau: INTENSITE_MINIMALE_REPETITION },
      AVANT_HIER,
    );
    expect(ancien.length).toBeGreaterThan(0);

    const suite = suiteASignalement({
      signalement: { muscle: "epaules", intensite: 5, dateISO: AUJOURDHUI },
      anterieurs: ancien,
      contrainteActive: false,
    });
    expect(suite.suite).toBe("proposer_contrainte");
  });

  it("sans cette relecture, la même gêne n'aurait été qu'un incident", () => {
    // Le contrôle négatif : c'est littéralement ce que la liste vide produisait.
    const suite = suiteASignalement({
      signalement: { muscle: "epaules", intensite: 5, dateISO: AUJOURDHUI },
      anterieurs: [],
      contrainteActive: false,
    });
    expect(suite.suite).toBe("incident_seul");
  });
});
