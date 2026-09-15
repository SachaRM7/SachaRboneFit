import { describe, expect, it } from "vitest";
import {
  prescrireAvecDefauts,
  sessionDraftExerciseSchema,
  REPS_MAX_PAR_DEFAUT,
  REPS_MIN_PAR_DEFAUT,
  REPOS_PAR_DEFAUT_SECONDES,
  SERIES_PAR_DEFAUT,
} from "./draft";

/**
 * Les champs de config peuvent être omis — et ce qui est omis est nommé.
 *
 * `exercise_in_template` garde ses colonnes NOT NULL parce que les moteurs
 * lisent un nombre. L'absence est donc résolue à la création, par les valeurs
 * historiques de l'application, et la liste des champs ainsi comblés voyage
 * avec la ligne : sans elle, « 3 × 8-12 » se lirait comme une prescription de
 * l'utilisateur alors que personne ne l'a formulée.
 */
describe("prescrireAvecDefauts", () => {
  it("comble une config entièrement absente, et dit lesquels", () => {
    expect(prescrireAvecDefauts({})).toEqual({
      seriesCibles: SERIES_PAR_DEFAUT,
      fourchetteRepsMin: REPS_MIN_PAR_DEFAUT,
      fourchetteRepsMax: REPS_MAX_PAR_DEFAUT,
      reposSecondes: null,
      prescriptionParDefaut: [
        "seriesCibles",
        "fourchetteRepsMin",
        "fourchetteRepsMax",
        "reposSecondes",
      ],
    });
  });

  it("ne signale que ce qui manque réellement", () => {
    expect(prescrireAvecDefauts({
      seriesCibles: 4,
      fourchetteRepsMin: 6,
      fourchetteRepsMax: 8,
      reposSecondes: 90,
    })).toEqual({
      seriesCibles: 4,
      fourchetteRepsMin: 6,
      fourchetteRepsMax: 8,
      reposSecondes: 90,
      prescriptionParDefaut: null,
    });

    expect(prescrireAvecDefauts({ fourchetteRepsMin: 6 }).prescriptionParDefaut)
      .toEqual(["seriesCibles", "fourchetteRepsMax", "reposSecondes"]);
  });

  it("ne fabrique jamais une charge : elle n'est pas de son ressort", () => {
    // La charge n'a pas de défaut historique — un 0 kg écrit s'afficherait
    // comme une charge réelle. Ce module ne la produit donc pas du tout.
    expect(Object.keys(prescrireAvecDefauts({}))).not.toContain("chargeCible");
  });
});

describe("brouillon de séance", () => {
  const base = {
    clientId: "11111111-1111-4111-8111-111111111111",
    exerciseInstanceId: "22222222-2222-4222-8222-222222222222",
    order: 0,
    targetRir: null,
    tempo: null,
  };

  it("accepte un exercice réduit à sa machine", () => {
    expect(sessionDraftExerciseSchema.parse(base)).toMatchObject({
      sets: SERIES_PAR_DEFAUT,
      repMin: REPS_MIN_PAR_DEFAUT,
      repMax: REPS_MAX_PAR_DEFAUT,
      restSeconds: REPOS_PAR_DEFAUT_SECONDES,
    });
  });

  it("laisse la charge absente plutôt que de la remplir", () => {
    expect(sessionDraftExerciseSchema.parse(base).chargeCible).toBeUndefined();
    expect(sessionDraftExerciseSchema.parse({ ...base, chargeCible: null }).chargeCible).toBeNull();
  });

  it("porte la charge programmée quand elle est déclarée", () => {
    expect(sessionDraftExerciseSchema.parse({ ...base, chargeCible: 42.5 }).chargeCible).toBe(42.5);
  });

  it("refuse une charge nulle ou négative", () => {
    // Une charge « 0 » n'est pas une absence : c'est une valeur fausse.
    expect(sessionDraftExerciseSchema.safeParse({ ...base, chargeCible: 0 }).success).toBe(false);
    expect(sessionDraftExerciseSchema.safeParse({ ...base, chargeCible: -5 }).success).toBe(false);
  });

  it("refuse une fourchette inversée, même complétée par défaut", () => {
    expect(sessionDraftExerciseSchema.safeParse({ ...base, repMin: 20, repMax: 10 }).success)
      .toBe(false);
    // `repMax` omis vaut 12 : une borne basse à 20 reste incohérente.
    expect(sessionDraftExerciseSchema.safeParse({ ...base, repMin: 20 }).success).toBe(false);
  });
});
