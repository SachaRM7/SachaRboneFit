import { describe, it, expect } from "vitest";
import { evaluerDouleur, INTENSITE_ARRET, type ExerciceAvecMuscles } from "./douleur";

/**
 * « Douleur au poignet = retirer tous les exercices du poignet » est
 * exactement ce qu'il ne faut pas faire.
 *
 * L'ancienne version le faisait : à partir de 4/10 elle retirait TOUS les
 * exercices touchant la zone, sans distinguer ce qui la travaille de ce qui la
 * traverse. Le poignet n'est pas ce qu'on entraîne dans un tirage — il est un
 * maillon de la chaîne. Et le résultat s'affichait comme une décision prise,
 * pas comme une proposition.
 */

const exo = (
  nom: string,
  principaux: string[],
  secondaires: string[] = [],
): ExerciceAvecMuscles => ({
  exercise_instance_id: nom,
  nom,
  muscles_principaux: principaux,
  muscles_secondaires: secondaires,
  categorie_role: "pilier",
  statut: "à_venir",
  ordre: 1,
});

const CURL = exo("Curl pupitre", ["biceps"], ["avant_bras"]);
const TIRAGE = exo("Tirage vertical", ["dorsaux"], ["biceps", "avant_bras"]);
const PRESSE = exo("Presse à cuisses", ["quadriceps"], ["fessiers"]);

const propositionDe = (e: ReturnType<typeof evaluerDouleur>, nom: string) =>
  e.exercices.find((x) => x.nom === nom)?.proposition;

describe("le défaut d'origine : une gêne ne balaie pas tout ce qui la touche", () => {
  it("un poignet gêné ne retire pas les tirages", () => {
    // L'avant-bras y est secondaire : la zone participe, elle n'est pas visée.
    const e = evaluerDouleur(["Poignet"], 5, "sourde", [TIRAGE, PRESSE]);
    expect(propositionDe(e, "Tirage vertical")).toBe("alleger");
    expect(propositionDe(e, "Presse à cuisses")).toBe("poursuivre");
  });

  it("il allège en revanche ce qui vise la zone", () => {
    const e = evaluerDouleur(["Avant-bras"], 5, "sourde", [
      exo("Extensions poignets", ["avant_bras"]),
    ]);
    expect(propositionDe(e, "Extensions poignets")).toBe("retirer");
  });

  it("un exercice sans lien avec la zone n'est jamais concerné", () => {
    const e = evaluerDouleur(["Genou"], 6, "sourde", [CURL]);
    expect(e.exercices[0]?.implication).toBe("non_concerne");
    expect(e.exercices[0]?.proposition).toBe("poursuivre");
    expect(e.exercices[0]?.pourquoi).toContain("Rien ne relie");
  });
});

describe("cible et secondaire ne se valent pas", () => {
  it("un coude gêné vise le curl et traverse le tirage", () => {
    const e = evaluerDouleur(["Coude"], 5, "sourde", [CURL, TIRAGE]);
    expect(e.exercices.find((x) => x.nom === "Curl pupitre")?.implication).toBe("cible");
    expect(e.exercices.find((x) => x.nom === "Tirage vertical")?.implication).toBe("secondaire");
    expect(propositionDe(e, "Curl pupitre")).toBe("retirer");
    expect(propositionDe(e, "Tirage vertical")).toBe("alleger");
  });

  it("à faible intensité, même la cible n'est qu'allégée", () => {
    const e = evaluerDouleur(["Coude"], 2, "sourde", [CURL, TIRAGE]);
    expect(propositionDe(e, "Curl pupitre")).toBe("alleger");
    expect(propositionDe(e, "Tirage vertical")).toBe("poursuivre");
  });

  it("des muscles secondaires inconnus ne valent pas « aucun »", () => {
    // Sans la liste, on ne peut pas conclure que la zone n'est pas sollicitée.
    const sansSecondaires = exo("Tirage inconnu", ["dorsaux"]);
    const e = evaluerDouleur(["Coude"], 5, "sourde", [sansSecondaires]);
    expect(e.exercices[0]?.implication).toBe("non_concerne");
  });
});

describe("plusieurs zones se déclarent ensemble", () => {
  it("les muscles des deux zones comptent", () => {
    const e = evaluerDouleur(["Coude", "Genou"], 5, "sourde", [CURL, PRESSE]);
    expect(propositionDe(e, "Curl pupitre")).toBe("retirer");
    expect(propositionDe(e, "Presse à cuisses")).toBe("retirer");
  });

  it("la phrase nomme les zones déclarées", () => {
    const e = evaluerDouleur(["Coude", "Genou"], 5, "sourde", [CURL]);
    expect(e.exercices[0]?.pourquoi).toContain("Coude");
    expect(e.exercices[0]?.pourquoi).toContain("Genou");
  });
});

describe("la nature de la douleur prime sur son intensité", () => {
  it("une douleur aiguë conseille l'arrêt même à faible intensité", () => {
    const e = evaluerDouleur(["Épaule"], 2, "aiguë", [CURL]);
    expect(e.arretConseille).toBe(true);
    expect(e.message).toContain("aiguë");
  });

  it("une irradiation aussi", () => {
    expect(evaluerDouleur(["Bas du dos"], 3, "irradiation", [CURL]).arretConseille).toBe(true);
  });

  it("une raideur sourde à forte intensité conseille l'arrêt par l'intensité", () => {
    expect(evaluerDouleur(["Épaule"], INTENSITE_ARRET, "sourde", [CURL]).arretConseille).toBe(true);
  });

  it("mais même là, la liste reste une proposition", () => {
    // L'application ne sait ni ce qui fait mal exactement, ni depuis quand.
    const e = evaluerDouleur(["Épaule"], 9, "aiguë", [CURL, PRESSE]);
    expect(e.exercices).toHaveLength(2);
    expect(e.message).not.toMatch(/retiré|supprimé|appliqué/i);
  });
});

describe("rien n'est appliqué d'office", () => {
  it("le message le dit explicitement", () => {
    const e = evaluerDouleur(["Coude"], 5, "sourde", [CURL]);
    expect(e.message).toContain("tant que tu ne l'as pas choisi");
  });

  it("aucune zone concernée : le dire plutôt que de proposer dans le vide", () => {
    const e = evaluerDouleur(["Cheville"], 5, "sourde", [CURL, TIRAGE]);
    expect(e.arretConseille).toBe(false);
    expect(e.message).toContain("Aucun des exercices");
    expect(e.exercices.every((x) => x.proposition === "poursuivre")).toBe(true);
  });

  it("chaque exercice porte sa raison", () => {
    const e = evaluerDouleur(["Coude"], 5, "sourde", [CURL, TIRAGE, PRESSE]);
    for (const x of e.exercices) {
      expect(x.pourquoi.length).toBeGreaterThan(0);
    }
  });
});
