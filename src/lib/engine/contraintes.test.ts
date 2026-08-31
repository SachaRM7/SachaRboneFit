import { describe, it, expect } from "vitest";
import {
  BAISSE_SI_MIEUX, FENETRE_REPETITION_JOURS, INTENSITE_PROPOSITION_IMMEDIATE,
  REEVALUATION_JOURS, SEVERITE, aReevaluer, decalerDe, effetSurLEntrainement,
  estActive, musclesSousContrainte, reevaluer, suiteASignalement,
  type ContrainteLue,
} from "./contraintes";

/**
 * Une gêne doit pouvoir entrer et sortir.
 *
 * Ce qui se vérifie ici tient en deux idées. La première : la plupart des
 * douleurs signalées ne doivent RIEN changer au programme — elles sont notées,
 * point. La seconde : celles qui le changent doivent pouvoir cesser de le
 * faire, et cesser parce que l'athlète l'a dit, jamais parce qu'un délai s'est
 * écoulé.
 */

const AUJOURDHUI = "2026-08-31";

const contrainte = (p: Partial<ContrainteLue> = {}): ContrainteLue => ({
  id: "c1", muscle: "epaules", type: "zone_sensible", severite: 7,
  dateDebut: "2026-08-01", dateFin: null, aReevaluerLe: null, notes: null, ...p,
});

describe("les seuils sont enfin au même endroit", () => {
  it("garde les valeurs qui existaient, sans les retoucher", () => {
    // Elles vivaient en trois exemplaires : 7 dans le validateur de séance, 7
    // réécrit à la main dans le constructeur, 6 dans la calibration. Ce
    // chantier réunit, il ne change pas les décisions.
    expect(SEVERITE.ecartement).toBe(7);
    expect(SEVERITE.calibrationEvitee).toBe(6);
  });
});

describe("une gêne signalée ne devient pas un état", () => {
  it("reste un incident quand elle est isolée et modérée", () => {
    const verdict = suiteASignalement({
      signalement: { muscle: "epaules", intensite: 4, dateISO: AUJOURDHUI },
      anterieurs: [],
      contrainteActive: false,
    });
    expect(verdict.suite).toBe("incident_seul");
  });

  it("propose une contrainte quand elle est forte d'emblée", () => {
    const verdict = suiteASignalement({
      signalement: { muscle: "epaules", intensite: INTENSITE_PROPOSITION_IMMEDIATE, dateISO: AUJOURDHUI },
      anterieurs: [],
      contrainteActive: false,
    });
    expect(verdict.suite).toBe("proposer_contrainte");
    if (verdict.suite === "proposer_contrainte") {
      expect(verdict.severite).toBe(INTENSITE_PROPOSITION_IMMEDIATE);
    }
  });

  it("propose une contrainte quand elle revient", () => {
    const verdict = suiteASignalement({
      signalement: { muscle: "epaules", intensite: 5, dateISO: AUJOURDHUI },
      anterieurs: [{ muscle: "epaules", intensite: 6, dateISO: "2026-08-25" }],
      contrainteActive: false,
    });
    expect(verdict.suite).toBe("proposer_contrainte");
    // La sévérité retenue est la plus forte observée, pas une moyenne qui
    // lisserait l'épisode.
    if (verdict.suite === "proposer_contrainte") expect(verdict.severite).toBe(6);
  });

  it("ne compte pas une gêne trop ancienne comme une répétition", () => {
    const verdict = suiteASignalement({
      signalement: { muscle: "epaules", intensite: 5, dateISO: AUJOURDHUI },
      anterieurs: [
        { muscle: "epaules", intensite: 6, dateISO: decalerDe(AUJOURDHUI, -(FENETRE_REPETITION_JOURS + 1)) },
      ],
      contrainteActive: false,
    });
    expect(verdict.suite).toBe("incident_seul");
  });

  it("ne compte pas une gêne sur une autre zone", () => {
    const verdict = suiteASignalement({
      signalement: { muscle: "epaules", intensite: 5, dateISO: AUJOURDHUI },
      anterieurs: [{ muscle: "genoux", intensite: 9, dateISO: "2026-08-28" }],
      contrainteActive: false,
    });
    expect(verdict.suite).toBe("incident_seul");
  });

  it("ne propose rien si la zone est déjà couverte", () => {
    const verdict = suiteASignalement({
      signalement: { muscle: "epaules", intensite: 9, dateISO: AUJOURDHUI },
      anterieurs: [],
      contrainteActive: true,
    });
    expect(verdict.suite).toBe("deja_couvert");
  });
});

describe("être active : une seule définition", () => {
  it("l'est sans date de fin", () => {
    expect(estActive(contrainte({ dateFin: null }), AUJOURDHUI)).toBe(true);
  });

  it("ne l'est plus dès le jour de sa fin", () => {
    // Borne exclue : dire « ça va mieux » libère les exercices tout de suite.
    expect(estActive(contrainte({ dateFin: AUJOURDHUI }), AUJOURDHUI)).toBe(false);
    expect(estActive(contrainte({ dateFin: decalerDe(AUJOURDHUI, 1) }), AUJOURDHUI)).toBe(true);
  });

  it("l'est quand sa fin est encore à venir", () => {
    // C'est ce qui divergeait : le constructeur de séance l'acceptait, les
    // trois autres lectures exigeaient une date de fin nulle.
    expect(estActive(contrainte({ dateFin: decalerDe(AUJOURDHUI, 3) }), AUJOURDHUI)).toBe(true);
  });
});

describe("ce que le moteur écarte", () => {
  it("ne retient que les zones actives au-dessus du seuil", () => {
    const liste = [
      contrainte({ id: "a", muscle: "epaules", severite: SEVERITE.ecartement }),
      contrainte({ id: "b", muscle: "lombaires", severite: SEVERITE.ecartement - 1 }),
      contrainte({ id: "c", muscle: "genoux", severite: 10, dateFin: "2026-08-15" }),
    ];
    expect(musclesSousContrainte(liste, AUJOURDHUI)).toEqual(["epaules"]);
  });

  it("une contrainte résolue n'interdit plus rien", () => {
    const resolue = contrainte({ severite: 10, dateFin: AUJOURDHUI });
    expect(musclesSousContrainte([resolue], AUJOURDHUI)).toEqual([]);
  });

  it("accepte un autre seuil sans le coder en dur", () => {
    const legere = contrainte({ severite: SEVERITE.calibrationEvitee });
    expect(musclesSousContrainte([legere], AUJOURDHUI)).toEqual([]);
    expect(musclesSousContrainte([legere], AUJOURDHUI, SEVERITE.calibrationEvitee))
      .toEqual(["epaules"]);
  });
});

describe("la question qu'on repose", () => {
  it("ne relance pas une limitation déclarée durable", () => {
    // Échéance nulle : l'athlète a demandé à la garder telle quelle.
    expect(aReevaluer(contrainte({ aReevaluerLe: null }), AUJOURDHUI)).toBe(false);
  });

  it("relance à l'échéance, pas avant", () => {
    expect(aReevaluer(contrainte({ aReevaluerLe: decalerDe(AUJOURDHUI, 1) }), AUJOURDHUI)).toBe(false);
    expect(aReevaluer(contrainte({ aReevaluerLe: AUJOURDHUI }), AUJOURDHUI)).toBe(true);
  });

  it("ne relance pas une contrainte déjà terminée", () => {
    const finie = contrainte({ dateFin: AUJOURDHUI, aReevaluerLe: AUJOURDHUI });
    expect(aReevaluer(finie, AUJOURDHUI)).toBe(false);
  });
});

describe("les trois réponses", () => {
  it("« toujours » maintient et repousse la question", () => {
    const t = reevaluer(contrainte({ severite: 8 }), "toujours", AUJOURDHUI);
    expect(t.dateFin).toBeNull();
    expect(t.severite).toBe(8);
    expect(t.aReevaluerLe).toBe(decalerDe(AUJOURDHUI, REEVALUATION_JOURS));
  });

  it("« un peu mieux » fait baisser d'un cran sans conclure", () => {
    const t = reevaluer(contrainte({ severite: 8 }), "un_peu_mieux", AUJOURDHUI);
    expect(t.severite).toBe(8 - BAISSE_SI_MIEUX);
    // Toujours active : aller mieux n'est pas être guéri.
    expect(t.dateFin).toBeNull();
    expect(t.aReevaluerLe).toBe(decalerDe(AUJOURDHUI, REEVALUATION_JOURS));
  });

  it("« un peu mieux » finit par lever quand il ne reste rien à ménager", () => {
    const t = reevaluer(contrainte({ severite: 3 }), "un_peu_mieux", AUJOURDHUI);
    expect(t.dateFin).toBe(AUJOURDHUI);
    expect(t.aReevaluerLe).toBeNull();
  });

  it("« résolu » lève tout de suite, quelle que soit la sévérité", () => {
    const t = reevaluer(contrainte({ severite: 10 }), "resolu", AUJOURDHUI);
    expect(t.dateFin).toBe(AUJOURDHUI);
    expect(t.aReevaluerLe).toBeNull();
  });

  it("aucune réponse ne prétend savoir combien de temps ça durera", () => {
    for (const reponse of ["toujours", "un_peu_mieux", "resolu"] as const) {
      const t = reevaluer(contrainte({ severite: 8 }), reponse, AUJOURDHUI);
      expect(t.resume).not.toMatch(/guéri|guérison|semaines de repos|dans \d+ semaines?/i);
    }
  });
});

describe("ce qu'on annonce à l'athlète", () => {
  it("décrit ce que l'application fera, pas ce que le corps fera", () => {
    const effets = effetSurLEntrainement(SEVERITE.ecartement, "entree").join(" ");
    expect(effets).toMatch(/ne seront plus proposés|signalée/);
    expect(effets).not.toMatch(/guéri|repos|inflammation|tendinite/i);
  });

  it("ne promet pas d'exclusion quand la sévérité ne l'entraîne pas", () => {
    const effets = effetSurLEntrainement(SEVERITE.ecartement - 2, "entree").join(" ");
    expect(effets).toMatch(/sans exclusion|programmation reste inchangée/);
  });

  it("dit ce qui redevient possible à la sortie", () => {
    const effets = effetSurLEntrainement(SEVERITE.ecartement, "sortie").join(" ");
    expect(effets).toMatch(/redeviennent proposables/);
  });
});
