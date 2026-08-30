import { describe, it, expect } from "vitest";
import {
  classerEmpechements,
  deciderRetour,
  expliquerRetour,
  suggestionsProgramme,
  SEUILS_MEMOIRE,
  type EmpechementBrut,
  type EmpechementClasse,
  type GardeFousRetour,
} from "./memoire-empechements";

const AUJOURDHUI = "2026-09-21";

const empechement = (date: string, patch: Partial<EmpechementBrut> = {}): EmpechementBrut => ({
  exerciceId: "developpe",
  instanceId: "inst-developpe",
  nom: "Développé couché",
  date,
  contexte: { type: "changement_lieu", lieuApresId: "maison", lieuApresNom: "Maison" },
  ...patch,
});

const classer = (empechements: EmpechementBrut[]) =>
  classerEmpechements({ empechements, aujourdhui: AUJOURDHUI });

const gardeFous = (patch: Partial<GardeFousRetour> = {}): GardeFousRetour => ({
  realisableAujourdhui: true,
  recuperationSuffisante: true,
  seriesHebdoRestantes: 8,
  frequenceMusculaireRespectee: true,
  phaseCompatible: true,
  dureeDisponibleSuffisante: true,
  ...patch,
});

const classe = (patch: Partial<EmpechementClasse> = {}): EmpechementClasse => ({
  exerciceId: "developpe",
  instanceId: "inst-developpe",
  nom: "Développé couché",
  statut: "repete",
  occurrences: 2,
  dates: ["2026-09-19", "2026-09-16"],
  lieux: [{ id: "maison", nom: "Maison" }],
  memeLieu: true,
  ...patch,
});

describe("incident, répétition, changement durable", () => {
  it("une fois : un incident, rien de plus", () => {
    const [c] = classer([empechement("2026-09-19")]);
    expect(c!.statut).toBe("ponctuel");
    expect(c!.occurrences).toBe(1);
  });

  it("deux fois : une répétition", () => {
    const [c] = classer([empechement("2026-09-19"), empechement("2026-09-16")]);
    expect(c!.statut).toBe("repete");
  });

  it("trois fois au même endroit : un changement durable", () => {
    const [c] = classer([
      empechement("2026-09-19"),
      empechement("2026-09-16"),
      empechement("2026-09-14"),
    ]);
    expect(c!.statut).toBe("durable");
    expect(c!.memeLieu).toBe(true);
  });

  it("trois fois dans trois lieux différents ne dit pas la même chose", () => {
    // Une salle en travaux, un déplacement, une machine occupée : c'est de la
    // répétition, pas un déménagement.
    const [c] = classer([
      empechement("2026-09-19", { contexte: { type: "changement_lieu", lieuApresId: "a", lieuApresNom: "A" } }),
      empechement("2026-09-16", { contexte: { type: "changement_lieu", lieuApresId: "b", lieuApresNom: "B" } }),
      empechement("2026-09-14", { contexte: { type: "changement_lieu", lieuApresId: "c", lieuApresNom: "C" } }),
    ]);
    expect(c!.statut).toBe("repete");
    expect(c!.memeLieu).toBe(false);
  });

  it("oublie ce qui est trop ancien pour peser sur aujourd'hui", () => {
    const vieux = new Date(`${AUJOURDHUI}T00:00:00Z`);
    vieux.setUTCDate(vieux.getUTCDate() - SEUILS_MEMOIRE.fenetreJours - 1);
    expect(classer([empechement(vieux.toISOString().slice(0, 10))])).toEqual([]);
  });

  it("se règle depuis les seuils", () => {
    const deux = [empechement("2026-09-19"), empechement("2026-09-16")];
    expect(classerEmpechements({ empechements: deux, aujourdhui: AUJOURDHUI }).at(0)!.statut).toBe("repete");
    expect(
      classerEmpechements({
        empechements: deux,
        aujourdhui: AUJOURDHUI,
        seuils: { ...SEUILS_MEMOIRE, occurrencesDurable: 2 },
      }).at(0)!.statut,
    ).toBe("durable");
  });
});

describe("retour favorisé, jamais forcé", () => {
  it("favorise le retour quand tous les garde-fous sont d'accord", () => {
    const d = deciderRetour(classe(), gardeFous(), 4);
    expect(d.favorise).toBe(true);
    expect(d.explication).toBeTruthy();
  });

  it("ne force rien : récupération insuffisante suffit à refuser", () => {
    const d = deciderRetour(classe(), gardeFous({ recuperationSuffisante: false }), 4);
    expect(d.favorise).toBe(false);
    expect(d.motif).toMatch(/récupéré/);
  });

  it("chaque garde-fou peut refuser à lui seul", () => {
    const cas: Array<[Partial<GardeFousRetour>, RegExp]> = [
      [{ realisableAujourdhui: false }, /indisponible/],
      [{ phaseCompatible: false }, /phase/i],
      [{ frequenceMusculaireRespectee: false }, /souvent/],
      [{ dureeDisponibleSuffisante: false }, /temps/],
      [{ seriesHebdoRestantes: 2 }, /semaine/i],
    ];
    for (const [patch, motif] of cas) {
      const d = deciderRetour(classe(), gardeFous(patch), 4);
      expect(d.favorise, JSON.stringify(patch)).toBe(false);
      expect(d.motif).toMatch(motif);
    }
  });

  it("un empêchement ponctuel donne droit au même traitement", () => {
    // Le statut sert à décider s'il faut revoir le PROGRAMME, pas à mériter un
    // retour : un incident isolé reste une bonne raison de remettre l'exercice.
    const d = deciderRetour(classe({ statut: "ponctuel", occurrences: 1 }), gardeFous(), 4);
    expect(d.favorise).toBe(true);
  });
});

describe("aucun rattrapage de volume", () => {
  it("le retour ne demande jamais plus de séries que la place qu'il occupe", () => {
    // Deux séances manquées ne donnent pas droit à huit séries : la décision
    // porte sur les séries de la place, et sur rien d'autre.
    const deuxManquees = classe({ occurrences: 2 });
    expect(deciderRetour(deuxManquees, gardeFous({ seriesHebdoRestantes: 4 }), 4).favorise).toBe(true);
    expect(deciderRetour(deuxManquees, gardeFous({ seriesHebdoRestantes: 3 }), 4).favorise).toBe(false);
  });

  it("le nombre d'empêchements n'entre pas dans la décision de volume", () => {
    const g = gardeFous({ seriesHebdoRestantes: 4 });
    const une = deciderRetour(classe({ occurrences: 1 }), g, 4);
    const cinq = deciderRetour(classe({ occurrences: 5 }), g, 4);
    expect(une.favorise).toBe(cinq.favorise);
  });

  it("ne produit aucune prescription, seulement une décision", () => {
    const d = deciderRetour(classe(), gardeFous(), 4);
    // Rien dans la sortie ne peut ajouter d'exercice ni de série.
    expect(Object.keys(d).sort()).toEqual(["exerciceId", "explication", "favorise", "motif"]);
  });
});

describe("changement durable : le programme, pas la séance", () => {
  it("suggère de revoir le programme, sans rien modifier", () => {
    const s = suggestionsProgramme([classe({ statut: "durable", occurrences: 3 })]);
    expect(s).toHaveLength(1);
    expect(s[0]!.message).toMatch(/Maison/);
    expect(s[0]!.message).toMatch(/programme/);
  });

  it("ne suggère rien pour un incident ou une simple répétition", () => {
    expect(suggestionsProgramme([classe({ statut: "ponctuel" }), classe({ statut: "repete" })])).toEqual([]);
  });
});

describe("ce qui est dit à l'athlète", () => {
  it("nomme l'exercice, le nombre de séances et le lieu", () => {
    const phrase = expliquerRetour(classe({ occurrences: 2 }));
    expect(phrase).toBe(
      "Je remets Développé couché aujourd'hui : il avait été remplacé lors de tes 2 dernières séances à Maison.",
    );
  });

  it("reste au singulier pour une seule séance", () => {
    expect(expliquerRetour(classe({ occurrences: 1 }))).toMatch(/lors de ta dernière séance/);
  });

  it("ne reproche rien et n'alarme pas", () => {
    const phrase = expliquerRetour(classe());
    expect(phrase).not.toMatch(/rattrap|dette|retard|manqué|raté|dû/i);
  });
});
