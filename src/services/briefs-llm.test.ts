import { describe, it, expect } from "vitest";
import { contenuIAValide, raisonCourte, BriefIndisponible } from "./briefs-llm";
import { CoachIndisponible } from "@/lib/coach/llm-client";

/**
 * Deux décisions qui n'ont besoin d'aucune base pour être vérifiées.
 *
 * `contenuIAValide` sépare un texte produit par un modèle d'un placeholder
 * hérité — c'est ce qui empêche un ancien contenu de rester à l'écran, et ce
 * qui empêche une panne de le tenir pour un résultat à conserver.
 *
 * `raisonCourte` décide de ce qui a le droit de sortir dans un journal. Sa
 * mission est autant de dire pourquoi l'appel a échoué que de NE PAS dire le
 * reste : le message d'origine traverse le fournisseur, et le corps d'une
 * réponse d'erreur peut reprendre tout ou partie de la requête.
 */

const TRACE = { modeleUtilise: "groq:qwen", genereLe: "2026-09-07T20:00:00.000Z" };

describe("reconnaître un contenu réellement produit par un modèle", () => {
  it("accepte un texte accompagné du modèle qui l'a écrit", () => {
    expect(contenuIAValide("Demain : Séance B. Priorité au dos.", TRACE)).toBe(true);
  });

  it("refuse un texte sans trace : le chemin actuel en dépose toujours une", () => {
    expect(contenuIAValide("Un texte plausible mais d'origine inconnue.", {})).toBe(false);
    expect(contenuIAValide("Un texte plausible.", null)).toBe(false);
    expect(contenuIAValide("Un texte plausible.", { modeleUtilise: "  " })).toBe(false);
  });

  it("refuse un contenu vide, même parfaitement tracé", () => {
    // Il serait stocké comme un résultat et s'afficherait comme un bloc blanc.
    expect(contenuIAValide("", TRACE)).toBe(false);
    expect(contenuIAValide("   \n ", TRACE)).toBe(false);
    expect(contenuIAValide(null, TRACE)).toBe(false);
    expect(contenuIAValide(undefined, TRACE)).toBe(false);
  });

  it("refuse les placeholders exacts que les crons écrivaient", () => {
    /*
     * Recopiés depuis `bf05623`. Ces lignes sont toujours en base : la PR n'en
     * supprime aucune, elle cesse de les prendre pour des résultats.
     */
    const precalc = "[Pré-calcul pour Sacha - Séance A]\n\nCe résumé est généré"
      + " automatiquement. Configurez l'intégration LLM pour générer un contenu personnalisé.";
    const weekly = "[Debrief hebdomadaire pour Sacha]\n\nSemaine du 2026-09-01 au 2026-09-07:"
      + "\n1 séances effectuées\n\nConfigurez l'intégration LLM pour un debrief personnalisé.";

    expect(contenuIAValide(precalc, { nextLetter: "A" })).toBe(false);
    expect(contenuIAValide(weekly, { nbSeances: 1, progressions: [] })).toBe(false);
  });

  it("et les refuse même si une trace venait à les accompagner", () => {
    /*
     * L'absence de trace suffirait aujourd'hui — les crons sont les seuls à
     * écrire dans ces deux tables. Les signatures disent ce qu'on REFUSE, et
     * couvrent le cas où un texte hérité se retrouverait recopié dans une ligne
     * tracée : une reprise manuelle, une restauration partielle.
     */
    const herite = "Configurez l'intégration LLM pour un debrief personnalisé.";
    expect(contenuIAValide(herite, TRACE)).toBe(false);
  });
});

describe("dire pourquoi sans dire ce qui a été envoyé", () => {
  it("distingue une panne du fournisseur d'une absence de configuration", () => {
    // Les deux n'appellent pas la même intervention : l'une s'attend, l'autre
    // se corrige.
    expect(raisonCourte(new CoachIndisponible("Groq indisponible", 503)))
      .toContain("HTTP 503");
    expect(raisonCourte(new CoachIndisponible("Clé GROQ_API_KEY non configurée")))
      .toContain("non configuré");
  });

  it("nomme une réponse vide pour ce qu'elle est", () => {
    expect(raisonCourte(new BriefIndisponible("Le modèle n'a renvoyé aucun texte.")))
      .toContain("réponse vide");
  });

  it("ne relaie jamais le message du fournisseur", () => {
    /*
     * `Groq 400 : {…}` reporte le corps de la réponse. Rien ne garantit qu'il
     * n'y figure pas un morceau du prompt — c'est-à-dire l'entraînement d'une
     * personne, ses zones ménagées, son état de récupération.
     */
    const fuite = new CoachIndisponible(
      'Groq 400 : {"prompt": "courbature 6/10 aux pectoraux, épaule ménagée"}', 400,
    );
    const raison = raisonCourte(fuite);
    expect(raison).not.toContain("courbature");
    expect(raison).not.toContain("pectoraux");
    expect(raison).not.toContain("{");
  });

  it("ne nomme pas non plus la variable d'environnement manquante", () => {
    // Recopiée dans un canal partagé, elle renseigne sur l'infrastructure —
    // et « non configuré » se diagnostique aussi bien.
    const raison = raisonCourte(new CoachIndisponible("Clé ANTHROPIC_API_KEY non configurée"));
    expect(raison).not.toContain("ANTHROPIC_API_KEY");
    expect(raison).not.toMatch(/API_KEY/);
  });

  it("range l'imprévu dans une catégorie plutôt que de le recopier", () => {
    expect(raisonCourte(new TypeError("fetch failed: ECONNREFUSED 10.0.0.4:443")))
      .not.toContain("10.0.0.4");
    expect(raisonCourte("une chaîne jetée telle quelle")).toBe(
      "échec inattendu de l'appel au modèle",
    );
  });
});
