import { describe, it, expect, afterEach } from "vitest";
import { chaineDeModeles, fournisseurActif } from "./llm-client";

const VARIABLES = ["LLM_CHAINE_COURANTE", "LLM_CHAINE_LOURDE"] as const;

afterEach(() => {
  for (const v of VARIABLES) delete process.env[v];
});

describe("chaineDeModeles", () => {
  it("place Qwen devant GPT-OSS pour les appels courants", () => {
    const chaine = chaineDeModeles("courant");
    expect(chaine.map((c) => c.modele)).toEqual([
      "qwen/qwen3.8-27b",
      "openai/gpt-oss-120b",
    ]);
    expect(chaine.every((c) => c.fournisseur === "groq")).toBe(true);
  });

  it("inverse l'ordre pour les appels lourds", () => {
    // Le quota de GPT-OSS est dix fois plus petit : on ne le dépense que sur
    // les décisions qui le justifient, mais on le préfère quand elles arrivent.
    expect(chaineDeModeles("lourd").map((c) => c.modele)).toEqual([
      "openai/gpt-oss-120b",
      "qwen/qwen3.8-27b",
    ]);
  });

  it("se règle entièrement par variable d'environnement", () => {
    // C'est la garantie recherchée : Qwen est en Preview chez Groq, changer de
    // modèle ne doit toucher aucune ligne de code.
    process.env.LLM_CHAINE_COURANTE = "gemini:gemini-2.0-flash,groq:llama-3.3-70b-versatile";
    expect(chaineDeModeles("courant")).toEqual([
      { fournisseur: "gemini", modele: "gemini-2.0-flash" },
      { fournisseur: "groq", modele: "llama-3.3-70b-versatile" },
    ]);
  });

  it("conserve les deux-points internes au nom du modèle", () => {
    process.env.LLM_CHAINE_COURANTE = "groq:qwen/qwen3.8-27b:free";
    expect(chaineDeModeles("courant")).toEqual([
      { fournisseur: "groq", modele: "qwen/qwen3.8-27b:free" },
    ]);
  });

  it("ignore les entrées inexploitables plutôt que de les propager", () => {
    process.env.LLM_CHAINE_COURANTE = "inconnu:x,groq:,sansdeuxpoints,groq:openai/gpt-oss-120b";
    expect(chaineDeModeles("courant")).toEqual([
      { fournisseur: "groq", modele: "openai/gpt-oss-120b" },
    ]);
  });

  it("retombe sur la chaîne par défaut si la variable est illisible", () => {
    // Une faute de frappe en production ne doit pas rendre le coach muet.
    process.env.LLM_CHAINE_COURANTE = "n'importe quoi";
    expect(chaineDeModeles("courant")).toHaveLength(2);
    expect(chaineDeModeles("courant")[0]!.modele).toBe("qwen/qwen3.8-27b");
  });
});

describe("fournisseurActif", () => {
  it("désigne le premier fournisseur de la chaîne courante", () => {
    expect(fournisseurActif()).toBe("groq");
    process.env.LLM_CHAINE_COURANTE = "gemini:gemini-2.0-flash";
    expect(fournisseurActif()).toBe("gemini");
  });
});
