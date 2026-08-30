import { describe, it, expect } from "vitest";
import {
  adapterSeance,
  PART_PERDUE_TOLEREE,
  type CandidatDisponible,
  type ExerciceEnPlace,
} from "./adaptation-lieu";

const enPlace = (
  n: number,
  patch: Partial<ExerciceEnPlace> = {},
): ExerciceEnPlace => ({
  planItemId: `p-${n}`,
  instanceId: `i-${n}`,
  exerciceId: `e-${n}`,
  ordre: n,
  nom: `Exercice ${n}`,
  pilier: "P1_poussee",
  profilTension: "mi_range",
  categorieRole: "pilier",
  musclesPrincipaux: ["pectoraux"],
  seriesCibles: 4,
  fourchetteRepsMin: 8,
  fourchetteRepsMax: 12,
  rpeCible: 8,
  reposSecondes: 120,
  ...patch,
});

const dispo = (id: string, patch: Partial<CandidatDisponible> = {}): CandidatDisponible => ({
  exerciceId: id,
  instanceId: `inst-${id}`,
  nom: `Dispo ${id}`,
  pilier: "P1_poussee",
  profilTension: "mi_range",
  categorieRole: "pilier",
  musclesPrincipaux: ["pectoraux"],
  incrementsPossibles: [2.5],
  ...patch,
});

describe("1. salle → maison", () => {
  it("conserve ce qui reste faisable et ne remplace que le reste", () => {
    const seance = [
      enPlace(1, { exerciceId: "pompes", instanceId: "inst-pompes" }),
      enPlace(2, { exerciceId: "presse", pilier: "P3_squat", musclesPrincipaux: ["quadriceps"] }),
    ];
    const r = adapterSeance({
      seance,
      disponibles: [
        dispo("pompes", { instanceId: "inst-pompes" }),
        dispo("fente", {
          pilier: "P3_squat",
          musclesPrincipaux: ["quadriceps"],
          nom: "Fente bulgare",
        }),
      ],
    });

    expect(r.conserves).toBe(1);
    expect(r.exercices[0]!.niveau).toBe("conserve");
    expect(r.remplacements).toHaveLength(1);
    expect(r.remplacements[0]!.apres).toBe("Fente bulgare");
    expect(r.retires).toEqual([]);
    expect(r.reconstructionConseillee).toBe(false);
  });

  it("transmet la prescription au remplaçant sans la recalculer", () => {
    // C'est le même travail, fait autrement : le volume et le RIR sont
    // l'intention de la séance, pas une propriété du lieu.
    const r = adapterSeance({
      seance: [enPlace(1, { seriesCibles: 5, fourchetteRepsMin: 6, fourchetteRepsMax: 8, rpeCible: 7, reposSecondes: 180 })],
      disponibles: [dispo("autre")],
    });
    const a = r.exercices[0]!;
    expect(a.seriesCibles).toBe(5);
    expect(a.fourchetteRepsMin).toBe(6);
    expect(a.fourchetteRepsMax).toBe(8);
    expect(a.rpeCible).toBe(7);
    expect(a.reposSecondes).toBe(180);
  });
});

describe("2. maison → salle", () => {
  it("retrouve le même exercice sur un autre appareil", () => {
    const r = adapterSeance({
      seance: [enPlace(1, { exerciceId: "developpe", instanceId: "maison-halteres" })],
      disponibles: [dispo("developpe", { instanceId: "salle-banc", nom: "Développé couché" })],
    });
    expect(r.remplacements[0]!.niveau).toBe("meme_exercice");
    expect(r.remplacements[0]!.raison).toMatch(/matériel différent/);
    expect(r.exercices[0]!.instanceId).toBe("salle-banc");
  });

  it("préserve l'ordre de la séance", () => {
    const r = adapterSeance({
      seance: [enPlace(3), enPlace(1), enPlace(2)],
      disponibles: [dispo("e-1", { instanceId: "i-1" }), dispo("e-2", { instanceId: "i-2" }), dispo("e-3", { instanceId: "i-3" })],
    });
    expect(r.exercices.map((x) => x.ordre)).toEqual([1, 2, 3]);
  });
});

describe("3. machine absente, alternative disponible", () => {
  it("préfère le même profil de tension au même pilier seul", () => {
    const prevu = enPlace(1, {
      pilier: "P2_tirage",
      profilTension: "stretch",
      musclesPrincipaux: ["dorsaux"],
    });
    const r = adapterSeance({
      seance: [prevu],
      disponibles: [
        dispo("tirage-contract", {
          pilier: "P2_tirage",
          profilTension: "contract",
          musclesPrincipaux: ["dorsaux"],
          nom: "Tirage contracté",
        }),
        dispo("tirage-stretch", {
          pilier: "P2_tirage",
          profilTension: "stretch",
          musclesPrincipaux: ["dorsaux"],
          nom: "Pull-over",
        }),
      ],
    });
    expect(r.remplacements[0]!.apres).toBe("Pull-over");
    expect(r.remplacements[0]!.niveau).toBe("profil_identique");
  });

  it("ne remplace pas un pilier par un accessoire quand un pilier existe", () => {
    const r = adapterSeance({
      seance: [enPlace(1, { categorieRole: "pilier" })],
      disponibles: [
        dispo("accessoire", { categorieRole: "accessoire", nom: "Écarté poulie" }),
        dispo("pilier", { categorieRole: "pilier", nom: "Développé machine" }),
      ],
    });
    expect(r.remplacements[0]!.apres).toBe("Développé machine");
  });

  it("ne fait pas converger deux lignes vers le même remplaçant", () => {
    // Remplacer un manque par un doublon ne serait pas une adaptation.
    const r = adapterSeance({
      seance: [enPlace(1), enPlace(2)],
      disponibles: [dispo("unique", { nom: "Seul disponible" })],
    });
    expect(r.remplacements).toHaveLength(1);
    expect(r.retires).toHaveLength(1);
  });
});

describe("4. matériel apporté qui débloque mieux", () => {
  it("choisit le meilleur remplaçant quand le sac élargit l'offre", () => {
    // Les candidats incluent déjà le matériel apporté : ce que ce test vérifie,
    // c'est que l'ajout change bien la décision, et pour le mieux.
    const prevu = enPlace(1, {
      pilier: "P2_tirage",
      profilTension: "stretch",
      musclesPrincipaux: ["dorsaux"],
    });
    const sansSac = [
      dispo("gainage", {
        pilier: "core",
        profilTension: "contract",
        musclesPrincipaux: ["core"],
        nom: "Gainage",
      }),
    ];
    const avecSac = [
      ...sansSac,
      dispo("tirage-elastique", {
        pilier: "P2_tirage",
        profilTension: "stretch",
        musclesPrincipaux: ["dorsaux"],
        instanceId: null,
        nom: "Tirage élastique",
      }),
    ];

    expect(adapterSeance({ seance: [prevu], disponibles: sansSac }).retires).toHaveLength(1);

    const r = adapterSeance({ seance: [prevu], disponibles: avecSac });
    expect(r.remplacements[0]!.apres).toBe("Tirage élastique");
    expect(r.remplacements[0]!.niveau).toBe("profil_identique");
    // Sans appareil décrit : il sera matérialisé à l'enregistrement.
    expect(r.exercices[0]!.instanceId).toBeNull();
  });

  it("préfère un appareil décrit à un équivalent seulement déduit", () => {
    const r = adapterSeance({
      seance: [enPlace(1)],
      disponibles: [
        dispo("deduit", { instanceId: null, nom: "Déduit" }),
        dispo("decrit", { instanceId: "inst-decrit", nom: "Décrit" }),
      ],
    });
    expect(r.remplacements[0]!.apres).toBe("Décrit");
  });
});

describe("5. aucun remplacement possible", () => {
  it("retire l'exercice plutôt que d'en inventer un", () => {
    const r = adapterSeance({
      seance: [enPlace(1, { pilier: "P1_poussee", musclesPrincipaux: ["pectoraux"] })],
      disponibles: [
        dispo("mollets", { pilier: "jambes_iso", musclesPrincipaux: ["mollets"], nom: "Mollets" }),
      ],
    });
    expect(r.exercices).toEqual([]);
    expect(r.retires[0]!.raison).toBe("Rien d'équivalent ici");
  });

  it("conseille de reconstruire quand la séance perd un pilier entier", () => {
    const r = adapterSeance({
      seance: [
        enPlace(1, { pilier: "P1_poussee", musclesPrincipaux: ["pectoraux"] }),
        enPlace(2, { pilier: "P3_squat", musclesPrincipaux: ["quadriceps"] }),
        enPlace(3, { pilier: "P3_squat", musclesPrincipaux: ["quadriceps"] }),
      ],
      disponibles: [dispo("pompes", { instanceId: "i-1", exerciceId: "e-1" })],
    });
    expect(r.reconstructionConseillee).toBe(true);
    expect(r.motifReconstruction).toMatch(/P3_squat/);
  });

  it("ne conseille pas de reconstruire pour une perte marginale", () => {
    // Rapiécer reste honnête tant que la séance garde sa forme.
    const seance = Array.from({ length: 6 }, (_, i) =>
      enPlace(i + 1, { exerciceId: `e-${i + 1}`, instanceId: `i-${i + 1}` }),
    );
    const disponibles = seance
      .slice(0, 5)
      .map((s) => dispo(s.exerciceId, { instanceId: s.instanceId }));
    const r = adapterSeance({ seance, disponibles });
    expect(r.retires).toHaveLength(1);
    expect(1 / 6).toBeLessThan(PART_PERDUE_TOLEREE);
    expect(r.reconstructionConseillee).toBe(false);
  });

  it("le dit quand il ne reste presque rien", () => {
    const seance = Array.from({ length: 3 }, (_, i) =>
      enPlace(i + 1, { exerciceId: `e-${i + 1}`, musclesPrincipaux: ["pectoraux"] }),
    );
    const r = adapterSeance({ seance, disponibles: [] });
    expect(r.exercices).toEqual([]);
    expect(r.reconstructionConseillee).toBe(true);
    expect(r.motifReconstruction).toMatch(/3 exercices sur 3/);
  });
});

describe("6. lisibilité de ce qui a changé", () => {
  it("nomme chaque remplacement, son avant, son après et sa raison", () => {
    const r = adapterSeance({
      seance: [enPlace(1, { nom: "Développé couché" })],
      disponibles: [dispo("pompes", { nom: "Pompes" })],
    });
    expect(r.remplacements[0]).toMatchObject({
      avant: "Développé couché",
      apres: "Pompes",
    });
    expect(r.remplacements[0]!.raison).toBeTruthy();
  });

  it("ne signale comme changé que ce qui a changé", () => {
    const r = adapterSeance({
      seance: [enPlace(1), enPlace(2)],
      disponibles: [
        dispo("e-1", { instanceId: "i-1" }),
        dispo("e-2", { instanceId: "i-2" }),
      ],
    });
    expect(r.remplacements).toEqual([]);
    expect(r.retires).toEqual([]);
    expect(r.conserves).toBe(2);
  });
});
