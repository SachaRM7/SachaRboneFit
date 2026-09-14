import { describe, it, expect, afterEach } from "vitest";
import { chaineDeModeles, fournisseurActif } from "./llm-client";

const VARIABLES = ["LLM_CHAINE_COURANTE", "LLM_CHAINE_LOURDE"] as const;

afterEach(() => {
  for (const v of VARIABLES) delete process.env[v];
});

describe("chaineDeModeles", () => {
  it("utilise GLM 5.3 Flash via OpenCode pour les appels courants", () => {
    const chaine = chaineDeModeles("courant");
    expect(chaine.map((c) => c.modele)).toEqual([
      "glm-5.3-flash",
      "glm-5.3",
    ]);
    expect(chaine.every((c) => c.fournisseur === "opencode")).toBe(true);
  });

  it("préfère GLM 5.3 complet pour les appels lourds", () => {
    expect(chaineDeModeles("lourd").map((c) => c.modele)).toEqual([
      "glm-5.3",
      "glm-5.3-flash",
    ]);
  });

  it("se règle entièrement par variable d'environnement", () => {
    process.env.LLM_CHAINE_COURANTE = "gemini:gemini-2.0-flash,opencode:minimax-m3";
    expect(chaineDeModeles("courant")).toEqual([
      { fournisseur: "gemini", modele: "gemini-2.0-flash" },
      { fournisseur: "opencode", modele: "minimax-m3" },
    ]);
  });

  it("conserve les deux-points internes au nom du modèle", () => {
    process.env.LLM_CHAINE_COURANTE = "opencode:modele:variante";
    expect(chaineDeModeles("courant")).toEqual([
      { fournisseur: "opencode", modele: "modele:variante" },
    ]);
  });

  it("ignore les entrées inexploitables plutôt que de les propager", () => {
    process.env.LLM_CHAINE_COURANTE = "inconnu:x,opencode:,sansdeuxpoints,opencode:glm-5.3";
    expect(chaineDeModeles("courant")).toEqual([
      { fournisseur: "opencode", modele: "glm-5.3" },
    ]);
  });

  it("retombe sur la chaîne par défaut si la variable est illisible", () => {
    // Une faute de frappe en production ne doit pas rendre le coach muet.
    process.env.LLM_CHAINE_COURANTE = "n'importe quoi";
    expect(chaineDeModeles("courant")).toHaveLength(2);
    expect(chaineDeModeles("courant")[0]!.modele).toBe("glm-5.3-flash");
  });
});

describe("fournisseurActif", () => {
  it("désigne le premier fournisseur de la chaîne courante", () => {
    expect(fournisseurActif()).toBe("opencode");
    process.env.LLM_CHAINE_COURANTE = "gemini:gemini-2.0-flash";
    expect(fournisseurActif()).toBe("gemini");
  });
});
