import { describe, expect, it } from "vitest";
import { prochaineEtape, reportesDepuisIncidents } from "./continuite-seance";
import type { AvancementExercice } from "./vue-live";

const etat = (
  id: string,
  statut: AvancementExercice["statut"] = "a_faire",
): AvancementExercice => ({
  id,
  nom: id,
  faites: statut === "termine" ? 2 : 0,
  cibles: 2,
  statut,
});

describe("continuité déterministe d'une séance", () => {
  it("A — reporter l'exercice courant ouvre le suivant actionnable", () => {
    expect(prochaineEtape([etat("A"), etat("B"), etat("C")], ["A"], 0))
      .toMatchObject({ index: 1, origine: "programme", reportesRestants: 1 });
  });

  it("B — les exercices terminés et reportés sont sautés dans le parcours normal", () => {
    expect(
      prochaineEtape(
        [etat("A", "termine"), etat("B", "termine"), etat("C"), etat("D")],
        ["C"],
        1,
      ),
    ).toMatchObject({ index: 3, origine: "programme" });
  });

  it("C — à 5/6, le dernier exercice normal renvoie au reporté", () => {
    expect(
      prochaineEtape(
        [etat("A"), etat("B", "termine"), etat("C", "termine"), etat("D", "termine"), etat("E", "termine"), etat("F", "termine")],
        ["A"],
        5,
      ),
    ).toEqual({ index: 0, origine: "reporte", reportesRestants: 1 });
  });

  it("D — un exercice seul et reporté ne crée aucune boucle", () => {
    expect(prochaineEtape([etat("A")], ["A"], 0))
      .toEqual({ index: null, origine: "aucune_autre", reportesRestants: 1 });
  });

  it("D2 — plusieurs reportés reviennent dans l'ordre du programme", () => {
    expect(
      prochaineEtape(
        [etat("A"), etat("B", "termine"), etat("C"), etat("D", "termine")],
        ["C", "A"],
        3,
      ),
    ).toEqual({ index: 0, origine: "reporte", reportesRestants: 2 });
  });

  it("E — la fin n'existe que lorsque chaque prescription visible est remplie", () => {
    expect(prochaineEtape([etat("A", "termine"), etat("B", "termine")], ["A"], 1))
      .toEqual({ index: null, origine: "terminee", reportesRestants: 0 });
  });

  it("F — un refresh reconstruit le report et le suit à travers la lignée", () => {
    expect(reportesDepuisIncidents(
      [
        {
          type: "machine_occupee",
          decision: "reporter",
          contexte: { exercise_instance_id: "A" },
        },
        {
          type: "temps_depasse",
          decision: "continuer",
          contexte: { exercise_instance_id: "C" },
        },
      ],
      [{ id: "B", lignee: ["A", "B"] }, { id: "C" }],
    )).toEqual(["B"]);
  });
});
