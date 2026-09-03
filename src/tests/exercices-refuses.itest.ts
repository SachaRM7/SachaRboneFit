import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Un refus tient au-delà de la calibration.
 *
 * `users.exercices_refuses` n'était lu que par le constructeur du plan de
 * CALIBRATION. Une fois le bloc de calibration terminé, plus rien ne le
 * consultait : ni la séance du jour, ni la résolution de salle. L'exercice
 * refusé à l'inscription disparaissait donc des premières séances, puis
 * revenait sans explication — et pouvait même être choisi comme REMPLAÇANT
 * d'un autre exercice.
 *
 * Un refus qui ne tient qu'un cycle n'est pas un refus. Ce test le vérifie là
 * où ça compte : dans une séance ordinaire, hors calibration.
 */

const U = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({ getAuthenticatedUserId: async () => U }));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { eq } = await import("drizzle-orm");
const { construireSeanceDuJour } = await import("@/services/plan-seance");

const AUJOURDHUI = new Date().toISOString().slice(0, 10);

let salle = "";
let gabarit = "";
let exerciceRefuse = "";
let instanceRefusee = "";
let instanceAcceptee = "";

/** Deux exercices du MÊME pilier : le refusé est un remplaçant plausible. */
async function creerExercice(nom: string, slug: string) {
  const [e] = await db.insert(schema.exercises).values({
    userId: null, nom, pilier: "P1_poussee", profilTension: "mi_range",
    type: "polyarticulaire", categorieRole: "pilier",
    musclesPrincipaux: ["pectoraux"], musclesSecondaires: [], equipement: "machine",
    slug: `${slug}-${U.slice(0, 8)}`,
  }).returning();
  const [i] = await db.insert(schema.exerciseInstances).values({
    userId: U, exerciseId: e!.id, gymId: salle, machineNom: `Poste ${nom}`,
    conventionCharge: "poids_total", incrementsPossibles: [2.5],
  }).returning();
  return { exerciceId: e!.id, instanceId: i!.id };
}

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBeTruthy();

  await db.insert(schema.users).values({
    id: U, email: `${U}@t.test`, nom: "Testeur", onboardingTermineLe: new Date(),
    dureeSeanceCibleMinutes: 60, dureeSeanceMaxMinutes: 90,
  });
  const [g] = await db.insert(schema.gyms)
    .values({ userId: U, nom: `Salle ${U.slice(0, 6)}` }).returning();
  salle = g!.id;

  const refuse = await creerExercice("Développé décliné", "decline");
  exerciceRefuse = refuse.exerciceId;
  instanceRefusee = refuse.instanceId;
  const accepte = await creerExercice("Développé couché", "couche");
  instanceAcceptee = accepte.instanceId;

  // Un bloc ORDINAIRE — pas de calibration : c'est le chemin qui ne lisait
  // plus les refus.
  const [bloc] = await db.insert(schema.programmeBlocs).values({
    userId: U, nom: "Volume", dateDebut: AUJOURDHUI, typeCycle: "volume",
    semaineActuelle: 1, actif: true,
  }).returning();
  const [t] = await db.insert(schema.seanceTemplates).values({
    blocId: bloc!.id, lettre: "A", nom: "Haut du corps", ordreDansSemaine: 1,
  }).returning();
  gabarit = t!.id;

  // Le gabarit prescrit l'exercice qui sera refusé.
  await db.insert(schema.exerciseInTemplate).values({
    seanceTemplateId: gabarit, exerciseInstanceId: instanceRefusee, ordre: 1,
    seriesCibles: 3, fourchetteRepsMin: 8, fourchetteRepsMax: 10, reposSecondes: 120,
  });
});

/** Ferme la séance ouverte : chaque scénario repart d'une page blanche. */
async function nettoyerSeances() {
  const seances = await db.query.sessionLogs.findMany({
    where: eq(schema.sessionLogs.userId, U),
  });
  for (const s of seances) {
    await db.delete(schema.setLogs).where(eq(schema.setLogs.sessionLogId, s.id));
    await db.delete(schema.sessionPlanItems)
      .where(eq(schema.sessionPlanItems.sessionLogId, s.id));
    await db.delete(schema.sessionLogs).where(eq(schema.sessionLogs.id, s.id));
  }
}

describe("un exercice refusé, dans une séance ordinaire", () => {
  it("est proposé tant que rien n'est refusé", async () => {
    // Le contrôle négatif d'abord : sans refus, l'exercice est bien là. Sans
    // lui, un test qui ne rendrait JAMAIS cet exercice passerait aussi.
    await nettoyerSeances();
    await db.update(schema.users).set({ exercicesRefuses: [] })
      .where(eq(schema.users.id, U));

    const plan = await construireSeanceDuJour({
      userId: U, seanceTemplateId: gabarit, gymId: salle, date: AUJOURDHUI,
    });
    expect(plan.items.map((i) => i.exerciseInstanceId)).toContain(instanceRefusee);
  });

  it("n'est plus proposé une fois refusé", async () => {
    await nettoyerSeances();
    await db.update(schema.users).set({ exercicesRefuses: [exerciceRefuse] })
      .where(eq(schema.users.id, U));

    const plan = await construireSeanceDuJour({
      userId: U, seanceTemplateId: gabarit, gymId: salle, date: AUJOURDHUI,
    });
    expect(plan.items.map((i) => i.exerciseInstanceId)).not.toContain(instanceRefusee);
  });

  it("n'est pas non plus choisi comme remplaçant", async () => {
    // Le cas qu'on ne voit pas venir : l'exercice refusé et l'exercice prévu
    // partagent pilier et profil, donc le refusé est un remplaçant idéal.
    // Écarter le prévu sans écarter le refusé le ferait revenir par la porte
    // de service.
    await nettoyerSeances();
    const plan = await construireSeanceDuJour({
      userId: U, seanceTemplateId: gabarit, gymId: salle, date: AUJOURDHUI,
    });
    for (const item of plan.items) {
      expect(item.exerciseInstanceId).not.toBe(instanceRefusee);
      expect(item.exerciseInstancePrevuId).not.toBe(instanceRefusee);
    }
  });

  it("laisse les autres exercices tranquilles", async () => {
    await nettoyerSeances();
    await db.update(schema.users).set({ exercicesRefuses: [exerciceRefuse] })
      .where(eq(schema.users.id, U));

    // L'exercice accepté existe toujours dans le parc : refuser l'un ne doit
    // pas vider la salle.
    const parc = await db.query.exerciseInstances.findMany({
      where: eq(schema.exerciseInstances.gymId, salle),
    });
    expect(parc.map((i) => i.id)).toContain(instanceAcceptee);
  });
});
