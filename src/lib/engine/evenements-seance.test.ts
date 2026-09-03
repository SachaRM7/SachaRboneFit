import { describe, it, expect } from "vitest";
import {
  evenementsDeLaSeance,
  libelleFactuel,
  meritentLeCoach,
  type PrescriptionObservee,
  type SerieObservee,
} from "./evenements-seance";

/**
 * Ce que la séance donne à voir pendant qu'elle a lieu.
 *
 * Le Coach n'observait rien entre le chat et le débrief. Les faits étaient
 * pourtant mesurés — repos réel, effort ressenti, séries ajoutées — et perdus.
 */

const LAT = "lat";
const PRESSE = "presse";

const prescription = (over: Partial<PrescriptionObservee> = {}): PrescriptionObservee => ({
  exerciseInstanceId: LAT,
  seriesCibles: 3,
  fourchetteRepsMin: 8,
  fourchetteRepsMax: 12,
  rpeCible: 8,
  reposSecondes: 120,
  ...over,
});

const serie = (over: Partial<SerieObservee> = {}): SerieObservee => ({
  exerciseInstanceId: LAT,
  numeroSerie: 1,
  repsEffectuees: 10,
  charge: 45,
  rpeEffectif: 8,
  reposReelSecondes: 120,
  ...over,
});

describe("le repos réellement pris", () => {
  it("un repos systématiquement écourté se voit", () => {
    // Le cas de la recette : Skip immédiat, trois fois de suite.
    const evenements = evenementsDeLaSeance(
      [1, 2, 3].map((n) => serie({ numeroSerie: n, reposReelSecondes: 8 })),
      [prescription()],
    );
    const repos = evenements.find((e) => e.type === "repos_ecourte");
    expect(repos).toBeDefined();
    expect(repos!.occurrences).toBe(3);
    expect(repos!.mesure).toMatchObject({ prescrit: 120, reel: 8 });
  });

  it("un repos respecté ne produit aucun événement", () => {
    const evenements = evenementsDeLaSeance([serie({ reposReelSecondes: 118 })], [prescription()]);
    expect(evenements.filter((e) => e.type.startsWith("repos"))).toHaveLength(0);
  });

  it("la borne vient de la prescription, pas d'une constante", () => {
    // 40 s est écourté face à 120 s, et normal face à 60 s.
    const court = evenementsDeLaSeance([serie({ reposReelSecondes: 40 })], [prescription()]);
    expect(court.some((e) => e.type === "repos_ecourte")).toBe(true);

    const normal = evenementsDeLaSeance(
      [serie({ reposReelSecondes: 40 })],
      [prescription({ reposSecondes: 60 })],
    );
    expect(normal.some((e) => e.type === "repos_ecourte")).toBe(false);
  });

  it("un repos beaucoup plus long est un fait, lui aussi", () => {
    const evenements = evenementsDeLaSeance([serie({ reposReelSecondes: 400 })], [prescription()]);
    expect(evenements.some((e) => e.type === "repos_rallonge")).toBe(true);
  });

  it("sans repos prescrit, il n'y a rien à comparer", () => {
    const evenements = evenementsDeLaSeance(
      [serie({ reposReelSecondes: 5 })],
      [prescription({ reposSecondes: null })],
    );
    expect(evenements.filter((e) => e.type.startsWith("repos"))).toHaveLength(0);
  });

  it("un intervalle inconnu n'invente pas un skip", () => {
    // Première série d'un exercice : rien ne la précède.
    const evenements = evenementsDeLaSeance(
      [serie({ reposReelSecondes: null })],
      [prescription()],
    );
    expect(evenements.filter((e) => e.type.startsWith("repos"))).toHaveLength(0);
  });
});

describe("l'effort ressenti face à l'effort visé", () => {
  it("un dépassement d'un point est relevé", () => {
    const evenements = evenementsDeLaSeance([serie({ rpeEffectif: 9 })], [prescription({ rpeCible: 8 })]);
    const effort = evenements.find((e) => e.type === "effort_au_dela_de_la_cible");
    expect(effort?.mesure).toMatchObject({ cible: 8, reel: 9, ecart: 1 });
  });

  it("un demi-point reste dans le bruit de la perception", () => {
    const evenements = evenementsDeLaSeance([serie({ rpeEffectif: 8.5 })], [prescription({ rpeCible: 8 })]);
    expect(evenements.filter((e) => e.type.startsWith("effort"))).toHaveLength(0);
  });

  it("un effort nettement plus facile se voit aussi", () => {
    const evenements = evenementsDeLaSeance([serie({ rpeEffectif: 6 })], [prescription({ rpeCible: 8 })]);
    expect(evenements.some((e) => e.type === "effort_en_deca_de_la_cible")).toBe(true);
  });

  it("sans cible prescrite, il n'y a pas d'écart", () => {
    // La cible est facultative depuis qu'on a cessé d'en fabriquer une à 8.
    const evenements = evenementsDeLaSeance([serie({ rpeEffectif: 10 })], [prescription({ rpeCible: null })]);
    expect(evenements.filter((e) => e.type.startsWith("effort"))).toHaveLength(0);
  });

  it("une valeur hors échelle n'est pas une mesure", () => {
    const evenements = evenementsDeLaSeance([serie({ rpeEffectif: 99 })], [prescription()]);
    expect(evenements.filter((e) => e.type.startsWith("effort"))).toHaveLength(0);
  });
});

describe("prescription et réalisation restent distinctes", () => {
  it("les séries en plus sont comptées comme telles", () => {
    const evenements = evenementsDeLaSeance(
      [1, 2, 3, 4, 5, 6].map((n) => serie({ numeroSerie: n })),
      [prescription({ seriesCibles: 2 })],
    );
    const extra = evenements.find((e) => e.type === "series_hors_prescription");
    // Six séries là où deux étaient prescrites : le cas observé en recette.
    expect(extra?.mesure).toMatchObject({ prescrites: 2, faites: 6, ecart: 4 });
  });

  it("faire exactement ce qui est prescrit ne produit rien", () => {
    const evenements = evenementsDeLaSeance(
      [1, 2, 3].map((n) => serie({ numeroSerie: n })),
      [prescription({ seriesCibles: 3 })],
    );
    expect(evenements.some((e) => e.type === "series_hors_prescription")).toBe(false);
  });

  it("en faire moins n'est pas un événement de ce module", () => {
    // Une séance écourtée relève de la référence tronquée, pas d'ici.
    const evenements = evenementsDeLaSeance([serie()], [prescription({ seriesCibles: 3 })]);
    expect(evenements.some((e) => e.type === "series_hors_prescription")).toBe(false);
  });
});

describe("les répétitions face à la fourchette", () => {
  it("sous le minimum, c'est un fait mesuré", () => {
    const evenements = evenementsDeLaSeance(
      [serie({ repsEffectuees: 5 })],
      [prescription({ fourchetteRepsMin: 8 })],
    );
    expect(evenements.find((e) => e.type === "reps_sous_la_fourchette")?.mesure)
      .toMatchObject({ minimum: 8, reel: 5 });
  });

  it("dans la fourchette, rien à dire", () => {
    const evenements = evenementsDeLaSeance([serie({ repsEffectuees: 10 })], [prescription()]);
    expect(evenements.some((e) => e.type === "reps_sous_la_fourchette")).toBe(false);
  });
});

describe("le Coach ne parle pas pour un fait isolé", () => {
  it("un repos écourté une seule fois ne l'interrompt pas", () => {
    const evenements = evenementsDeLaSeance([serie({ reposReelSecondes: 5 })], [prescription()]);
    expect(meritentLeCoach(evenements)).toHaveLength(0);
  });

  it("répété, il devient une tendance de la séance", () => {
    const evenements = evenementsDeLaSeance(
      [1, 2].map((n) => serie({ numeroSerie: n, reposReelSecondes: 5 })),
      [prescription()],
    );
    expect(meritentLeCoach(evenements).map((e) => e.type)).toContain("repos_ecourte");
  });

  it("un effort nettement au-delà de la cible mérite d'être dit tout de suite", () => {
    // La série suivante se prépare maintenant, pas au débrief.
    const evenements = evenementsDeLaSeance([serie({ rpeEffectif: 10 })], [prescription({ rpeCible: 8 })]);
    expect(meritentLeCoach(evenements).map((e) => e.type)).toContain("effort_au_dela_de_la_cible");
  });

  it("une séance conforme ne déclenche rien", () => {
    const evenements = evenementsDeLaSeance(
      [1, 2, 3].map((n) => serie({ numeroSerie: n })),
      [prescription()],
    );
    expect(evenements).toHaveLength(0);
    expect(meritentLeCoach(evenements)).toHaveLength(0);
  });
});

describe("chaque exercice est observé pour lui-même", () => {
  it("deux machines ne mélangent pas leurs faits", () => {
    const evenements = evenementsDeLaSeance(
      [
        serie({ exerciseInstanceId: LAT, reposReelSecondes: 5 }),
        serie({ exerciseInstanceId: LAT, numeroSerie: 2, reposReelSecondes: 5 }),
        serie({ exerciseInstanceId: PRESSE, reposReelSecondes: 120 }),
      ],
      [prescription(), prescription({ exerciseInstanceId: PRESSE })],
    );
    const repos = evenements.filter((e) => e.type === "repos_ecourte");
    expect(repos).toHaveLength(1);
    expect(repos[0]?.exerciseInstanceId).toBe(LAT);
  });

  it("une série sans prescription connue est ignorée", () => {
    const evenements = evenementsDeLaSeance(
      [serie({ exerciseInstanceId: "inconnue", reposReelSecondes: 2 })],
      [prescription()],
    );
    expect(evenements).toHaveLength(0);
  });
});

describe("les phrases citent les nombres mesurés", () => {
  it("elles ne reformulent rien", () => {
    const evenements = evenementsDeLaSeance(
      [1, 2].map((n) => serie({ numeroSerie: n, reposReelSecondes: 8 })),
      [prescription()],
    );
    const phrase = libelleFactuel(evenements.find((e) => e.type === "repos_ecourte")!);
    expect(phrase).toContain("120");
    expect(phrase).toContain("8");
  });

  it("chaque type d'événement en a une", () => {
    const tous = evenementsDeLaSeance(
      [
        serie({ numeroSerie: 1, reposReelSecondes: 5, rpeEffectif: 10, repsEffectuees: 4 }),
        serie({ numeroSerie: 2, reposReelSecondes: 500, rpeEffectif: 5 }),
        serie({ numeroSerie: 3 }),
        serie({ numeroSerie: 4 }),
      ],
      [prescription({ seriesCibles: 2 })],
    );
    for (const e of tous) {
      expect(libelleFactuel(e).length).toBeGreaterThan(0);
    }
    expect(tous.length).toBeGreaterThan(2);
  });
});
