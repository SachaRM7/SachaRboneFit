import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Ce qui a été fait doit être enregistré sous ce qui a été fait.
 *
 * Le 6 septembre, `Cable Crunch` était prescrit. L'utilisateur l'a trouvé trop
 * compliqué et gênant à faire devant tout le monde, et a fait à la place deux
 * séries de huit à 27 kg sur l'`Abdominal Crunch Machine`. Aucun bouton ne
 * permettait de le dire : il a saisi ses séries dans la carte du Cable Crunch.
 *
 * La base croit donc qu'un Cable Crunch se fait à 27 kg × 8. Ce n'est pas une
 * imprécision — c'est une baseline fausse sur un exercice jamais réalisé, et
 * elle servira à prescrire la prochaine fois.
 *
 * Ce fichier tient les quatre propriétés qui rendent ce scénario impossible :
 * le plan bascule, les séries suivent, les historiques restent séparés, et la
 * charge de l'un ne se transporte pas sur l'autre.
 */

const U = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({
  getAuthenticatedUserId: async () => U,
  requireAuthenticatedUserId: async () => ({ userId: U, error: null }),
}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { and, eq } = await import("drizzle-orm");
const substituer = await import("@/app/api/seance-du-jour/substituer/route");

let salle = "";
let session = "";
let cableCrunch = "";
let abdoMachine = "";
let exerciceCable = "";
let planItem = "";

const appel = (corps: unknown) =>
  substituer.POST(new Request("http://t/", { method: "POST", body: JSON.stringify(corps) }));

beforeAll(async () => {
  await db.insert(schema.users).values({
    id: U, email: `${U}@t.test`, nom: "Terrain", onboardingTermineLe: new Date(),
  });

  const [g] = await db.insert(schema.gyms).values({
    userId: U, nom: `St-Martin ${U.slice(0, 6)}`, equipementsDisponibles: [],
  }).returning();
  salle = g!.id;

  const creerInstance = async (nom: string, machine: string) => {
    const [e] = await db.insert(schema.exercises).values({
      userId: null, nom, pilier: "tronc", profilTension: "mi_range",
      type: "isolation", categorieRole: "accessoire", musclesPrincipaux: ["abdominaux"],
      musclesSecondaires: [], equipement: "machine",
      slug: `${nom.toLowerCase().replace(/\W+/g, "-")}-${U.slice(0, 8)}`,
    }).returning();
    const [i] = await db.insert(schema.exerciseInstances).values({
      userId: U, exerciseId: e!.id, gymId: salle, machineNom: machine,
      conventionCharge: "pile_affichee", incrementsPossibles: [5], etat: "disponible",
    }).returning();
    return { exerciceId: e!.id, instanceId: i!.id };
  };

  const cable = await creerInstance("Cable Crunch", "Poulie haute");
  const abdo = await creerInstance("Abdominal Crunch", "Abdominal Crunch Machine");
  cableCrunch = cable.instanceId;
  exerciceCable = cable.exerciceId;
  abdoMachine = abdo.instanceId;

  const [seance] = await db.insert(schema.sessionLogs).values({
    userId: U, gymId: salle, date: "2026-09-06",
  }).returning();
  session = seance!.id;

  const [item] = await db.insert(schema.sessionPlanItems).values({
    sessionLogId: session, ordre: 6, exerciseInstanceId: cableCrunch,
    seriesCibles: 2, fourchetteRepsMin: 8, fourchetteRepsMax: 12,
    // Ce que la double progression avait proposé sur le Cable Crunch.
    chargeSuggeree: 15, repsSuggerees: [9, 8], messageProgression: "Première fois",
  }).returning();
  planItem = item!.id;
});

describe("le plan bascule vraiment", () => {
  it("l'exercice réalisé devient celui qu'on a fait", async () => {
    const res = await appel({
      sessionLogId: session,
      remplaceInstanceId: cableCrunch,
      remplacantInstanceId: abdoMachine,
      raison: "trop_complique",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).planMisAJour).toBe(true);

    const item = await db.query.sessionPlanItems.findFirst({
      where: eq(schema.sessionPlanItems.id, planItem),
    });
    expect(item?.exerciseInstanceId).toBe(abdoMachine);
  });

  it("ce qui était prévu reste lisible", async () => {
    // Sans ça, la progression conclurait à une absence inexpliquée : un
    // exercice remplacé n'a pas été raté, il n'a pas été proposé.
    const item = await db.query.sessionPlanItems.findFirst({
      where: eq(schema.sessionPlanItems.id, planItem),
    });
    expect(item?.exerciseInstancePrevuId).toBe(cableCrunch);
    expect(item?.substitutionDeInstanceId).toBe(cableCrunch);
    expect(item?.raisonSubstitution).toBe("trop_complique");
  });

  it("la charge de l'ancienne machine ne suit pas", async () => {
    // Deux machines ne se valent pas parce qu'elles visent le même muscle.
    // Reprendre les 15 kg du Cable Crunch afficherait sur l'Abdominal Crunch
    // un repère que l'utilisateur n'y a jamais produit.
    const item = await db.query.sessionPlanItems.findFirst({
      where: eq(schema.sessionPlanItems.id, planItem),
    });
    expect(item?.chargeSuggeree).toBeNull();
    expect(item?.repsSuggerees).toBeNull();
  });
});

describe("les séries appartiennent à ce qui a été fait", () => {
  it("27 kg × 8 se rangent sous l'Abdominal Crunch, jamais sous le Cable Crunch", async () => {
    await db.insert(schema.setLogs).values([
      { sessionLogId: session, exerciseInstanceId: abdoMachine, numeroSerie: 1, repsEffectuees: 8, charge: 27 },
      { sessionLogId: session, exerciseInstanceId: abdoMachine, numeroSerie: 2, repsEffectuees: 8, charge: 27 },
    ]);

    const surCable = await db.query.setLogs.findMany({
      where: eq(schema.setLogs.exerciseInstanceId, cableCrunch),
    });
    const surAbdo = await db.query.setLogs.findMany({
      where: eq(schema.setLogs.exerciseInstanceId, abdoMachine),
    });

    expect(surCable, "le Cable Crunch n'a jamais été réalisé").toEqual([]);
    expect(surAbdo).toHaveLength(2);
    expect(surAbdo.every((s) => s.charge === 27)).toBe(true);
  });
});

describe("éviter à l'avenir est un second geste", () => {
  it("un remplacement seul ne bannit rien", async () => {
    const profil = await db.query.users.findFirst({
      where: eq(schema.users.id, U), columns: { exercicesRefuses: true },
    });
    // La machine était prise un mardi soir : ce n'est pas une raison de
    // supprimer le mouvement du programme.
    expect(profil?.exercicesRefuses ?? []).not.toContain(exerciceCable);
  });

  it("coché, il ajoute l'exercice aux refus du profil", async () => {
    const res = await appel({
      sessionLogId: session,
      remplaceInstanceId: abdoMachine,
      remplacantInstanceId: cableCrunch,
      raison: "genant_en_public",
      eviterAlAvenir: true,
    });
    expect(res.status).toBe(200);

    const profil = await db.query.users.findFirst({
      where: eq(schema.users.id, U), columns: { exercicesRefuses: true },
    });
    const abdoExerciceId = (await db.query.exerciseInstances.findFirst({
      where: eq(schema.exerciseInstances.id, abdoMachine), columns: { exerciseId: true },
    }))?.exerciseId;
    expect(profil?.exercicesRefuses ?? []).toContain(abdoExerciceId);
  });
});

describe("ce que la route refuse", () => {
  it("une séance qui n'est pas la sienne", async () => {
    const autre = randomUUID();
    await db.insert(schema.users).values({ id: autre, email: `${autre}@t.test`, nom: "Autre" });
    const [sienne] = await db.insert(schema.sessionLogs).values({
      userId: autre, gymId: salle, date: "2026-09-06",
    }).returning();

    const res = await appel({
      sessionLogId: sienne!.id,
      remplaceInstanceId: cableCrunch,
      remplacantInstanceId: abdoMachine,
      raison: "occupee",
    });
    expect(res.status).toBe(404);
  });

  it("une machine d'une autre salle", async () => {
    const [ailleurs] = await db.insert(schema.gyms).values({
      userId: U, nom: `Ailleurs ${U.slice(0, 6)}`, equipementsDisponibles: [],
    }).returning();
    const [e] = await db.insert(schema.exercises).values({
      userId: null, nom: "Crunch ailleurs", pilier: "tronc", profilTension: "mi_range",
      type: "isolation", categorieRole: "accessoire", musclesPrincipaux: ["abdominaux"],
      musclesSecondaires: [], equipement: "machine", slug: `ailleurs-${U.slice(0, 8)}`,
    }).returning();
    const [loin] = await db.insert(schema.exerciseInstances).values({
      userId: U, exerciseId: e!.id, gymId: ailleurs!.id, machineNom: "Loin",
      conventionCharge: "pile_affichee", incrementsPossibles: [5], etat: "disponible",
    }).returning();

    const res = await appel({
      sessionLogId: session,
      remplaceInstanceId: cableCrunch,
      remplacantInstanceId: loin!.id,
      raison: "occupee",
    });
    expect(res.status).toBe(400);
  });

  it("se remplacer par soi-même", async () => {
    const res = await appel({
      sessionLogId: session,
      remplaceInstanceId: cableCrunch,
      remplacantInstanceId: cableCrunch,
      raison: "occupee",
    });
    expect(res.status).toBe(400);
  });
});
