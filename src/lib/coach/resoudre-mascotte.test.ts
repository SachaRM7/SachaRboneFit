import { describe, it, expect } from "vitest";
import {
  PRIORITE_MASCOTTE,
  plusPrioritaire,
  resoudreMascotteLive,
  resoudreMascotteCoach,
  resoudreMascotteFinDeSeance,
  resoudreMascotteProgression,
  resoudreMascotteProgramme,
} from "./resoudre-mascotte";
import { ETATS_MASCOTTE } from "./mascotte-assets";

/**
 * Ce que le Coach montre, et ce qu'il ne montre jamais.
 *
 * Ces tests ne vérifient pas une préférence esthétique : ils verrouillent des
 * décisions produit qui, prises à l'envers, feraient mentir l'application —
 * féliciter une baseline, applaudir une séance écourtée, afficher « repos »
 * pendant qu'une douleur vient d'être signalée.
 */

describe("la priorité est une seule liste, partagée", () => {
  it("couvre tous les états sauf l'easter egg dormant", () => {
    // Un état absent de la priorité ne pourrait jamais gagner une résolution :
    // l'oublier ici le rendrait inatteignable sans que rien ne le dise.
    const attendus = ETATS_MASCOTTE.filter((e) => e !== "beast");
    expect([...PRIORITE_MASCOTTE].sort()).toEqual([...attendus].sort());
  });

  it("place attention en tête et ready en queue", () => {
    expect(PRIORITE_MASCOTTE[0]).toBe("attention");
    expect(PRIORITE_MASCOTTE.at(-1)).toBe("ready");
  });

  it("ignore ce qui n'est pas signalé", () => {
    expect(plusPrioritaire(null, undefined, "training")).toBe("training");
    expect(plusPrioritaire(null, undefined)).toBeNull();
  });

  it("et ne laisse JAMAIS gagner beast", () => {
    // L'easter egg est dormant : il ne doit pas pouvoir apparaître par un
    // chemin détourné, même si une surface le proposait par erreur.
    expect(plusPrioritaire("beast", "training")).toBe("training");
    expect(plusPrioritaire("beast")).toBeNull();
  });
});

describe("le Live — un fait, un visage", () => {
  it("séance normale : training", () => {
    expect(resoudreMascotteLive({})).toBe("training");
  });

  it("repos ouvert : repos", () => {
    expect(resoudreMascotteLive({ repos: true })).toBe("repos");
  });

  it("observation de l'observateur : intervention", () => {
    expect(resoudreMascotteLive({ observation: true })).toBe("intervention");
  });

  it("douleur : attention", () => {
    expect(resoudreMascotteLive({ douleur: true })).toBe("attention");
  });

  it("symptôme général : attention aussi — sans être la même chose", () => {
    /*
     * Douleur et symptôme restent deux faits distincts dans le moteur. Ils
     * partagent une image parce que le Coach dit la même chose des deux, pas
     * parce qu'ils seraient confondus.
     */
    expect(resoudreMascotteLive({ symptome: true })).toBe("attention");
  });

  it("check-in après une pause : attention", () => {
    expect(resoudreMascotteLive({ checkin: true })).toBe("attention");
  });

  it("calibration : calibration", () => {
    expect(resoudreMascotteLive({ calibration: true })).toBe("calibration");
  });

  it("exercice terminé : encouragement, pas progrès", () => {
    // Terminer un exercice est une étape, pas un record.
    expect(resoudreMascotteLive({ exerciceTermine: true })).toBe("encouragement");
  });

  it("avant le démarrage : ready", () => {
    expect(resoudreMascotteLive({ avantDemarrage: true })).toBe("ready");
  });
});

describe("les conflits, et qui l'emporte", () => {
  it("repos + intervention → intervention", () => {
    expect(resoudreMascotteLive({ repos: true, observation: true }))
      .toBe("intervention");
  });

  it("intervention + douleur → attention", () => {
    expect(resoudreMascotteLive({ observation: true, douleur: true }))
      .toBe("attention");
  });

  it("repos + douleur → attention", () => {
    expect(resoudreMascotteLive({ repos: true, douleur: true })).toBe("attention");
  });

  it("exercice terminé + douleur → attention", () => {
    // Un exercice bouclé ne fait pas taire une douleur signalée.
    expect(resoudreMascotteLive({ exerciceTermine: true, douleur: true }))
      .toBe("attention");
  });

  it("calibration + exercice terminé → calibration", () => {
    /*
     * L'EXCEPTION QUI COMPTE.
     *
     * Pendant une reprise, la série sert à construire un repère : la terminer
     * ne prouve rien qu'on puisse saluer. Féliciter ici apprendrait à
     * l'athlète que le Coach félicite tout — et son applaudissement ne
     * vaudrait plus rien le jour d'un vrai progrès.
     */
    expect(resoudreMascotteLive({ calibration: true, exerciceTermine: true }))
      .toBe("calibration");
  });

  it("et la résolution suit exactement l'ordre déclaré", () => {
    // Le résolveur teste dans un ordre écrit à la main ; s'il divergeait de
    // PRIORITE_MASCOTTE, deux surfaces se contrediraient.
    const rang = (e: string) => PRIORITE_MASCOTTE.indexOf(e as never);
    expect(rang("attention")).toBeLessThan(rang("intervention"));
    expect(rang("intervention")).toBeLessThan(rang("repos"));
    expect(rang("repos")).toBeLessThan(rang("calibration"));
    expect(rang("calibration")).toBeLessThan(rang("progres"));
    expect(rang("progres")).toBeLessThan(rang("encouragement"));
    expect(rang("encouragement")).toBeLessThan(rang("training"));
  });
});

describe("la fin de séance ne célèbre pas à vide", () => {
  it("rien de notable : debrief", () => {
    expect(resoudreMascotteFinDeSeance({})).toBe("debrief");
  });

  it("progrès confirmé par le moteur : progres", () => {
    expect(resoudreMascotteFinDeSeance({ progresConfirme: true })).toBe("progres");
  });

  it("séance écourtée ou adaptée : debrief, même avec un progrès", () => {
    // Un bilan neutre est honnête ; une grosse célébration sur une séance
    // qu'on a dû tronquer ne l'est pas.
    expect(resoudreMascotteFinDeSeance({ progresConfirme: true, adaptee: true }))
      .toBe("debrief");
  });

  it("calibration : calibration, jamais progres", () => {
    expect(
      resoudreMascotteFinDeSeance({ progresConfirme: true, calibration: true }),
    ).toBe("calibration");
  });
});

describe("la progression n'invente pas de record", () => {
  it("sans repère comparable : calibration", () => {
    /*
     * Une première mesure produit mécaniquement un « meilleur résultat » —
     * il n'y en avait aucun avant. C'est un faux record, et c'est exactement
     * ce que la calibration existe pour dire autrement.
     */
    expect(resoudreMascotteProgression({ sansRepere: true, progresConfirme: true }))
      .toBe("calibration");
  });

  it("progrès réel : progres", () => {
    expect(resoudreMascotteProgression({ progresConfirme: true })).toBe("progres");
  });

  it("stagnation ou lecture ordinaire : analyse", () => {
    expect(resoudreMascotteProgression({})).toBe("analyse");
  });
});

describe("le Coach choisit son visage sur le CONTEXTE, pas sur sa réponse", () => {
  it("observation de séance : intervention", () => {
    expect(resoudreMascotteCoach("observation_seance")).toBe("intervention");
  });

  it("technique et explication d'exercice : technique", () => {
    expect(resoudreMascotteCoach("technique")).toBe("technique");
    expect(resoudreMascotteCoach("expliquer_exercice")).toBe("technique");
  });

  it("programme, matériel, salle, adaptation : planification", () => {
    for (const sujet of [
      "modifier_programme",
      "materiel",
      "salle",
      "adaptation_programme",
    ] as const) {
      expect(resoudreMascotteCoach(sujet)).toBe("planification");
    }
  });

  it("stagnation et analyse de séance : analyse", () => {
    expect(resoudreMascotteCoach("stagnation")).toBe("analyse");
    expect(resoudreMascotteCoach("analyse_seance")).toBe("analyse");
  });

  it("live générique : training", () => {
    expect(resoudreMascotteCoach("live")).toBe("training");
  });

  it("sans contexte : analyse", () => {
    expect(resoudreMascotteCoach(null)).toBe("analyse");
    expect(resoudreMascotteCoach(undefined)).toBe("analyse");
  });
});

describe("les écrans de programmation", () => {
  it("montrent le plan", () => {
    expect(resoudreMascotteProgramme()).toBe("planification");
  });
});

describe("aucun résolveur ne rend beast", () => {
  it("quel que soit le contexte du Live", () => {
    /*
     * L'easter egg est enregistré et dormant. Aucun tirage aléatoire, aucune
     * date, aucun seuil ne doit pouvoir l'invoquer : un easter egg qui se
     * déclenche tout seul est un défaut qu'on n'arrive pas à reproduire.
     */
    const combinaisons = [
      {}, { douleur: true }, { symptome: true }, { checkin: true },
      { observation: true }, { repos: true }, { calibration: true },
      { exerciceTermine: true }, { avantDemarrage: true },
      { repos: true, observation: true, calibration: true, exerciceTermine: true },
    ];
    for (const c of combinaisons) {
      expect(resoudreMascotteLive(c)).not.toBe("beast");
    }
  });

  it("ni sur les autres surfaces", () => {
    expect(resoudreMascotteFinDeSeance({ progresConfirme: true })).not.toBe("beast");
    expect(resoudreMascotteProgression({ progresConfirme: true })).not.toBe("beast");
    expect(resoudreMascotteProgramme()).not.toBe("beast");
    expect(resoudreMascotteCoach("live")).not.toBe("beast");
  });
});
