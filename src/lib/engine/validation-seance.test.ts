import { describe, it, expect } from "vitest";
import {
  validerSeance,
  dureeEstimeeMinutes,
  chargeEstimee,
  type ExercicePropose,
  type ContexteValidation,
} from "./validation-seance";

const exercice = (p: Partial<ExercicePropose> = {}): ExercicePropose => ({
  exerciseInstanceId: "inst-1",
  nom: "Développé couché",
  series: 4,
  repsMin: 6,
  repsMax: 8,
  reposSecondes: 120,
  musclesPrincipaux: ["pectoraux"],
  pilier: "P1_poussee",
  profilTension: "mi_range",
  categorieRole: "pilier",
  type: "polyarticulaire",
  rirCible: 2,
  ...p,
});

const contexte = (p: Partial<ContexteValidation> = {}): ContexteValidation => ({
  machinesDisponibles: [{ exerciseInstanceId: "inst-1", nom: "Développé couché" }],
  etatMuscles: {},
  contraintes: [],
  dureeDisponibleMinutes: 90,
  phase: "accumulation",
  tendancePerformance: "stable",
  ...p,
});

const codes = (r: ReturnType<typeof validerSeance>) => r.anomalies.map((a) => a.code);
const bloquants = (r: ReturnType<typeof validerSeance>) =>
  r.anomalies.filter((a) => a.gravite === "bloquant").map((a) => a.code);

describe("validerSeance — contrôles de base", () => {
  it("accepte une séance cohérente", () => {
    const r = validerSeance([exercice()], contexte());
    expect(r.valide).toBe(true);
    expect(r.anomalies).toHaveLength(0);
  });

  it("refuse une machine absente, un doublon, une séance vide", () => {
    expect(codes(validerSeance([exercice({ exerciseInstanceId: "x" })], contexte()))).toContain("machine_absente");
    expect(codes(validerSeance([exercice(), exercice()], contexte()))).toContain("doublon");
    expect(codes(validerSeance([], contexte()))).toEqual(["seance_vide"]);
  });

  it("refuse un muscle sous contrainte sévère mais tolère une gêne légère", () => {
    const severe = validerSeance([exercice()], contexte({ contraintes: [{ muscle: "pectoraux", severite: 8 }] }));
    expect(codes(severe)).toContain("contrainte_ignoree");
    const legere = validerSeance([exercice()], contexte({ contraintes: [{ muscle: "pectoraux", severite: 4 }] }));
    expect(legere.valide).toBe(true);
  });
});

describe("récupération — un score, pas une horloge", () => {
  it("accepte 48 h après une exposition légère", () => {
    // Le point de la critique : deux jours suffisent après six séries loin de
    // l'échec. L'ancienne règle fixe refusait ce cas.
    const r = validerSeance([exercice()], contexte({
      etatMuscles: {
        pectoraux: { joursDepuis: 2, seriesDerniereExposition: 6, rirMoyen: 3, courbature: 0 },
      },
    }));
    expect(r.valide).toBe(true);
    expect(r.anomalies).toHaveLength(0);
    expect(r.scoresRecuperation.pectoraux).toBeGreaterThanOrEqual(65);
  });

  it("refuse 48 h après vingt séries menées à l'échec", () => {
    const r = validerSeance([exercice()], contexte({
      etatMuscles: {
        pectoraux: { joursDepuis: 2, seriesDerniereExposition: 20, rirMoyen: 0, courbature: 7 },
      },
    }));
    expect(codes(r)).toContain("recuperation_insuffisante");
    expect(r.scoresRecuperation.pectoraux).toBeLessThan(40);
  });

  it("module le seuil selon ce que la phase demande", () => {
    // Deux jours, quatorze séries, RIR 2, courbatures légères : 53/100. L'état
    // est identique, seule l'exigence change — une surcharge assume de
    // travailler entamé, une décharge n'a de sens que si l'on part frais.
    const etat = {
      pectoraux: { joursDepuis: 2, seriesDerniereExposition: 14, rirMoyen: 2, courbature: 1 },
    };
    const leger = exercice({ rirCible: 4, series: 2 });

    const surcharge = validerSeance([leger], contexte({ phase: "surcharge", etatMuscles: etat }));
    const accumulation = validerSeance([leger], contexte({ phase: "accumulation", etatMuscles: etat }));
    const decharge = validerSeance([leger], contexte({
      phase: "decharge", etatMuscles: etat, cibleHebdoParMuscle: { pectoraux: 20 },
    }));

    expect(surcharge.scoresRecuperation.pectoraux).toBe(53);
    expect(codes(surcharge)).not.toContain("recuperation_insuffisante");
    expect(codes(accumulation)).toContain("recuperation_insuffisante");
    expect(codes(decharge)).toContain("recuperation_insuffisante");
  });
});

describe("cohérence avec la phase", () => {
  it("refuse une décharge qui garde la proximité de l'échec", () => {
    const r = validerSeance([exercice({ series: 3, rirCible: 1 })], contexte({
      phase: "decharge",
      cibleHebdoParMuscle: { pectoraux: 20 },
    }));
    expect(bloquants(r)).toContain("decharge_non_respectee");
  });

  it("refuse une décharge qui garde le volume habituel", () => {
    const r = validerSeance([exercice({ series: 18, rirCible: 4, reposSecondes: 30 })], contexte({
      phase: "decharge",
      cibleHebdoParMuscle: { pectoraux: 20 },
      dureeDisponibleMinutes: 240,
    }));
    expect(bloquants(r)).toContain("decharge_non_respectee");
  });

  it("accepte une décharge réellement allégée", () => {
    const r = validerSeance([exercice({ series: 2, rirCible: 4 })], contexte({
      phase: "decharge",
      cibleHebdoParMuscle: { pectoraux: 20 },
    }));
    expect(bloquants(r)).toHaveLength(0);
  });
});

describe("redondance, ordre et charge", () => {
  it("signale trois variantes du même schéma", () => {
    // Trois identifiants distincts, un seul stimulus.
    const r = validerSeance(
      [
        exercice(),
        exercice({ exerciseInstanceId: "inst-2", nom: "Développé incliné" }),
        exercice({ exerciseInstanceId: "inst-3", nom: "Développé machine" }),
      ],
      contexte({
        machinesDisponibles: [
          { exerciseInstanceId: "inst-1", nom: "a" },
          { exerciseInstanceId: "inst-2", nom: "b" },
          { exerciseInstanceId: "inst-3", nom: "c" },
        ],
      }),
    );
    expect(codes(r).filter((c) => c === "redondance_biomecanique")).toHaveLength(2);
  });

  it("ne signale rien si le profil de tension diffère", () => {
    const r = validerSeance(
      [exercice(), exercice({ exerciseInstanceId: "inst-2", nom: "Écarté", profilTension: "stretch" })],
      contexte({
        machinesDisponibles: [
          { exerciseInstanceId: "inst-1", nom: "a" },
          { exerciseInstanceId: "inst-2", nom: "b" },
        ],
      }),
    );
    expect(codes(r)).not.toContain("redondance_biomecanique");
  });

  it("signale un accessoire épuisant placé avant le mouvement prioritaire", () => {
    const r = validerSeance(
      [
        exercice({ exerciseInstanceId: "inst-2", nom: "Écarté poulie", categorieRole: "accessoire", profilTension: "stretch" }),
        exercice(),
      ],
      contexte({
        machinesDisponibles: [
          { exerciseInstanceId: "inst-1", nom: "a" },
          { exerciseInstanceId: "inst-2", nom: "b" },
        ],
      }),
    );
    expect(codes(r)).toContain("ordre_defavorable");
  });

  it("pondère la charge par la proximité de l'échec", () => {
    // Même durée, effort différent : c'est le point de la critique.
    const facile = chargeEstimee([exercice({ series: 10, rirCible: 4 })]);
    const dur = chargeEstimee([exercice({ series: 10, rirCible: 0 })]);
    expect(dur).toBeGreaterThan(facile);
    expect(facile).toBe(10);
  });

  it("signale un volume de séance ingérable", () => {
    const r = validerSeance([exercice({ series: 35, reposSecondes: 10 })], contexte({ dureeDisponibleMinutes: 400 }));
    expect(codes(r)).toContain("charge_excessive");
  });
});

describe("volume hebdomadaire", () => {
  it("signale un dépassement de la cible", () => {
    const r = validerSeance([exercice({ series: 8 })], contexte({
      seriesSemaineParMuscle: { pectoraux: 14 },
      cibleHebdoParMuscle: { pectoraux: 16 },
    }));
    expect(codes(r)).toContain("volume_hebdo_depasse");
  });

  it("ne signale rien quand la cible est respectée", () => {
    const r = validerSeance([exercice({ series: 4 })], contexte({
      seriesSemaineParMuscle: { pectoraux: 6 },
      cibleHebdoParMuscle: { pectoraux: 16 },
    }));
    expect(codes(r)).not.toContain("volume_hebdo_depasse");
  });
});

describe("durée", () => {
  it("ne compte pas le repos après la dernière série", () => {
    expect(dureeEstimeeMinutes([exercice({ series: 1 })])).toBe(3);
    expect(dureeEstimeeMinutes([exercice({ series: 4 })])).toBe(11);
  });

  it("refuse une séance plus longue que le temps disponible", () => {
    expect(bloquants(validerSeance([exercice()], contexte({ dureeDisponibleMinutes: 5 })))).toContain("duree_depassee");
  });
});


/**
 * La composition d'une séance, une fois écartée la question de sa faisabilité.
 *
 * Trois attributs déjà présents — pilier, profil de tension, nature du
 * mouvement — lus ensemble plutôt qu'à moitié. Rien ici n'exige qu'un muscle
 * voie les trois profils : on signale une concentration manifeste ou un
 * doublon, jamais une composition « non conforme ».
 */

/** Une machine du parc, telle que la salle la propose. */
const machine = (
  id: string,
  muscle: string,
  profilTension: string,
  type = "polyarticulaire",
) => ({ exerciseInstanceId: id, nom: id, profilTension, type, musclesPrincipaux: [muscle] });

describe("redondance : ce que le type sépare", () => {
  it("ne confond plus un développé et un écarté", () => {
    // Même pilier, même profil, même muscle : l'empreinte précédente les
    // déclarait jumeaux. L'un est global, l'autre local.
    const r = validerSeance([
      exercice({ exerciseInstanceId: "a", nom: "Développé couché", profilTension: "stretch", type: "polyarticulaire" }),
      exercice({ exerciseInstanceId: "b", nom: "Écarté poulie", profilTension: "stretch", type: "isolation", categorieRole: "accessoire" }),
    ], contexte({
      machinesDisponibles: [machine("a", "pectoraux", "stretch"), machine("b", "pectoraux", "stretch", "isolation")],
    }));
    expect(codes(r)).not.toContain("redondance_biomecanique");
  });

  it("repère deux variantes réellement jumelles", () => {
    const r = validerSeance([
      exercice({ exerciseInstanceId: "a", nom: "Écarté poulie", profilTension: "stretch", type: "isolation" }),
      exercice({ exerciseInstanceId: "b", nom: "Écarté haltères", profilTension: "stretch", type: "isolation" }),
    ], contexte({
      machinesDisponibles: [machine("a", "pectoraux", "stretch", "isolation"), machine("b", "pectoraux", "stretch", "isolation")],
    }));
    expect(codes(r)).toContain("redondance_biomecanique");
  });

  it("voit deux jumeaux dont les muscles ne sont pas listés à l'identique", () => {
    // Faux négatif de l'empreinte à égalité stricte : [pectoraux] et
    // [pectoraux, triceps] ne se rencontraient jamais.
    const r = validerSeance([
      exercice({ exerciseInstanceId: "a", profilTension: "stretch", musclesPrincipaux: ["pectoraux"] }),
      exercice({ exerciseInstanceId: "b", profilTension: "stretch", musclesPrincipaux: ["pectoraux", "triceps"] }),
    ], contexte({
      machinesDisponibles: [machine("a", "pectoraux", "stretch"), machine("b", "pectoraux", "stretch")],
    }));
    expect(codes(r)).toContain("redondance_biomecanique");
  });

  /**
   * Jusqu'où l'inclusion des muscles est-elle légitime ?
   *
   * Vérifié sur le catalogue entier : l'heuristique regroupe vingt-et-un
   * ensembles. La quasi-totalité sont de vraies familles — les variantes de
   * squat, de curl, de soulevé de terre roumain. Deux ne le sont pas, et pour
   * la même raison : le vocabulaire musculaire est plus grossier que le
   * mouvement.
   *
   *   `[epaules]` couvre l'élévation frontale ET l'élévation latérale, qui
   *   sollicitent des faisceaux différents — alors que le deltoïde postérieur,
   *   lui, a son propre terme.
   *
   *   `[core]` couvre la rotation (woodchop) ET l'anti-rotation (pallof press),
   *   qui sont des demandes opposées.
   *
   * L'avertissement est donc faux dans ces cas-là. Il reste un avertissement —
   * non bloquant, et l'athlète tranche. Le corriger demanderait soit un
   * vocabulaire musculaire plus fin, soit un attribut de plus sur l'exercice :
   * deux façons de complexifier le moteur pour deux familles. Le défaut est
   * documenté ici plutôt que masqué, et ce test le rendra visible le jour où
   * on décidera de le traiter.
   */
  it("regroupe à tort deux élévations d'épaule que le vocabulaire ne sépare pas", () => {
    const r = validerSeance([
      exercice({ exerciseInstanceId: "a", nom: "Élévation frontale", profilTension: "contract", type: "isolation", musclesPrincipaux: ["epaules"] }),
      exercice({ exerciseInstanceId: "b", nom: "Élévation latérale", profilTension: "contract", type: "isolation", musclesPrincipaux: ["epaules"] }),
    ], contexte({
      machinesDisponibles: [machine("a", "epaules", "contract", "isolation"), machine("b", "epaules", "contract", "isolation")],
    }));
    // Limite connue : deux faisceaux différents, une seule étiquette.
    expect(codes(r)).toContain("redondance_biomecanique");
    // Elle ne bloque rien, et c'est ce qui rend la limite acceptable.
    expect(r.valide).toBe(true);
  });

  it("laisse passer deux mouvements que le vocabulaire sépare correctement", () => {
    // Le deltoïde postérieur a son propre terme : un reverse pec deck et une
    // élévation latérale ne se confondent pas, alors qu'ils partagent pilier,
    // profil et nature. C'est la condition sur les muscles qui discrimine, et
    // elle fonctionne dès que le vocabulaire est assez fin.
    const r = validerSeance([
      exercice({ exerciseInstanceId: "a", nom: "Élévation latérale", profilTension: "contract", type: "isolation", musclesPrincipaux: ["epaules"] }),
      exercice({ exerciseInstanceId: "b", nom: "Reverse pec deck", profilTension: "contract", type: "isolation", musclesPrincipaux: ["deltoide_posterieur"] }),
    ], contexte({
      machinesDisponibles: [machine("a", "epaules", "contract", "isolation"), machine("b", "deltoide_posterieur", "contract", "isolation")],
    }));
    expect(codes(r)).not.toContain("redondance_biomecanique");
  });

  it("ne rapproche pas deux exercices sans muscle commun", () => {
    const r = validerSeance([
      exercice({ exerciseInstanceId: "a", profilTension: "stretch", musclesPrincipaux: ["pectoraux"] }),
      exercice({ exerciseInstanceId: "b", profilTension: "stretch", musclesPrincipaux: ["quadriceps"] }),
    ], contexte({
      machinesDisponibles: [machine("a", "pectoraux", "stretch"), machine("b", "quadriceps", "stretch")],
    }));
    expect(codes(r)).not.toContain("redondance_biomecanique");
  });
});

describe("monotonie de profil", () => {
  const troisMemeProfil = [
    exercice({ exerciseInstanceId: "a", nom: "A", profilTension: "stretch", type: "polyarticulaire" }),
    exercice({ exerciseInstanceId: "b", nom: "B", profilTension: "stretch", type: "isolation", categorieRole: "accessoire" }),
    exercice({ exerciseInstanceId: "c", nom: "C", profilTension: "stretch", type: "isolation", musclesPrincipaux: ["pectoraux", "triceps"], categorieRole: "accessoire" }),
  ];

  it("signale trois exercices d'un muscle tous sur le même profil", () => {
    const r = validerSeance(troisMemeProfil, contexte({
      machinesDisponibles: [
        machine("a", "pectoraux", "stretch"),
        machine("b", "pectoraux", "stretch", "isolation"),
        machine("c", "pectoraux", "stretch", "isolation"),
        // La salle propose autre chose : c'est ce qui rend l'avertissement juste.
        machine("d", "pectoraux", "contract", "isolation"),
      ],
    }));
    expect(codes(r)).toContain("monotonie_profil");
    expect(r.valide).toBe(true);
  });

  it("se tait quand la salle ne permet pas mieux", () => {
    // Reprocher une monotonie à un parc qui n'offre qu'un profil serait faux.
    const r = validerSeance(troisMemeProfil, contexte({
      machinesDisponibles: [
        machine("a", "pectoraux", "stretch"),
        machine("b", "pectoraux", "stretch", "isolation"),
        machine("c", "pectoraux", "stretch", "isolation"),
      ],
    }));
    expect(codes(r)).not.toContain("monotonie_profil");
  });

  it("se tait sur des profils complémentaires", () => {
    const r = validerSeance([
      exercice({ exerciseInstanceId: "a", nom: "A", profilTension: "stretch" }),
      exercice({ exerciseInstanceId: "b", nom: "B", profilTension: "mi_range", type: "isolation", categorieRole: "accessoire" }),
      exercice({ exerciseInstanceId: "c", nom: "C", profilTension: "contract", type: "isolation", categorieRole: "accessoire" }),
    ], contexte({
      machinesDisponibles: [
        machine("a", "pectoraux", "stretch"),
        machine("b", "pectoraux", "mi_range", "isolation"),
        machine("c", "pectoraux", "contract", "isolation"),
      ],
    }));
    expect(codes(r)).not.toContain("monotonie_profil");
    expect(codes(r)).not.toContain("redondance_biomecanique");
    expect(r.qualiteComposition).toBe("correcte");
  });

  it("ne se déclenche pas à deux exercices", () => {
    // Deux exercices d'un même profil sur un muscle est banal, souvent voulu.
    // Avertir ici produirait du bruit sur presque chaque séance.
    const r = validerSeance(troisMemeProfil.slice(0, 2), contexte({
      machinesDisponibles: [
        machine("a", "pectoraux", "stretch"),
        machine("b", "pectoraux", "stretch", "isolation"),
        machine("d", "pectoraux", "contract", "isolation"),
      ],
    }));
    expect(codes(r)).not.toContain("monotonie_profil");
  });
});

describe("le type ne décide pas du rôle", () => {
  it("accepte une isolation en pilier sans rien lui reprocher", () => {
    // Un programme peut décider qu'une isolation ouvre la séance. Le type
    // décrit le mouvement, le rôle décrit la décision.
    const r = validerSeance([
      exercice({ exerciseInstanceId: "a", nom: "Leg extension", type: "isolation", categorieRole: "pilier", musclesPrincipaux: ["quadriceps"] }),
    ], contexte({ machinesDisponibles: [machine("a", "quadriceps", "mi_range", "isolation")] }));
    expect(r.valide).toBe(true);
    expect(r.anomalies).toHaveLength(0);
  });

  it("accepte un polyarticulaire en accessoire", () => {
    const r = validerSeance([
      exercice({ exerciseInstanceId: "a", nom: "Squat", type: "polyarticulaire", categorieRole: "pilier", musclesPrincipaux: ["quadriceps"] }),
      exercice({ exerciseInstanceId: "b", nom: "Fentes", type: "polyarticulaire", categorieRole: "accessoire", profilTension: "contract", musclesPrincipaux: ["quadriceps"] }),
    ], contexte({
      machinesDisponibles: [machine("a", "quadriceps", "mi_range"), machine("b", "quadriceps", "contract")],
    }));
    expect(r.valide).toBe(true);
    expect(codes(r)).not.toContain("ordre_defavorable");
  });
});

describe("niveau de qualité de composition", () => {
  it("est un niveau, pas un score inventé", () => {
    const r = validerSeance([exercice()], contexte());
    expect(["correcte", "perfectible", "pauvre"]).toContain(r.qualiteComposition);
  });

  it("descend à perfectible sur un seul signal", () => {
    const r = validerSeance([
      exercice({ exerciseInstanceId: "a", profilTension: "stretch", type: "isolation" }),
      exercice({ exerciseInstanceId: "b", profilTension: "stretch", type: "isolation" }),
    ], contexte({
      machinesDisponibles: [machine("a", "pectoraux", "stretch", "isolation"), machine("b", "pectoraux", "stretch", "isolation")],
    }));
    expect(r.qualiteComposition).toBe("perfectible");
  });
});
