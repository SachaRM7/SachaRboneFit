import { describe, expect, it } from "vitest";
import { suggestionsVerifiees, QUESTIONS_PEDAGOGIQUES } from "@/lib/coach/accueil-conversation";
import { contexteValide } from "@/lib/coach/contexte-ecran";

describe("accueil Coach fondé sur le contexte", () => {
  it("reste pédagogique sans historique et ne fabrique aucune séance", () => {
    expect(suggestionsVerifiees({ seance: false, historique: false, programme: false, exercice: false })).toEqual(QUESTIONS_PEDAGOGIQUES);
  });
  it("priorise les questions utiles, quatre au maximum", () => {
    const choix = suggestionsVerifiees({ seance: true, historique: true, programme: true, exercice: true });
    expect(choix).toHaveLength(4);
    expect(choix.slice(0, 3).map((s) => s.libelle)).toEqual(["Pourquoi cette charge ?", "Explique ma séance", "Comment je progresse ?"]);
  });
  it("ne confond pas programme et séance existante", () => {
    const choix = suggestionsVerifiees({ seance: false, historique: false, programme: true, exercice: false });
    expect(choix[0]?.libelle).toBe("Comprendre mon programme");
    expect(choix.some((s) => s.libelle === "Explique ma séance")).toBe(false);
  });
  it("ne transmet que les identifiants et le numéro de série validés", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(contexteValide({ ecran: "seance", sessionLogId: id, numeroSerie: 2, charge: 999, userId: id })).toMatchObject({ sessionLogId: id, numeroSerie: 2 });
    const invalide = contexteValide({ ecran: "seance", sessionLogId: "autre", numeroSerie: -1, charge: 999 });
    expect(invalide).not.toHaveProperty("sessionLogId");
    expect(invalide).not.toHaveProperty("numeroSerie");
    expect(invalide).not.toHaveProperty("charge");
  });
});
