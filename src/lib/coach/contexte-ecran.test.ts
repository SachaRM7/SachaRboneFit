import { describe, it, expect } from "vitest";
import {
  contexteValide, amorce, suggestions, ECRANS, SUJETS,
} from "./contexte-ecran";
import { verdictMemoire, normaliser } from "./memoire-durable";

const UUID = "3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607";

describe("contexte reçu du client", () => {
  it("n'accepte qu'un écran connu", () => {
    expect(contexteValide({ ecran: "programme" })?.ecran).toBe("programme");
    expect(contexteValide({ ecran: "banque" })).toBeNull();
    expect(contexteValide(null)).toBeNull();
    expect(contexteValide("programme")).toBeNull();
  });

  it("ignore tout champ qui n'est pas une désignation attendue", () => {
    // Le point de sécurité : rien de ce que le client invente ne passe.
    const c = contexteValide({
      ecran: "programme",
      userId: "un-autre-utilisateur",
      user_id: "un-autre-utilisateur",
      donnees: { charges: [200] },
    });
    expect(c).toEqual({ ecran: "programme", typeEntite: null, entiteId: null, sujet: null });
    expect(JSON.stringify(c)).not.toMatch(/user/i);
  });

  it("ne retient un identifiant que s'il est un UUID et qu'un type l'accompagne", () => {
    expect(contexteValide({ ecran: "programme", typeEntite: "bloc", entiteId: UUID })?.entiteId).toBe(UUID);
    // Un identifiant sans type ne désigne rien.
    expect(contexteValide({ ecran: "programme", entiteId: UUID })?.entiteId).toBeNull();
    // Une valeur qui n'est pas un UUID est écartée avant même la base.
    expect(
      contexteValide({ ecran: "programme", typeEntite: "bloc", entiteId: "'; DROP TABLE users; --" })?.entiteId,
    ).toBeNull();
  });

  it("n'accepte qu'une intention connue", () => {
    expect(contexteValide({ ecran: "programme", sujet: "modifier_programme" })?.sujet).toBe("modifier_programme");
    expect(contexteValide({ ecran: "programme", sujet: "supprimer_tout" })?.sujet).toBeNull();
  });
});

describe("amorce et suggestions", () => {
  it("propose une aide générique sans contexte, sans rien fabriquer", () => {
    expect(amorce(null)).toBe("Comment puis-je t'aider ?");
    expect(suggestions(null).map((s) => s.libelle)).toEqual([
      "Mon programme", "Ma progression", "Ma récupération", "Mes exercices",
    ]);
  });

  it("nomme l'écran regardé", () => {
    expect(amorce({ ecran: "programme" })).toMatch(/programme/i);
    expect(amorce({ ecran: "progression" })).toMatch(/progression/i);
    expect(amorce({ ecran: "seance" })).toMatch(/séance/i);
  });

  it("l'intention prime sur l'écran", () => {
    const c = { ecran: "programme" as const, sujet: "modifier_programme" as const };
    expect(amorce(c)).toBe("Tu veux modifier ton programme actuel.");
    expect(suggestions(c).map((s) => s.libelle)).toContain("Changer mes jours");
  });

  it("adapte les suggestions à chaque écran", () => {
    expect(suggestions({ ecran: "seance" }).map((s) => s.libelle)).toContain("J'ai une gêne");
    expect(suggestions({ ecran: "progression" }).map((s) => s.libelle)).toContain("Pourquoi je stagne ?");
  });

  it("ne propose jamais plus de quatre suggestions", () => {
    for (const ecran of ECRANS) {
      expect(suggestions({ ecran }).length).toBeGreaterThanOrEqual(3);
      expect(suggestions({ ecran }).length).toBeLessThanOrEqual(4);
    }
    for (const sujet of SUJETS) {
      expect(suggestions({ ecran: "programme", sujet }).length).toBeLessThanOrEqual(4);
    }
  });

  it("donne à chaque suggestion un message réellement envoyable", () => {
    for (const ecran of ECRANS) {
      for (const s of suggestions({ ecran })) {
        expect(s.message.length).toBeGreaterThan(s.libelle.length / 2);
        expect(s.message.trim()).toBe(s.message);
      }
    }
  });
});

describe("mémoire durable", () => {
  it("retient une régularité", () => {
    expect(verdictMemoire("Il préfère les exercices à la barre plutôt qu'aux machines").retenue).toBe(true);
    expect(verdictMemoire("Ses épaules récupèrent lentement après les développés").retenue).toBe(true);
  });

  it("refuse un fait du jour", () => {
    // Exactement ce que la demande interdit : un événement ponctuel enregistré
    // comme trait durable de l'athlète.
    const v = verdictMemoire("Il est fatigué aujourd'hui");
    expect(v.retenue).toBe(false);
    expect(v.raison).toMatch(/moment/i);

    expect(verdictMemoire("La machine était occupée ce soir").retenue).toBe(false);
    expect(verdictMemoire("Il a mal dormi cette nuit").retenue).toBe(false);
    expect(verdictMemoire("Cette séance a été écourtée").retenue).toBe(false);
  });

  it("refuse un doublon, quels que soient accents et casse", () => {
    const existantes = ["Il préfère les exercices à la barre"];
    expect(verdictMemoire("Il préfère les exercices à la barre", existantes).retenue).toBe(false);
    expect(verdictMemoire("IL PREFERE LES EXERCICES A LA BARRE", existantes).retenue).toBe(false);
    expect(verdictMemoire("Il préfère les poulies", existantes).retenue).toBe(true);
  });

  it("refuse une observation trop courte pour dire quoi que ce soit", () => {
    expect(verdictMemoire("ok").retenue).toBe(false);
  });

  it("normalise accents, casse et espaces avant de comparer", () => {
    expect(normaliser("  Épaules   FATIGUÉES ")).toBe("epaules fatiguees");
  });
});
