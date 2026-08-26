import { describe, it, expect } from "vitest";
import { douleur } from "./douleur";
import type { ExerciceRestant } from "./types";

const exo = (nom: string, muscles: string[], role: ExerciceRestant["categorie_role"] = "accessoire"): ExerciceRestant => ({
  exercise_instance_id: nom,
  nom,
  muscles_principaux: muscles,
  categorie_role: role,
  statut: "à_venir",
});

// Muscles ecrits dans l'ancien vocabulaire de la base, comme dans les donnees reelles.
const seance: ExerciceRestant[] = [
  exo("Developpe militaire", ["epaule_ant"], "pilier"),
  exo("Elevation laterale", ["epaule_lat"]),
  exo("Leg press", ["quads"], "pilier"),
  exo("Leg curl", ["ischios"]),
];

describe("SOS douleur", () => {
  it("douleur severe : arret de seance", () => {
    expect(douleur("Épaule", 8, "sourde", seance).action).toBe("stop_seance");
  });

  it("douleur aigue ou irradiante : arret quel que soit le niveau", () => {
    expect(douleur("Épaule", 2, "aiguë", seance).action).toBe("stop_seance");
    expect(douleur("Épaule", 1, "irradiation", seance).action).toBe("stop_seance");
  });

  it("douleur moderee : retire les exercices de la zone", () => {
    // Scenario exact du rapport d'audit : avant, ce cas affichait
    // "Exercices sur epaule retires" en ne retirant rien.
    const r = douleur("Épaule", 6, "sourde", seance);
    expect(r.action).toBe("skip_zone");
    expect(r.exercices_impactes.map((e) => e.exercise_instance_id).sort()).toEqual([
      "Developpe militaire",
      "Elevation laterale",
    ]);
    expect(r.exercices_impactes.every((e) => e.impact === "skip")).toBe(true);
  });

  it("douleur legere : allege au lieu de retirer", () => {
    const r = douleur("Genou", 2, "raideur", seance);
    expect(r.action).toBe("alleger");
    expect(r.exercices_impactes.map((e) => e.exercise_instance_id).sort()).toEqual([
      "Leg curl",
      "Leg press",
    ]);
    expect(r.exercices_impactes.every((e) => e.impact === "alleger")).toBe(true);
  });

  it("n'impacte pas les exercices etrangers a la zone", () => {
    const r = douleur("Épaule", 5, "sourde", seance);
    const touches = r.exercices_impactes.map((e) => e.exercise_instance_id);
    expect(touches).not.toContain("Leg press");
    expect(touches).not.toContain("Leg curl");
  });

  it("zone sans exercice correspondant : liste vide, pas d'erreur", () => {
    const r = douleur("Cheville", 5, "sourde", seance);
    expect(r.action).toBe("skip_zone");
    expect(r.exercices_impactes).toEqual([]);
  });
});
