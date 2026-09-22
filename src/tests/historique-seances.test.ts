import { describe, expect, it } from "vitest";
import { seancesRecentes, SEANCES_HISTORIQUE_LIVE } from "@/services/plan-seance";

/**
 * Les séances datées que le Live reçoit.
 *
 * La requête partagée trie par date de séance décroissante ; ce qui se décide
 * ici, c'est le regroupement : quelles séances, dans quel ordre, et ce qu'une
 * coupure n'a pas le droit de faire. Une coupure au milieu d'une séance
 * afficherait deux séries sur trois comme si c'était la séance entière.
 */

type Ligne = {
  sessionLogId: string; date: string; numero: number; charge: number; reps: number;
  rpe: number | null;
};

const ligne = (
  sessionLogId: string, date: string, numero: number, charge: number, reps: number,
  rpe: number | null,
): Ligne => ({ sessionLogId, date, numero, charge, reps, rpe });

describe("seancesRecentes", () => {
  it("groupe les series par seance, la plus recente d'abord", () => {
    const seances = seancesRecentes([
      ligne("s2", "2026-09-20", 1, 60, 10, 2),
      ligne("s2", "2026-09-20", 2, 60, 9, 1),
      ligne("s1", "2026-09-17", 1, 57.5, 10, 3),
    ]);

    expect(seances.map((s) => s.date)).toEqual(["2026-09-20", "2026-09-17"]);
    expect(seances[0]!.sets).toEqual([
      { numero: 1, charge: 60, reps: 10, rpe: 2 },
      { numero: 2, charge: 60, reps: 9, rpe: 1 },
    ]);
  });

  it("s'arrete a la deuxieme seance et ne coupe jamais une seance en deux", () => {
    const seances = seancesRecentes([
      ligne("s3", "2026-09-21", 1, 60, 10, 2),
      ligne("s3", "2026-09-21", 2, 60, 8, 0),
      ligne("s2", "2026-09-20", 1, 57.5, 10, 2),
      ligne("s1", "2026-09-17", 1, 55, 10, 3),
    ]);

    expect(seances).toHaveLength(SEANCES_HISTORIQUE_LIVE);
    expect(seances[0]!.sets).toHaveLength(2);
    expect(seances[1]!.sessionLogId).toBe("s2");
  });

  it("garde distinctes deux seances du meme jour", () => {
    const seances = seancesRecentes([
      ligne("matin", "2026-09-20", 1, 60, 10, 2),
      ligne("soir", "2026-09-20", 1, 60, 12, 1),
    ]);

    expect(seances.map((s) => s.sessionLogId)).toEqual(["matin", "soir"]);
  });

  it("laisse le RPE absent a null plutot que d'inventer un zero", () => {
    const seances = seancesRecentes([ligne("s1", "2026-09-17", 1, 55, 10, null)]);

    expect(seances[0]!.sets[0]!.rpe).toBeNull();
  });

  it("rend une liste vide quand il n'y a aucune seance", () => {
    expect(seancesRecentes([])).toEqual([]);
  });
});
