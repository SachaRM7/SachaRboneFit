import { describe, it, expect } from "vitest";
import { coutDesExercicesRestants, tempsDepasse } from "./temps-depasse";
import type { ExerciceRestant } from "./types";

/**
 * Ce que la modale « Temps » disait en recette.
 *
 * « 105 min / cible 60 min », puis « Temps OK après recalcul », puis
 * « Appliquer les coupes » — sans jamais dire ce qui serait coupé.
 *
 * Le défaut était dans la comparaison : elle confrontait le travail restant au
 * DÉPASSEMENT déjà accumulé, pas au temps disponible. Autrement dit « il reste
 * moins de travail que le retard déjà pris, donc tout va bien » — plus on
 * dépassait, plus il devenait facile d'être déclaré dans les temps.
 */

const exo = (
  nom: string,
  role: ExerciceRestant["categorie_role"],
  ordre: number,
): ExerciceRestant => ({
  exercise_instance_id: nom,
  nom,
  muscles_principaux: [],
  categorie_role: role,
  statut: "à_venir",
  ordre,
});

const SEANCE: ExerciceRestant[] = [
  exo("Développé couché", "pilier", 1),
  exo("Tirage vertical", "pilier", 2),
  exo("Élévations latérales", "accessoire", 3),
  exo("Curl pupitre", "accessoire", 4),
];

describe("le défaut d'origine : plus on dépassait, plus tout allait bien", () => {
  it("à 105 min pour une cible de 60, rien n'est « OK »", () => {
    const r = tempsDepasse(105, 60, SEANCE);
    expect(r.message).not.toContain("OK");
    expect(r.temps_estime_apres_coupe_min).toBeGreaterThan(60);
  });

  it("dépasser davantage n'améliore jamais le verdict", () => {
    // L'ancienne comparaison rendait le contraire : à 200 min, tout passait.
    const a = tempsDepasse(70, 60, SEANCE);
    const b = tempsDepasse(200, 60, SEANCE);
    expect(b.temps_estime_apres_coupe_min).toBeGreaterThan(a.temps_estime_apres_coupe_min);
    expect(b.message).not.toContain("dans ta cible");
  });
});

describe("le seul repère est l'heure d'arrivée", () => {
  it("une séance qui rentre dans la cible ne propose aucune coupe", () => {
    const r = tempsDepasse(10, 90, SEANCE);
    expect(r.exercices_coupes).toHaveLength(0);
    expect(r.message).toContain("dans ta cible");
  });

  it("elle annonce l'heure d'arrivée, pas un jugement", () => {
    const r = tempsDepasse(10, 90, SEANCE);
    expect(r.message).toMatch(/termines vers \d+ min/);
  });
});

describe("ce qui serait coupé est nommé", () => {
  it("les accessoires d'abord, en partant de la fin", () => {
    const r = tempsDepasse(50, 60, SEANCE);
    expect(r.exercices_coupes[0]).toBe("Curl pupitre");
    expect(r.message).toContain("Curl pupitre");
  });

  it("un pilier n'est jamais proposé à la coupe", () => {
    // Retirer un pilier, ce n'est plus gérer le temps : c'est changer la séance.
    const r = tempsDepasse(200, 60, SEANCE);
    expect(r.exercices_coupes).not.toContain("Développé couché");
    expect(r.exercices_coupes).not.toContain("Tirage vertical");
  });

  it("sans accessoire restant, la modale le dit au lieu de proposer une coupe", () => {
    const piliers = SEANCE.filter((e) => e.categorie_role === "pilier");
    const r = tempsDepasse(120, 60, piliers);
    expect(r.exercices_coupes).toHaveLength(0);
    expect(r.message).toContain("exercices principaux");
  });

  it("la coupe s'arrête dès que la cible est tenable", () => {
    const r = tempsDepasse(50, 60, SEANCE);
    // Une seule suffit ici : on ne retire pas plus que nécessaire.
    expect(r.exercices_coupes.length).toBeLessThan(2);
  });
});

describe("le coût d'un exercice tient compte de ce qui reste vraiment", () => {
  it("les séries restantes comptent, pas une seule par exercice", () => {
    // L'estimation comptait UNE série par exercice : quatre séries et une
    // seule pesaient pareil.
    const [a, b] = coutDesExercicesRestants(
      [exo("A", "accessoire", 1), exo("B", "accessoire", 2)],
      { A: 4, B: 1 },
    );
    expect(a!.secondes).toBeGreaterThan(b!.secondes * 3);
  });

  it("le repos prescrit sur la machine est utilisé", () => {
    const [court, long] = coutDesExercicesRestants(
      [exo("court", "accessoire", 1), exo("long", "accessoire", 2)],
      { court: 2, long: 2 },
      { court: 60, long: 180 },
    );
    expect(long!.secondes).toBeGreaterThan(court!.secondes);
  });

  it("un exercice terminé ne coûte plus rien", () => {
    const [fini] = coutDesExercicesRestants([exo("fini", "accessoire", 1)], { fini: 0 });
    expect(fini!.secondes).toBe(0);
  });

  it("l'ordre de la séance est respecté", () => {
    const couts = coutDesExercicesRestants([
      exo("troisieme", "accessoire", 3),
      exo("premier", "accessoire", 1),
    ]);
    expect(couts.map((c) => c.nom)).toEqual(["premier", "troisieme"]);
  });
});

describe("aucun message n'ordonne d'arrêter", () => {
  it("quel que soit le dépassement", () => {
    for (const minutes of [10, 61, 105, 300]) {
      const message = tempsDepasse(minutes, 60, SEANCE).message;
      expect(message).not.toMatch(/arrête|arrêter|stop|tu dois/i);
    }
  });
});
