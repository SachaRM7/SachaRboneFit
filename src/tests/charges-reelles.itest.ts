import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Le modèle de charge, confronté à la base.
 *
 * Trois garanties se vérifient ici, et aucune ne tient en mémoire seule.
 *
 * La première : une machine hors service sort du parc du jour sans emporter
 * son historique, et revient sans qu'on ait rien à recréer. La deuxième : les
 * propriétés qui donnent leur sens aux séries enregistrées cessent d'être
 * modifiables dès qu'il existe une série. La troisième : deux entrées voisines
 * — le même mouvement sur deux appareils — ne mélangent jamais leurs
 * historiques, ce qui est la condition pour qu'un indice local reste lisible.
 */

const U = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({ getAuthenticatedUserId: async () => U }));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { eq, and } = await import("drizzle-orm");
const { PATCH } = await import("@/app/api/exercise-instances/[id]/route");
const { chargerParc } = await import("@/services/plan-seance");
const { recordsPersonnels } = await import("@/services/progression");

let salle = "";
let exerciceId = "";
const instances: Record<string, string> = {};

const patch = async (id: string, corps: unknown) =>
  PATCH(
    new Request("http://t/x", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    }),
    { params: Promise.resolve({ id }) },
  );

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBeTruthy();

  await db.insert(schema.users).values({
    id: U, email: `${U}@t.test`, nom: "Testeur", onboardingTermineLe: new Date(),
  });

  const [g] = await db.insert(schema.gyms).values({
    userId: U, nom: `Salle ${U.slice(0, 8)}`, equipementsDisponibles: ["machine"],
  }).returning();
  salle = g!.id;

  const [e] = await db.insert(schema.exercises).values({
    userId: null, nom: "Leg press", pilier: "P3_squat", profilTension: "stretch",
    type: "polyarticulaire", categorieRole: "pilier", musclesPrincipaux: ["quadriceps"],
    musclesSecondaires: [], equipement: "machine", slug: `leg-press-${U.slice(0, 8)}`,
  }).returning();
  exerciceId = e!.id;

  // Deux appareils pour le même mouvement, dans la même salle : c'est
  // exactement la configuration où un historique partagé passerait inaperçu.
  for (const [cle, machineNom] of [["a", "Leg press 45°"], ["b", "Leg press horizontale"]]) {
    const [i] = await db.insert(schema.exerciseInstances).values({
      userId: U, exerciseId: exerciceId, gymId: salle, machineNom: machineNom!,
      conventionCharge: "pile_affichee", incrementsPossibles: [5],
      chargeMinimale: 5, chargeMax: 100,
    }).returning();
    instances[cle!] = i!.id;
  }

  const [seance] = await db.insert(schema.sessionLogs).values({
    userId: U, date: "2026-08-10", gymId: salle, dureeMinutes: 60,
  }).returning();

  // Des charges nettement différentes : si les deux entrées se mélangeaient,
  // le record de l'une contaminerait l'autre de façon visible.
  await db.insert(schema.setLogs).values([
    { sessionLogId: seance!.id, exerciseInstanceId: instances.a!, numeroSerie: 1, repsEffectuees: 10, charge: 80, rpeEffectif: 8 },
    { sessionLogId: seance!.id, exerciseInstanceId: instances.b!, numeroSerie: 1, repsEffectuees: 10, charge: 40, rpeEffectif: 8 },
  ]);
});

describe("une machine hors service", () => {
  it("sort du parc du jour", async () => {
    const avant = await chargerParc(U);
    expect(avant.map((i) => i.id)).toContain(instances.a);

    const res = await patch(instances.a!, { etat: "temporairement_indisponible" });
    expect(res.status).toBe(200);

    const apres = await chargerParc(U);
    expect(apres.map((i) => i.id)).not.toContain(instances.a);
    // L'autre appareil du même mouvement reste disponible : la panne retire un
    // appareil, pas un exercice.
    expect(apres.map((i) => i.id)).toContain(instances.b);
  });

  it("garde son historique intact", async () => {
    const series = await db.query.setLogs.findMany({
      where: eq(schema.setLogs.exerciseInstanceId, instances.a!),
    });
    expect(series).toHaveLength(1);
    expect(series[0]!.charge).toBe(80);
  });

  it("n'est pas archivée pour autant", async () => {
    const i = await db.query.exerciseInstances.findFirst({
      where: eq(schema.exerciseInstances.id, instances.a!),
    });
    // Confondre les deux obligeait à archiver puis recréer, et l'historique se
    // retrouvait coupé en deux entrées qui ne se parlent pas.
    expect(i?.archiveLe).toBeNull();
  });

  it("revient sans qu'on ait rien recréé", async () => {
    const res = await patch(instances.a!, { etat: "disponible" });
    expect(res.status).toBe(200);

    const apres = await chargerParc(U);
    expect(apres.map((i) => i.id)).toContain(instances.a);
  });
});

describe("les propriétés qui donnent leur sens aux séries", () => {
  it("refusent d'être modifiées quand un historique existe", async () => {
    const res = await patch(instances.a!, { conventionCharge: "poids_total" });
    expect(res.status).toBe(409);
    const corps = await res.json();
    expect(corps.proprietes).toEqual(["conventionCharge"]);
    expect(corps.error).toMatch(/Archive/);
  });

  it("refusent aussi de changer de sens de charge", async () => {
    const res = await patch(instances.a!, { natureCharge: "assistance" });
    expect(res.status).toBe(409);
  });

  it("laissent corriger ce qui ne réinterprète rien", async () => {
    // Des incréments mal relevés décrivent l'appareil : les corriger ne change
    // le sens d'aucune série déjà enregistrée.
    const res = await patch(instances.a!, { incrementsPossibles: [2.5, 5] });
    expect(res.status).toBe(200);
    const i = await db.query.exerciseInstances.findFirst({
      where: eq(schema.exerciseInstances.id, instances.a!),
    });
    expect(i?.incrementsPossibles).toEqual([2.5, 5]);
    expect(i?.conventionCharge).toBe("pile_affichee");
  });

  it("restent libres tant qu'aucune série n'existe", async () => {
    const [neuve] = await db.insert(schema.exerciseInstances).values({
      userId: U, exerciseId: exerciceId, gymId: salle, machineNom: "Jamais utilisée",
      conventionCharge: "pile_affichee", incrementsPossibles: [5],
    }).returning();

    const res = await patch(neuve!.id, { conventionCharge: "poids_total" });
    expect(res.status).toBe(200);
  });

  it("acceptent qu'on déclare une machine sans incréments relevés", async () => {
    const [neuve] = await db.insert(schema.exerciseInstances).values({
      userId: U, exerciseId: exerciceId, gymId: salle, machineNom: "Pile non relevée",
      conventionCharge: "pile_affichee",
    }).returning();
    // La colonne était NOT NULL : il fallait inventer un chiffre pour saisir un
    // appareil qu'on n'avait pas mesuré.
    expect(neuve!.incrementsPossibles).toBeNull();
  });
});

describe("deux entrées voisines ne se mélangent pas", () => {
  it("tiennent chacune leur record", async () => {
    const records = await recordsPersonnels(U);
    const parInstance = new Map(records.map((r) => [r.exerciseInstanceId, r]));

    expect(parInstance.get(instances.a!)?.charge).toBe(80);
    expect(parInstance.get(instances.b!)?.charge).toBe(40);
  });

  it("portent la même portée de mesure, chacune pour elle-même", async () => {
    const records = await recordsPersonnels(U);
    // Pile affichée : un indice local. Le nombre est lisible face à lui-même
    // et ne traverse pas les appareils — pas même deux presses de la même
    // salle, dont les chariots et les bras de levier diffèrent.
    for (const r of records) expect(r.portee).toBe("indice_local");
  });
});

describe("une assistance", () => {
  let assistance = "";

  beforeAll(async () => {
    const [e] = await db.insert(schema.exercises).values({
      userId: null, nom: "Chin assist", pilier: "P2_tirage", profilTension: "stretch",
      type: "polyarticulaire", categorieRole: "pilier", musclesPrincipaux: ["dorsaux"],
      musclesSecondaires: [], equipement: "machine", slug: `chin-assist-${U.slice(0, 8)}`,
    }).returning();
    const [i] = await db.insert(schema.exerciseInstances).values({
      userId: U, exerciseId: e!.id, gymId: salle, machineNom: "Dip/Chin Assist",
      conventionCharge: "pile_affichee", incrementsPossibles: [5],
      chargeMinimale: 0, chargeMax: 60, natureCharge: "assistance",
    }).returning();
    assistance = i!.id;

    const [seance] = await db.insert(schema.sessionLogs).values({
      userId: U, date: "2026-08-12", gymId: salle, dureeMinutes: 45,
    }).returning();
    await db.insert(schema.setLogs).values({
      sessionLogId: seance!.id, exerciseInstanceId: assistance,
      numeroSerie: 1, repsEffectuees: 8, charge: 30, rpeEffectif: 8,
    });
  });

  it("n'entre pas dans le classement des records", async () => {
    // Un record de charge croissante y désignerait la séance où l'on a eu le
    // plus besoin d'aide.
    const records = await recordsPersonnels(U);
    expect(records.map((r) => r.exerciseInstanceId)).not.toContain(assistance);
  });

  it("garde pourtant son historique", async () => {
    const series = await db.query.setLogs.findMany({
      where: eq(schema.setLogs.exerciseInstanceId, assistance),
    });
    expect(series).toHaveLength(1);
    expect(series[0]!.charge).toBe(30);
  });

  it("reste dans le parc du jour", async () => {
    const parc = await chargerParc(U);
    const trouvee = parc.find((i) => i.id === assistance);
    expect(trouvee).toBeDefined();
    expect(trouvee?.charge.natureCharge).toBe("assistance");
  });
});

describe("purge", () => {
  it("efface ce que ce fichier a écrit", async () => {
    const seances = await db.query.sessionLogs.findMany({
      where: eq(schema.sessionLogs.userId, U),
    });
    for (const s of seances) {
      await db.delete(schema.setLogs).where(eq(schema.setLogs.sessionLogId, s.id));
    }
    await db.delete(schema.sessionLogs).where(eq(schema.sessionLogs.userId, U));
    await db.delete(schema.exerciseInstances).where(eq(schema.exerciseInstances.gymId, salle));
    await db.delete(schema.exercises).where(and(eq(schema.exercises.pilier, "P3_squat"), eq(schema.exercises.id, exerciceId)));
    await db.delete(schema.gyms).where(eq(schema.gyms.id, salle));
    await db.delete(schema.users).where(eq(schema.users.id, U));
    expect(true).toBe(true);
  });
});
