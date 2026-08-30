import { describe, it, expect } from "vitest";
import { bilanProgression, SEUILS, type EntreeBilan, type SerieBilan } from "./bilan-progression";

/**
 * Ces tests portent moins sur les calculs que sur les silences : ce que le
 * bilan refuse d'affirmer tant qu'il ne peut pas le savoir.
 */

// Lundi 3 août 2026. Les semaines révolues sont donc celles du 6, 13, 20, 27
// juillet, et la semaine en cours commence le 3 août.
const AUJOURDHUI = "2026-08-03";

const serie = (date: string, nom: string, charge: number, reps: number, extra: Partial<SerieBilan> = {}): SerieBilan => ({
  date,
  exerciseInstanceId: `inst-${nom}`,
  exerciceNom: nom,
  charge,
  reps,
  rir: null,
  musclesPrincipaux: ["pectoraux"],
  musclesSecondaires: [],
  ...extra,
});

const entree = (p: Partial<EntreeBilan> = {}): EntreeBilan => ({
  aujourdhui: AUJOURDHUI,
  seances: [],
  series: [],
  stagnations: [],
  frequenceMinParSemaine: 2,
  frequenceCibleParSemaine: 3,
  frequenceMaxParSemaine: 4,
  ...p,
});

describe("état du bilan", () => {
  it("ne prétend rien sans la moindre séance", () => {
    const b = bilanProgression(entree());
    expect(b.etat).toBe("sans_donnees");
    expect(b.periode).toBeNull();
    expect(b.adherence).toBeNull();
    expect(b.volume).toBeNull();
    expect(b.enAttente).toEqual([]);
  });

  it("après une seule séance, annonce des références et non une progression", () => {
    const b = bilanProgression(
      entree({
        seances: [{ date: "2026-07-29", dureeMinutes: 62 }],
        series: [serie("2026-07-29", "Développé", 60, 10)],
      }),
    );
    expect(b.etat).toBe("premieres_references");
    expect(b.recordsRecents).toEqual([]);
    expect(b.enProgression).toEqual([]);
    expect(b.enAttente[0]).toMatch(/références/i);
  });
});

describe("adhérence", () => {
  it("reste nulle tant que la fréquence n'est pas déclarée", () => {
    const b = bilanProgression(
      entree({
        frequenceMinParSemaine: null,
        frequenceCibleParSemaine: null,
        frequenceMaxParSemaine: null,
        seances: [{ date: "2026-07-27", dureeMinutes: 60 }, { date: "2026-07-29", dureeMinutes: 60 }],
      }),
    );
    expect(b.adherence).toBeNull();
    expect(b.enAttente.join(" ")).toMatch(/fréquence/i);
  });

  it("ne compte pas les semaines antérieures à la première séance", () => {
    // Une seule séance, dans la dernière semaine révolue : trois semaines de
    // zéro « avant l'inscription » feraient un score d'adhérence catastrophique
    // pour quelqu'un qui vient de commencer.
    const b = bilanProgression(
      entree({ seances: [{ date: "2026-07-29", dureeMinutes: 60 }] }),
    );
    expect(b.adherence!.semainesObservees).toBe(1);
    expect(b.adherence!.seancesParSemaine).toEqual([1]);
  });

  it("compte pour zéro une semaine sans séance située dans l'historique", () => {
    // Semaine du 6 juillet : 2 séances. Semaines des 13 et 20 : rien.
    // Semaine du 27 : 2 séances. La coupure doit apparaître.
    const b = bilanProgression(
      entree({
        seances: [
          { date: "2026-07-06", dureeMinutes: 60 },
          { date: "2026-07-08", dureeMinutes: 60 },
          { date: "2026-07-27", dureeMinutes: 60 },
          { date: "2026-07-29", dureeMinutes: 60 },
        ],
      }),
    );
    expect(b.adherence!.seancesParSemaine).toEqual([2, 0, 0, 2]);
    expect(b.adherence!.semainesTenues).toBe(2);
    expect(b.adherence!.statut).toBe("sous_le_minimum");
  });

  it("situe la moyenne dans la fourchette déclarée", () => {
    // Trois séances dans la seule semaine révolue observable : la cible est 3.
    const seances = ["2026-07-27", "2026-07-29", "2026-07-31"].map((date) => ({ date, dureeMinutes: 60 }));
    const b = bilanProgression(entree({ seances }));
    expect(b.adherence!.seancesParSemaine).toEqual([3]);
    expect(b.adherence!.statut).toBe("dans_la_fourchette");
  });

  it("juge sous le minimum quelqu'un qui s'est arrêté après une bonne semaine", () => {
    // Trois séances début juillet puis plus rien : la moyenne sur les quatre
    // semaines vaut 0,75. Ne regarder que la semaine active dirait l'inverse.
    const seances = ["2026-07-06", "2026-07-08", "2026-07-10"].map((date) => ({ date, dureeMinutes: 60 }));
    const b = bilanProgression(entree({ seances }));
    expect(b.adherence!.seancesParSemaine).toEqual([3, 0, 0, 0]);
    expect(b.adherence!.statut).toBe("sous_le_minimum");
  });

  it("exclut la semaine en cours du décompte", () => {
    // Le 3 août est un lundi : la séance du jour ne doit pas créer une
    // cinquième semaine à une séance qui ferait chuter la moyenne.
    const b = bilanProgression(
      entree({
        seances: [
          { date: "2026-07-27", dureeMinutes: 60 },
          { date: "2026-07-29", dureeMinutes: 60 },
          { date: "2026-08-03", dureeMinutes: 60 },
        ],
      }),
    );
    expect(b.adherence!.semainesObservees).toBe(1);
    expect(b.adherence!.seancesParSemaine).toEqual([2]);
    // La séance du jour compte tout de même dans le total.
    expect(b.seancesTotal).toBe(3);
  });
});

describe("tendance de volume", () => {
  const seriesSemaine = (lundi: string, nb: number, nom = "Développé"): SerieBilan[] =>
    Array.from({ length: nb }, () => serie(lundi, nom, 60, 10));

  it("se tait avec une seule semaine révolue", () => {
    const b = bilanProgression(
      entree({
        seances: [
          { date: "2026-07-27", dureeMinutes: 60 },
          { date: "2026-07-29", dureeMinutes: 60 },
        ],
        series: [...seriesSemaine("2026-07-27", 10), ...seriesSemaine("2026-07-29", 10)],
      }),
    );
    expect(b.volume).toBeNull();
    expect(b.enAttente.join(" ")).toMatch(/deux semaines/i);
  });

  it("compare la dernière semaine révolue à la moyenne des précédentes", () => {
    const b = bilanProgression(
      entree({
        seances: [
          { date: "2026-07-13", dureeMinutes: 60 },
          { date: "2026-07-20", dureeMinutes: 60 },
          { date: "2026-07-27", dureeMinutes: 60 },
        ],
        series: [
          ...seriesSemaine("2026-07-13", 10),
          ...seriesSemaine("2026-07-20", 10),
          ...seriesSemaine("2026-07-27", 15),
        ],
      }),
    );
    expect(b.volume!.seriesDerniereSemaine).toBe(15);
    expect(b.volume!.seriesMoyenneAnterieure).toBe(10);
    expect(b.volume!.variationPct).toBe(50);
    expect(b.volume!.significative).toBe(true);
  });

  it("ne qualifie pas de tendance une variation sous le seuil de bruit", () => {
    const b = bilanProgression(
      entree({
        seances: [
          { date: "2026-07-20", dureeMinutes: 60 },
          { date: "2026-07-27", dureeMinutes: 60 },
        ],
        series: [...seriesSemaine("2026-07-20", 20), ...seriesSemaine("2026-07-27", 21)],
      }),
    );
    expect(b.volume!.variationPct).toBe(5);
    expect(b.volume!.significative).toBe(false);
  });

  it("ignore la semaine en cours, forcément incomplète", () => {
    // Sans cette exclusion, tout indicateur s'effondre chaque lundi matin.
    const b = bilanProgression(
      entree({
        seances: [
          { date: "2026-07-20", dureeMinutes: 60 },
          { date: "2026-07-27", dureeMinutes: 60 },
          { date: "2026-08-03", dureeMinutes: 60 },
        ],
        series: [
          ...seriesSemaine("2026-07-20", 20),
          ...seriesSemaine("2026-07-27", 20),
          ...seriesSemaine("2026-08-03", 1),
        ],
      }),
    );
    expect(b.volume!.seriesDerniereSemaine).toBe(20);
    expect(b.volume!.variationPct).toBe(0);
  });
});

describe("records", () => {
  it("ne présente jamais une première mesure comme un record", () => {
    const b = bilanProgression(
      entree({
        seances: [{ date: "2026-07-20", dureeMinutes: 60 }, { date: "2026-07-27", dureeMinutes: 60 }],
        series: [serie("2026-07-20", "Développé", 60, 10), serie("2026-07-27", "Squat", 100, 5)],
      }),
    );
    expect(b.recordsRecents).toEqual([]);
  });

  it("annonce une seule ligne par exercice et par jour", () => {
    // 70 × 10 après 60 × 10 bat mécaniquement les plages 10, 8, 5, 3 et 1.
    const b = bilanProgression(
      entree({
        seances: [{ date: "2026-07-20", dureeMinutes: 60 }, { date: "2026-07-27", dureeMinutes: 60 }],
        series: [serie("2026-07-20", "Développé", 60, 10), serie("2026-07-27", "Développé", 70, 10)],
      }),
    );
    expect(b.recordsRecents).toHaveLength(1);
    expect(b.recordsRecents[0]!.plage).toBe(10);
    expect(b.recordsRecents[0]!.charge).toBe(70);
    expect(b.recordsRecents[0]!.progressionPct).toBeCloseTo(16.7, 1);
  });

  it("garde chaque dépassement successif, pas seulement le record actuel", () => {
    // Trois séances qui progressent valent trois records franchis. Ne lire que
    // l'état final n'en montrerait qu'un et effacerait deux semaines de travail.
    const b = bilanProgression(
      entree({
        seances: ["2026-07-13", "2026-07-20", "2026-07-27"].map((date) => ({ date, dureeMinutes: 60 })),
        series: [
          serie("2026-07-13", "Développé", 60, 10),
          serie("2026-07-20", "Développé", 65, 10),
          serie("2026-07-27", "Développé", 70, 10),
        ],
      }),
    );
    expect(b.recordsRecents.map((r) => r.charge)).toEqual([70, 65]);
    // Le plus récent en tête.
    expect(b.recordsRecents[0]!.date).toBe("2026-07-27");
  });
});

describe("exercices en progression", () => {
  it("exige trois séances avant de parler de progression", () => {
    const deux = bilanProgression(
      entree({
        seances: [{ date: "2026-07-20", dureeMinutes: 60 }, { date: "2026-07-27", dureeMinutes: 60 }],
        series: [serie("2026-07-20", "Développé", 60, 10), serie("2026-07-27", "Développé", 70, 10)],
      }),
    );
    expect(deux.enProgression).toEqual([]);

    const trois = bilanProgression(
      entree({
        seances: ["2026-07-13", "2026-07-20", "2026-07-27"].map((date) => ({ date, dureeMinutes: 60 })),
        series: [
          serie("2026-07-13", "Développé", 60, 10),
          serie("2026-07-20", "Développé", 65, 10),
          serie("2026-07-27", "Développé", 70, 10),
        ],
      }),
    );
    expect(trois.enProgression).toHaveLength(1);
    expect(trois.enProgression[0]!.seances).toBe(3);
    expect(trois.enProgression[0]!.progressionPct).toBeCloseTo(16.7, 1);
  });

  it("ne retient pas un exercice fait trois fois sans jamais progresser", () => {
    const b = bilanProgression(
      entree({
        seances: ["2026-07-13", "2026-07-20", "2026-07-27"].map((date) => ({ date, dureeMinutes: 60 })),
        series: [
          serie("2026-07-13", "Développé", 60, 10),
          serie("2026-07-20", "Développé", 60, 10),
          serie("2026-07-27", "Développé", 60, 10),
        ],
      }),
    );
    expect(b.enProgression).toEqual([]);
  });
});

describe("stagnations", () => {
  const base = {
    seances: ["2026-07-13", "2026-07-20", "2026-07-27"].map((date) => ({ date, dureeMinutes: 60 })),
    series: [
      serie("2026-07-13", "Développé", 60, 10),
      serie("2026-07-20", "Développé", 60, 10),
      serie("2026-07-27", "Développé", 60, 10),
    ],
  };

  it("retient une stagnation lisible", () => {
    // Le record date de la première séance, deux essais infructueux ont suivi…
    // il en faut trois. Quatre séances au total : trois retentatives.
    const b = bilanProgression(
      entree({
        seances: ["2026-07-06", "2026-07-13", "2026-07-20", "2026-07-27"].map((date) => ({ date, dureeMinutes: 60 })),
        series: [
          serie("2026-07-06", "Développé", 70, 10),
          serie("2026-07-13", "Développé", 60, 10),
          serie("2026-07-20", "Développé", 60, 10),
          serie("2026-07-27", "Développé", 60, 10),
        ],
        stagnations: [
          { exerciseInstanceId: "inst-Développé", exerciseName: "Développé", semainesSansProgression: 4, contexteNormal: true },
        ],
      }),
    );
    expect(b.stagnations).toHaveLength(1);
    expect(b.stagnations[0]!.semaines).toBe(4);
    expect(b.stagnations[0]!.seances).toBe(3);
  });

  it("ne compte pas comme stagnant un exercice qui n'a pas été retenté", () => {
    // Le cœur du sujet : le développé progressait, puis la salle est devenue
    // inaccessible. Six semaines passent sans qu'il soit refait une seule fois.
    // Le calendrier crie « stagnation » ; l'exercice n'a simplement pas eu lieu.
    const b = bilanProgression(
      entree({
        seances: ["2026-07-06", "2026-07-13", "2026-07-20"].map((date) => ({ date, dureeMinutes: 60 })),
        series: [
          serie("2026-07-06", "Développé", 60, 10),
          serie("2026-07-13", "Développé", 65, 10),
          serie("2026-07-20", "Développé", 70, 10),
        ],
        stagnations: [
          { exerciseInstanceId: "inst-Développé", exerciseName: "Développé", semainesSansProgression: 6, contexteNormal: true },
        ],
      }),
    );
    // Le record EST la dernière séance : zéro retentative depuis.
    expect(b.stagnations).toEqual([]);
  });

  it("se tait quand le contexte n'était pas normal", () => {
    // Stagner après trois semaines au rouge n'est pas une stagnation
    // d'entraînement : c'est de la fatigue, et l'écran n'a rien à en conclure.
    const b = bilanProgression(
      entree({
        ...base,
        stagnations: [
          { exerciseInstanceId: "inst-Développé", exerciseName: "Développé", semainesSansProgression: 4, contexteNormal: false },
        ],
      }),
    );
    expect(b.stagnations).toEqual([]);
  });

  it("se tait sur un exercice retenté moins de trois fois", () => {
    // Le cœur de la demande : un exercice remplacé faute de matériel a peu de
    // séances et ne doit jamais être présenté comme une stagnation.
    const b = bilanProgression(
      entree({
        seances: [{ date: "2026-07-20", dureeMinutes: 60 }, { date: "2026-07-27", dureeMinutes: 60 }],
        series: [serie("2026-07-20", "Développé", 60, 10), serie("2026-07-27", "Développé", 60, 10)],
        stagnations: [
          { exerciseInstanceId: "inst-Développé", exerciseName: "Développé", semainesSansProgression: 6, semainesEmpechees: 4, contexteNormal: true },
        ],
      }),
    );
    expect(b.stagnations).toEqual([]);
    expect(SEUILS.seancesPourInterpreter).toBe(3);
  });
});

describe("muscles de la période", () => {
  it("compte un muscle secondaire pour moitié et écarte les traces", () => {
    const b = bilanProgression(
      entree({
        seances: [{ date: "2026-07-20", dureeMinutes: 60 }, { date: "2026-07-27", dureeMinutes: 60 }],
        series: [
          serie("2026-07-20", "Développé", 60, 10, { musclesPrincipaux: ["pectoraux"], musclesSecondaires: ["triceps"] }),
          serie("2026-07-20", "Développé", 60, 10, { musclesPrincipaux: ["pectoraux"], musclesSecondaires: ["triceps"] }),
          serie("2026-07-27", "Développé", 60, 10, { musclesPrincipaux: ["pectoraux"], musclesSecondaires: ["triceps"] }),
          serie("2026-07-27", "Développé", 60, 10, { musclesPrincipaux: ["pectoraux"], musclesSecondaires: ["triceps"] }),
        ],
      }),
    );
    const pecs = b.musclesDeLaPeriode.find((m) => m.muscle === "pectoraux")!;
    const triceps = b.musclesDeLaPeriode.find((m) => m.muscle === "triceps")!;
    expect(pecs.series).toBe(4);
    expect(triceps.series).toBe(2);
    // Une seule série sur un muscle ne dit rien : elle n'est pas citée.
    expect(b.musclesDeLaPeriode.find((m) => m.muscle === "mollets")).toBeUndefined();
  });
});

describe("durée", () => {
  it("prend la médiane et ignore les séances non chronométrées", () => {
    const b = bilanProgression(
      entree({
        seances: [
          { date: "2026-07-13", dureeMinutes: 50 },
          { date: "2026-07-20", dureeMinutes: null },
          { date: "2026-07-27", dureeMinutes: 70 },
        ],
      }),
    );
    expect(b.dureeMedianeMinutes).toBe(60);
  });
});
