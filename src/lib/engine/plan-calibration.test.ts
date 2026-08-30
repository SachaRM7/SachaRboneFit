import { describe, it, expect } from "vitest";
import {
  planCalibration,
  nombreDExercices,
  ORDRE_PILIERS,
  SERIES_CALIBRATION,
  RPE_CALIBRATION,
  type MachineDisponible,
  type EntreePlanCalibration,
} from "./plan-calibration";

let compteur = 0;
const machine = (
  pilier: string,
  nom: string,
  role = "pilier",
  muscles: string[] = ["pectoraux"],
): MachineDisponible => ({
  instanceId: `i-${String(++compteur).padStart(3, "0")}`,
  exerciceId: `e-${compteur}`,
  nom,
  pilier,
  categorieRole: role,
  musclesPrincipaux: muscles,
});

const salleComplete = (): MachineDisponible[] =>
  ORDRE_PILIERS.map((p) => machine(p, `Machine ${p}`));

const base = (patch: Partial<EntreePlanCalibration> = {}): EntreePlanCalibration => ({
  machines: salleComplete(),
  frequenceCibleParSemaine: 3,
  dureeSeanceCibleMinutes: 60,
  ...patch,
});

describe("nombreDExercices", () => {
  it("tient dans la durée annoncée et reste dans des bornes raisonnables", () => {
    expect(nombreDExercices(60)).toBe(6);
    expect(nombreDExercices(45)).toBe(4);
    // Personne ne mesure trois exercices en un quart d'heure, mais proposer
    // moins de trois ne mesurerait rien du tout.
    expect(nombreDExercices(20)).toBe(3);
    expect(nombreDExercices(180)).toBe(7);
  });
});

describe("planCalibration", () => {
  it("produit autant de séances que la fréquence visée", () => {
    expect(planCalibration(base({ frequenceCibleParSemaine: 4 })).seances).toHaveLength(4);
    expect(planCalibration(base({ frequenceCibleParSemaine: 1 })).seances).toHaveLength(1);
    // Le plafond protège d'une saisie absurde sans rien refuser d'utile.
    expect(planCalibration(base({ frequenceCibleParSemaine: 9 })).seances).toHaveLength(6);
  });

  it("prescrit une mesure, pas une accumulation", () => {
    const [a] = planCalibration(base()).seances;
    for (const ex of a!.exercices) {
      expect(ex.seriesCibles).toBe(SERIES_CALIBRATION);
      expect(ex.rpeCible).toBe(RPE_CALIBRATION);
      // RPE 7 = trois répétitions en réserve : jamais près de l'échec.
      expect(ex.rpeCible).toBeLessThan(9);
    }
  });

  it("n'invente aucun exercice absent de la salle", () => {
    const ids = new Set(salleComplete().map((m) => m.instanceId));
    const plan = planCalibration(base({ machines: [...ids].map((_, i) => salleComplete()[i]!) }));
    for (const s of plan.seances) {
      for (const ex of s.exercices) expect(typeof ex.instanceId).toBe("string");
    }
  });

  it("signale les piliers que la salle ne permet pas de travailler", () => {
    const plan = planCalibration(
      base({ machines: [machine("P1_poussee", "Développé couché")] }),
    );
    expect(plan.piliersNonCouverts).toContain("P3_squat");
    expect(plan.piliersNonCouverts).not.toContain("P1_poussee");
    expect(plan.avertissements.join(" ")).toMatch(/Aucune machine pour/);
  });

  it("ne rend aucune séance quand la salle est vide, et le dit", () => {
    const plan = planCalibration(base({ machines: [] }));
    expect(plan.seances).toEqual([]);
    expect(plan.avertissements[0]).toMatch(/Aucune machine renseignée/);
  });

  it("distingue une salle vide d'une salle entièrement écartée", () => {
    const plan = planCalibration(
      base({
        machines: [machine("P1_poussee", "Développé couché", "pilier", ["pectoraux"])],
        musclesSensibles: ["pectoraux"],
      }),
    );
    expect(plan.seances).toEqual([]);
    expect(plan.avertissements[0]).toMatch(/écartées par tes contraintes/);
  });

  it("écarte un exercice refusé à l'onboarding", () => {
    const machines = [
      machine("P1_poussee", "Développé couché"),
      machine("P1_poussee", "Développé incliné"),
    ];
    const plan = planCalibration(
      base({ machines, exercicesRefuses: ["  développé couché "] }),
    );
    const utilises = plan.seances.flatMap((s) => s.exercices.map((e) => e.instanceId));
    expect(utilises).not.toContain(machines[0]!.instanceId);
    expect(utilises).toContain(machines[1]!.instanceId);
  });

  it("garde un exercice qui ne sollicite pas QUE des muscles sensibles", () => {
    // Une gêne à l'épaule n'interdit pas de mesurer les jambes.
    const m = machine("P1_poussee", "Développé couché", "pilier", ["pectoraux", "epaules"]);
    const plan = planCalibration(base({ machines: [m], musclesSensibles: ["epaules"] }));
    expect(plan.seances[0]!.exercices).toHaveLength(1);
  });

  it("mesure le rôle de pilier avant son substitut", () => {
    const accessoire = machine("P1_poussee", "Écarté poulie", "accessoire");
    const principal = machine("P1_poussee", "Développé couché", "pilier");
    const plan = planCalibration(
      base({ machines: [accessoire, principal], frequenceCibleParSemaine: 1 }),
    );
    expect(plan.seances[0]!.exercices[0]!.instanceId).toBe(principal.instanceId);
  });

  it("mesure une autre machine du même pilier d'une séance à l'autre", () => {
    // Deux séances identiques mesureraient deux fois la même chose.
    const a = machine("P1_poussee", "Développé couché");
    const b = machine("P1_poussee", "Développé incliné");
    const plan = planCalibration(
      base({ machines: [a, b], frequenceCibleParSemaine: 2, dureeSeanceCibleMinutes: 20 }),
    );
    const premiere = plan.seances[0]!.exercices.map((e) => e.instanceId);
    const seconde = plan.seances[1]!.exercices.map((e) => e.instanceId);
    expect(premiere).not.toEqual(seconde);
  });

  it("ne répète jamais la même machine dans une séance", () => {
    for (const s of planCalibration(base()).seances) {
      const ids = s.exercices.map((e) => e.instanceId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("touche chaque pilier au moins une fois sur l'ensemble des séances", () => {
    // C'est la raison d'être de la phase : on ne calibre pas ce qu'on n'a pas fait.
    const machines = salleComplete();
    const parId = new Map(machines.map((m) => [m.instanceId, m]));
    const plan = planCalibration(base({ machines, frequenceCibleParSemaine: 3 }));
    const vus = new Set(
      plan.seances.flatMap((s) => s.exercices.map((e) => parId.get(e.instanceId)!.pilier)),
    );
    expect(vus.size).toBe(ORDRE_PILIERS.length);
  });

  it("ordonne les mouvements exigeants en premier dans la séance", () => {
    // Une mesure faite sur un muscle déjà fatigué ne mesure pas la même chose.
    const machines = salleComplete();
    const parId = new Map(machines.map((m) => [m.instanceId, m]));
    for (const s of planCalibration(base({ machines })).seances) {
      const rangs = s.exercices.map((e) =>
        ORDRE_PILIERS.indexOf(parId.get(e.instanceId)!.pilier as (typeof ORDRE_PILIERS)[number]),
      );
      expect([...rangs].sort((x, y) => x - y)).toEqual(rangs);
      expect(s.exercices.map((e) => e.ordre)).toEqual(rangs.map((_, i) => i + 1));
    }
  });

  it("respecte le budget d'exercices imposé par la durée", () => {
    const plan = planCalibration(base({ dureeSeanceCibleMinutes: 45 }));
    for (const s of plan.seances) expect(s.exercices.length).toBeLessThanOrEqual(4);
  });

  it("est reproductible : deux appels identiques donnent le même plan", () => {
    const e = base();
    expect(planCalibration(e)).toEqual(planCalibration(e));
  });
});
