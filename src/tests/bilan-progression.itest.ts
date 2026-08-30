import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Le bilan de progression, contre une vraie base.
 *
 * Le moteur est testé unitairement ; ce qui se vérifie ici est ce qu'il ne peut
 * pas voir : que les jointures ramènent bien les séries, que les séances
 * archivées sortent des calculs, que le sélecteur « Par exercice » a enfin
 * quelque chose à proposer, et — le point qui compte le plus — qu'un exercice
 * remplacé faute de matériel ne remonte jamais comme une stagnation.
 */

const U = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({ getAuthenticatedUserId: async () => U }));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { eq } = await import("drizzle-orm");
const { bilanDeProgression, exercicesTravailles } = await import("@/services/bilan");
const { lundiDe, decalerDe } = await import("@/lib/semaines");

/** Aujourd'hui figé sur un lundi : les semaines révolues sont alors nettes. */
const AUJOURDHUI = "2026-08-03";
const lundiIlYA = (semaines: number) => decalerDe(lundiDe(AUJOURDHUI), -7 * semaines);

let salle = "";
let developpe = "";
let pompes = "";
let instDeveloppe = "";
let instPompes = "";

const creerExercice = async (nom: string, pilier: string, equipement: string, muscles: string[]) => {
  const [e] = await db
    .insert(schema.exercises)
    .values({
      userId: null, nom, pilier, profilTension: "mi_range", type: "polyarticulaire",
      categorieRole: "pilier", musclesPrincipaux: muscles, musclesSecondaires: ["triceps"],
      equipement, slug: `${nom.toLowerCase().replace(/[^a-z]/g, "-")}-${U.slice(0, 8)}`,
    })
    .returning();
  return e!;
};

/** Une séance avec ses séries, à une date donnée. */
const enregistrerSeance = async (
  date: string,
  series: { instanceId: string; charge: number; reps: number }[],
  options: { archivee?: boolean; feuJour?: string } = {},
) => {
  const [seance] = await db
    .insert(schema.sessionLogs)
    .values({
      userId: U,
      date,
      dureeMinutes: 60,
      feuBiologiqueJour: options.feuJour ?? "vert",
      archiveLe: options.archivee ? new Date() : null,
    })
    .returning();

  await db.insert(schema.setLogs).values(
    series.map((s, i) => ({
      sessionLogId: seance!.id,
      exerciseInstanceId: s.instanceId,
      numeroSerie: i + 1,
      repsEffectuees: s.reps,
      charge: s.charge,
      rpeEffectif: 8,
    })),
  );
  return seance!;
};

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBeTruthy();
  await db.insert(schema.users).values({
    id: U,
    email: `${U}@t.test`,
    nom: "Testeur",
    frequenceMinParSemaine: 2,
    frequenceCibleParSemaine: 3,
    frequenceMaxParSemaine: 4,
  });

  const dev = await creerExercice("Developpe couche", "P1_poussee", "barre", ["pectoraux"]);
  const po = await creerExercice("Pompes", "P1_poussee", "poids_du_corps", ["pectoraux"]);
  developpe = dev.id;
  pompes = po.id;

  const [s] = await db
    .insert(schema.gyms)
    .values({ userId: U, nom: `Salle ${U.slice(0, 8)}`, equipementsDisponibles: ["barre"] })
    .returning();
  salle = s!.id;

  const inst = await db
    .insert(schema.exerciseInstances)
    .values([
      { userId: U, exerciseId: developpe, gymId: salle, machineNom: "Banc", conventionCharge: "poids_total", incrementsPossibles: [2.5] },
      { userId: U, exerciseId: pompes, gymId: salle, machineNom: "Sol", conventionCharge: "poids_du_corps", incrementsPossibles: [] },
    ])
    .returning();
  instDeveloppe = inst[0]!.id;
  instPompes = inst[1]!.id;
});

beforeEach(async () => {
  const seances = await db.query.sessionLogs.findMany({ where: eq(schema.sessionLogs.userId, U) });
  for (const s of seances) {
    await db.delete(schema.setLogs).where(eq(schema.setLogs.sessionLogId, s.id));
    await db.delete(schema.sessionPlanItems).where(eq(schema.sessionPlanItems.sessionLogId, s.id));
  }
  await db.delete(schema.sessionLogs).where(eq(schema.sessionLogs.userId, U));
});

afterAll(async () => {
  const seances = await db.query.sessionLogs.findMany({ where: eq(schema.sessionLogs.userId, U) });
  for (const s of seances) {
    await db.delete(schema.setLogs).where(eq(schema.setLogs.sessionLogId, s.id));
    await db.delete(schema.sessionPlanItems).where(eq(schema.sessionPlanItems.sessionLogId, s.id));
  }
  await db.delete(schema.sessionLogs).where(eq(schema.sessionLogs.userId, U));
  await db.delete(schema.exerciseInstances).where(eq(schema.exerciseInstances.gymId, salle));
  await db.delete(schema.gyms).where(eq(schema.gyms.id, salle));
  await db.delete(schema.exercises).where(eq(schema.exercises.id, developpe));
  await db.delete(schema.exercises).where(eq(schema.exercises.id, pompes));
  await db.delete(schema.users).where(eq(schema.users.id, U));
});

describe("bilan de progression", () => {
  it("ne raconte rien d'un compte vierge, et le dit", async () => {
    const b = await bilanDeProgression(U, AUJOURDHUI);
    expect(b.etat).toBe("sans_donnees");
    expect(b.seancesTotal).toBe(0);
    expect(b.recordsRecents).toEqual([]);
  });

  it("après une séance, annonce des références plutôt qu'un record", async () => {
    await enregistrerSeance(lundiIlYA(1), [{ instanceId: instDeveloppe, charge: 60, reps: 10 }]);
    const b = await bilanDeProgression(U, AUJOURDHUI);
    expect(b.etat).toBe("premieres_references");
    expect(b.recordsRecents).toEqual([]);
    expect(b.enAttente.join(" ")).toMatch(/références/i);
  });

  it("reconstitue séances, records et muscles depuis la base", async () => {
    await enregistrerSeance(lundiIlYA(3), [{ instanceId: instDeveloppe, charge: 60, reps: 10 }]);
    await enregistrerSeance(lundiIlYA(2), [{ instanceId: instDeveloppe, charge: 65, reps: 10 }]);
    await enregistrerSeance(lundiIlYA(1), [{ instanceId: instDeveloppe, charge: 70, reps: 10 }]);

    const b = await bilanDeProgression(U, AUJOURDHUI);

    expect(b.etat).toBe("en_route");
    expect(b.seancesTotal).toBe(3);
    expect(b.dureeMedianeMinutes).toBe(60);

    // Deux dépassements successifs, une seule ligne chacun malgré les plages
    // 10/8/5/3/1 qu'une série de dix bat mécaniquement.
    expect(b.recordsRecents).toHaveLength(2);
    expect(b.recordsRecents.map((r) => r.charge)).toEqual([70, 65]);
    expect(b.recordsRecents[0]!.plage).toBe(10);

    expect(b.enProgression).toHaveLength(1);
    expect(b.enProgression[0]!.exerciceNom).toBe("Developpe couche");
    expect(b.enProgression[0]!.progressionPct).toBeCloseTo(16.7, 1);

    // Trois séries de développé : trois pour les pectoraux, une et demie pour
    // les triceps qui n'en sont que secondaires — sous le seuil, donc non cité.
    const pecs = b.musclesDeLaPeriode.find((m) => m.muscle === "pectoraux")!;
    expect(pecs.series).toBe(3);
    expect(b.musclesDeLaPeriode.find((m) => m.muscle === "triceps")).toBeUndefined();
  });

  it("cite un muscle secondaire dès qu'il dépasse la trace", async () => {
    // Quatre séries de développé : deux séries de triceps, le seuil est atteint.
    await enregistrerSeance(lundiIlYA(2), [
      { instanceId: instDeveloppe, charge: 60, reps: 10 },
      { instanceId: instDeveloppe, charge: 60, reps: 10 },
    ]);
    await enregistrerSeance(lundiIlYA(1), [
      { instanceId: instDeveloppe, charge: 60, reps: 10 },
      { instanceId: instDeveloppe, charge: 60, reps: 10 },
    ]);

    const b = await bilanDeProgression(U, AUJOURDHUI);
    expect(b.musclesDeLaPeriode.find((m) => m.muscle === "pectoraux")!.series).toBe(4);
    expect(b.musclesDeLaPeriode.find((m) => m.muscle === "triceps")!.series).toBe(2);
  });

  it("exclut les séances archivées de tous les calculs", async () => {
    await enregistrerSeance(lundiIlYA(2), [{ instanceId: instDeveloppe, charge: 60, reps: 10 }]);
    await enregistrerSeance(lundiIlYA(1), [{ instanceId: instDeveloppe, charge: 200, reps: 10 }], {
      archivee: true,
    });

    const b = await bilanDeProgression(U, AUJOURDHUI);
    expect(b.seancesTotal).toBe(1);
    // La charge archivée ne doit fabriquer aucun record.
    expect(b.recordsRecents).toEqual([]);
  });

  it("calcule l'adhérence sur la fourchette déclarée, semaine en cours exclue", async () => {
    // Deux séances dans chacune des deux dernières semaines révolues.
    for (const semaine of [2, 1]) {
      await enregistrerSeance(lundiIlYA(semaine), [{ instanceId: instDeveloppe, charge: 60, reps: 10 }]);
      await enregistrerSeance(decalerDe(lundiIlYA(semaine), 2), [
        { instanceId: instDeveloppe, charge: 60, reps: 10 },
      ]);
    }
    // Une séance aujourd'hui : elle compte au total, pas dans les semaines closes.
    await enregistrerSeance(AUJOURDHUI, [{ instanceId: instDeveloppe, charge: 60, reps: 10 }]);

    const b = await bilanDeProgression(U, AUJOURDHUI);
    expect(b.seancesTotal).toBe(5);
    expect(b.adherence!.seancesParSemaine).toEqual([2, 2]);
    expect(b.adherence!.semainesTenues).toBe(2);
    expect(b.adherence!.statut).toBe("dans_la_fourchette");
  });

  it("ne déclare pas stagnant un exercice empêché par un changement de lieu", async () => {
    // Le développé progresse, puis la salle devient inaccessible : trois séances
    // de pompes le remplacent. Sans la traçabilité, le développé passerait pour
    // stagnant — une absence parfaitement expliquée présentée comme un échec.
    await enregistrerSeance(lundiIlYA(8), [{ instanceId: instDeveloppe, charge: 60, reps: 10 }]);
    await enregistrerSeance(lundiIlYA(7), [{ instanceId: instDeveloppe, charge: 65, reps: 10 }]);
    await enregistrerSeance(lundiIlYA(6), [{ instanceId: instDeveloppe, charge: 70, reps: 10 }]);

    for (const semaine of [3, 2, 1]) {
      const seance = await enregistrerSeance(lundiIlYA(semaine), [
        { instanceId: instPompes, charge: 0.1, reps: 15 },
      ]);
      await db.insert(schema.sessionPlanItems).values({
        sessionLogId: seance.id,
        ordre: 1,
        exerciseInstanceId: instPompes,
        exerciseInstancePrevuId: instDeveloppe,
        contexteAdaptation: { type: "changement_lieu", lieuApresNom: "Maison" },
        raisonSubstitution: "Banc indisponible à Maison — remplacé par Pompes.",
        seriesCibles: 3,
        fourchetteRepsMin: 8,
        fourchetteRepsMax: 15,
      });
    }

    const b = await bilanDeProgression(U, AUJOURDHUI);
    const noms = b.stagnations.map((s) => s.exerciceNom);
    expect(noms).not.toContain("Developpe couche");
  });

  it("remplit le sélecteur « Par exercice », le plus récent en tête", async () => {
    await enregistrerSeance(lundiIlYA(2), [{ instanceId: instDeveloppe, charge: 60, reps: 10 }]);
    await enregistrerSeance(lundiIlYA(1), [{ instanceId: instPompes, charge: 0.1, reps: 15 }]);

    const liste = await exercicesTravailles(U);
    expect(liste.map((e) => e.nom)).toEqual(["Pompes", "Developpe couche"]);
    expect(liste[0]!.machineNom).toBe("Sol");
    expect(liste[0]!.seances).toBe(1);
  });
});
