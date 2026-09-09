import { describe, it, expect } from "vitest";
import { mascotteDeLAccueil } from "./accueil-mascotte";
import type { NomEtat } from "@/lib/engine/etat-du-jour";

/**
 * L'accueil dit la journée — et le Coach ne la contredit jamais.
 *
 * Ces tests portent sur la TRADUCTION, pas sur la priorité (verrouillée dans
 * `resoudre-mascotte.test.ts`). Ce qu'ils empêchent : qu'un état du jour se
 * mette à afficher une image qui dit autre chose que la carte à côté d'elle.
 */

const TOUS: NomEtat[] = [
  "sans_salle", "salle_vide", "calibration",
  "prete", "deja_entraine", "semaine_complete",
];

describe("chaque état du jour a son visage, et un seul", () => {
  it("séance prête : ready — « on y va »", () => {
    expect(mascotteDeLAccueil({ etat: "prete", feuJour: "vert" })).toBe("ready");
  });

  it("premières charges à mesurer : calibration", () => {
    // La carte écrit déjà « On mesure tes premières charges ». `ready` serait
    // vrai mais moins précis ; `progres` serait un faux record.
    expect(mascotteDeLAccueil({ etat: "calibration", feuJour: "vert" }))
      .toBe("calibration");
  });

  it("séance déjà faite, ou semaine complète : debrief", () => {
    expect(mascotteDeLAccueil({ etat: "deja_entraine", feuJour: "vert" }))
      .toBe("debrief");
    expect(mascotteDeLAccueil({ etat: "semaine_complete", feuJour: "vert" }))
      .toBe("debrief");
  });

  it("un lieu à choisir ou à décrire : planification", () => {
    // Ce ne sont pas des états d'entraînement : rien n'est calculable tant que
    // le lieu n'est pas décidé. Le Coach montre le plan, il n'encourage pas.
    expect(mascotteDeLAccueil({ etat: "sans_salle", feuJour: null }))
      .toBe("planification");
    expect(mascotteDeLAccueil({ etat: "salle_vide", feuJour: null }))
      .toBe("planification");
  });
});

describe("le feu du jour peut tout couvrir — et lui seul", () => {
  it("rouge : attention, quel que soit l'état du jour", () => {
    /*
     * Le rouge dit « Récupérer », et l'écran l'écrit à côté. Afficher « on y
     * va » par-dessus reviendrait à contredire en image ce que la page dit en
     * toutes lettres — le pire défaut possible pour une mascotte, puisqu'il
     * la rend moins fiable que le texte qu'elle accompagne.
     */
    for (const etat of TOUS) {
      expect(mascotteDeLAccueil({ etat, feuJour: "rouge" }), etat).toBe("attention");
    }
  });

  it("orange : PAS attention — c'est une adaptation, pas une alerte", () => {
    // « À adapter » veut dire que la séance a lieu. En faire une mise en garde
    // banaliserait le rouge, qui est le seul signal d'arrêt.
    expect(mascotteDeLAccueil({ etat: "prete", feuJour: "orange" })).toBe("ready");
  });

  it("absent : l'état du jour décide seul", () => {
    expect(mascotteDeLAccueil({ etat: "prete", feuJour: null })).toBe("ready");
  });
});

describe("aucun état du jour ne reste sans réponse", () => {
  it("les six produisent une mascotte, et jamais beast", () => {
    /*
     * `FAIT_DE_L_ETAT` est un `Record<NomEtat, …>` : un septième état casserait
     * la compilation. Ce test couvre l'autre moitié — que la traduction produise
     * bien une image, et non `null` par un chemin oublié.
     */
    for (const etat of TOUS) {
      for (const feu of ["vert", "orange", "rouge", null] as const) {
        const m = mascotteDeLAccueil({ etat, feuJour: feu });
        expect(m, `${etat}/${feu}`).not.toBeNull();
        expect(m, `${etat}/${feu}`).not.toBe("beast");
      }
    }
  });
});
