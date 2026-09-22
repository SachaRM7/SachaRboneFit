import { describe, expect, it } from "vitest";
import {
  MAX_MUSCLES_AFFICHES,
  libellesMusclesLive,
  ligneMusclesLive,
} from "@/components/session/presentation-live";

/**
 * Les muscles du Live viennent de la base, pas du referentiel.
 *
 * `musclesPrincipaux` porte « pecs », « epaule_ant » ; l'ecran les affichait
 * tels quels parce que `libelleMuscle()` ne connait que les cles canoniques.
 * Ces cas fixent ce qui doit sortir a l'ecran, et surtout ce qui ne doit pas :
 * un muscle invente, un doublon, ou une quatrieme etoile en trop.
 */

describe("libellesMusclesLive", () => {
  it("traduit le vocabulaire de la base en francais lisible", () => {
    expect(libellesMusclesLive(["pecs", "dos"], [])).toEqual([
      "Pectoraux",
      "Dorsaux",
    ]);
  });

  it("regroupe les variantes d'epaule sous un seul libelle", () => {
    expect(
      libellesMusclesLive(["epaule_ant", "epaules", "epaule_lat"], []),
    ).toEqual(["Épaules"]);
  });

  it("garde un muscle posterieur d'epaule distinct", () => {
    expect(
      libellesMusclesLive(["epaule_post", "epaule_ant"], []),
    ).toEqual(["Arrière d'épaule", "Épaules"]);
  });

  it("ordonne les principaux avant les secondaires", () => {
    expect(
      libellesMusclesLive(["pectoraux"], ["epaules", "triceps"]),
    ).toEqual(["Pectoraux", "Épaules", "Triceps"]);
  });

  it("ecarte un secondaire deja cite en principal", () => {
    expect(
      libellesMusclesLive(["epaule_ant", "triceps"], ["epaules", "pectoraux"]),
    ).toEqual(["Épaules", "Triceps", "Pectoraux"]);
  });

  it("plafonne a trois libelles", () => {
    const libelles = libellesMusclesLive(
      ["pectoraux", "epaules"],
      ["triceps", "core", "mollets"],
    );
    expect(libelles).toHaveLength(MAX_MUSCLES_AFFICHES);
    expect(libelles).toEqual(["Pectoraux", "Épaules", "Triceps"]);
  });

  it("montre une valeur hors referentiel telle quelle plutot que de l'inventer", () => {
    expect(libellesMusclesLive(["pectoraux", "muscle_inconnu"], [])).toEqual([
      "Pectoraux",
      "muscle_inconnu",
    ]);
  });

  it("ignore les valeurs vides, nulles et les listes absentes", () => {
    expect(libellesMusclesLive(null, undefined)).toEqual([]);
    expect(libellesMusclesLive([], [""])).toEqual([]);
    expect(libellesMusclesLive(["  pecs  ", null, undefined], [])).toEqual([
      "Pectoraux",
    ]);
  });
});

describe("ligneMusclesLive", () => {
  it("rend une ligne lisible, principaux puis secondaires", () => {
    expect(ligneMusclesLive(["pecs"], ["epaules", "triceps"])).toBe(
      "Pectoraux · Épaules · Triceps",
    );
  });

  it("rend null quand il n'y a rien a montrer", () => {
    expect(ligneMusclesLive(undefined, [])).toBeNull();
  });
});
