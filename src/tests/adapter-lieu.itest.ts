import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Changer de lieu alors que la séance est déjà construite, contre une vraie base.
 *
 * Les six cas demandés : salle → maison, maison → salle, appareil absent avec
 * alternative, matériel apporté qui débloque mieux, aucun remplacement
 * possible, et changement en plein cycle sans casser la semaine.
 *
 * Le moteur est déjà testé unitairement. Ce qui se vérifie ici est ce qu'il ne
 * peut pas voir : que la séance en base est réellement réécrite, que la
 * prescription survit au passage par SQL, et que les trois contrôles tournent.
 */

const U = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({ getAuthenticatedUserId: async () => U }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: U, email: `${U}@t.test` } } }) } }),
}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { and, eq, inArray, asc } = await import("drizzle-orm");
const adapter = await import("@/app/api/seance-du-jour/adapter/route");

const poste = (corps: unknown) =>
  new Request("http://test/api/seance-du-jour/adapter", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corps),
  });

const JOUR = new Date().toISOString().slice(0, 10);

/** Un exercice du catalogue, décrit à la main pour maîtriser le scénario. */
const creerExercice = async (
  nom: string,
  pilier: string,
  equipement: string,
  muscles: string[],
  profilTension = "mi_range",
  categorieRole = "pilier",
) => {
  const [e] = await db
    .insert(schema.exercises)
    .values({
      userId: null,
      nom,
      pilier,
      profilTension,
      type: "polyarticulaire",
      categorieRole,
      musclesPrincipaux: muscles,
      musclesSecondaires: [],
      equipement,
      slug: `${nom.toLowerCase().replace(/[^a-z]/g, "-")}-${U.slice(0, 8)}`,
    })
    .returning();
  return e!;
};

const ids: { exercices: string[]; salles: string[] } = { exercices: [], salles: [] };
let salle = "";
let maison = "";
let sessionLogId = "";
let developpe = "";
let squat = "";
let pompes = "";
let fente = "";
let tirageElastique = "";
let instDeveloppe = "";
let instSquat = "";

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBeTruthy();
  await db.insert(schema.users).values({
    id: U,
    email: `${U}@t.test`,
    nom: "Testeur",
    dureeSeanceCibleMinutes: 90,
  });

  const dev = await creerExercice("Developpe couche", "P1_poussee", "barre", ["pectoraux"]);
  const sq = await creerExercice("Squat barre", "P3_squat", "barre", ["quadriceps"]);
  const po = await creerExercice("Pompes", "P1_poussee", "poids_du_corps", ["pectoraux"]);
  const fe = await creerExercice("Fente bulgare", "P3_squat", "poids_du_corps", ["quadriceps"]);
  const ti = await creerExercice("Tirage elastique", "P2_tirage", "elastiques", ["dorsaux"], "stretch");
  developpe = dev.id; squat = sq.id; pompes = po.id; fente = fe.id; tirageElastique = ti.id;
  ids.exercices = [dev.id, sq.id, po.id, fe.id, ti.id];

  const [s] = await db.insert(schema.gyms).values({
    userId: U, nom: `Salle ${U.slice(0, 8)}`, equipementsDisponibles: ["barre"],
  }).returning();
  const [m] = await db.insert(schema.gyms).values({
    userId: U, nom: `Maison ${U.slice(0, 8)}`, equipementsDisponibles: [],
  }).returning();
  salle = s!.id; maison = m!.id;
  ids.salles = [salle, maison];

  // Les deux exercices à la barre sont décrits comme appareils de la salle.
  const inst = await db.insert(schema.exerciseInstances).values([
    { userId: U, exerciseId: developpe, gymId: salle, machineNom: "Banc", conventionCharge: "poids_total", incrementsPossibles: [2.5] },
    { userId: U, exerciseId: squat, gymId: salle, machineNom: "Rack", conventionCharge: "poids_total", incrementsPossibles: [2.5] },
  ]).returning();
  instDeveloppe = inst[0]!.id; instSquat = inst[1]!.id;
});

afterAll(async () => {
  const seances = await db.query.sessionLogs.findMany({ where: eq(schema.sessionLogs.userId, U) });
  for (const s of seances) {
    await db.delete(schema.setLogs).where(eq(schema.setLogs.sessionLogId, s.id));
    await db.delete(schema.sessionPlanItems).where(eq(schema.sessionPlanItems.sessionLogId, s.id));
  }
  await db.delete(schema.sessionLogs).where(eq(schema.sessionLogs.userId, U));
  await db.delete(schema.dailyStates).where(eq(schema.dailyStates.userId, U));
  for (const g of ids.salles) {
    await db.delete(schema.exerciseInstances).where(eq(schema.exerciseInstances.gymId, g));
    await db.delete(schema.gyms).where(eq(schema.gyms.id, g));
  }
  if (ids.exercices.length) {
    await db.delete(schema.exercises).where(inArray(schema.exercises.id, ids.exercices));
  }
  await db.delete(schema.users).where(eq(schema.users.id, U));
});

/** Reconstruit la séance de départ : développé + squat, à la salle. */
beforeEach(async () => {
  const anciennes = await db.query.sessionLogs.findMany({ where: eq(schema.sessionLogs.userId, U) });
  for (const s of anciennes) {
    await db.delete(schema.sessionPlanItems).where(eq(schema.sessionPlanItems.sessionLogId, s.id));
  }
  await db.delete(schema.sessionLogs).where(eq(schema.sessionLogs.userId, U));
  await db.delete(schema.dailyStates).where(eq(schema.dailyStates.userId, U));
  // Les entrées déduites créées par un test précédent ne doivent pas fausser
  // le suivant : seuls les deux appareils décrits au départ subsistent.
  await db.delete(schema.exerciseInstances).where(
    and(eq(schema.exerciseInstances.userId, U), inArray(schema.exerciseInstances.gymId, [maison])),
  );

  const [s] = await db.insert(schema.sessionLogs).values({
    userId: U, date: JOUR, gymId: salle,
  }).returning();
  sessionLogId = s!.id;

  await db.insert(schema.sessionPlanItems).values([
    { sessionLogId, ordre: 1, exerciseInstanceId: instDeveloppe, seriesCibles: 4, seriesPrevuesAvantAjustement: 4, fourchetteRepsMin: 8, fourchetteRepsMax: 12, rpeCible: 8, reposSecondes: 120, statut: "prevu" },
    { sessionLogId, ordre: 2, exerciseInstanceId: instSquat, seriesCibles: 4, seriesPrevuesAvantAjustement: 4, fourchetteRepsMin: 8, fourchetteRepsMax: 12, rpeCible: 8, reposSecondes: 120, statut: "prevu" },
  ]);

  await db.insert(schema.dailyStates).values({
    userId: U, date: JOUR, gymId: salle, sommeilHeures: 7, energieDepart: 7, courbatures: [],
  });
});

const appeler = async (corps: Record<string, unknown>) => {
  const res = await adapter.POST(poste({ sessionLogId, ...corps }));
  const json = await res.clone().json().catch(() => null);
  return { status: res.status, corps: json as Record<string, never> & Record<string, unknown> };
};

const seanceEnBase = async () =>
  db
    .select({
      ordre: schema.sessionPlanItems.ordre,
      instanceId: schema.sessionPlanItems.exerciseInstanceId,
      series: schema.sessionPlanItems.seriesCibles,
      repsMin: schema.sessionPlanItems.fourchetteRepsMin,
      rpe: schema.sessionPlanItems.rpeCible,
      repos: schema.sessionPlanItems.reposSecondes,
      raison: schema.sessionPlanItems.raisonSubstitution,
      nom: schema.exercises.nom,
    })
    .from(schema.sessionPlanItems)
    .innerJoin(schema.exerciseInstances, eq(schema.exerciseInstances.id, schema.sessionPlanItems.exerciseInstanceId))
    .innerJoin(schema.exercises, eq(schema.exercises.id, schema.exerciseInstances.exerciseId))
    .where(eq(schema.sessionPlanItems.sessionLogId, sessionLogId))
    .orderBy(asc(schema.sessionPlanItems.ordre));

describe("1. salle → maison", () => {
  it("remplace ce qui devient impossible et conserve le reste", async () => {
    const { status, corps } = await appeler({ gymId: maison });
    expect(status, JSON.stringify(corps)).toBe(200);
    expect(corps.applique).toBe(true);

    const apres = await seanceEnBase();
    expect(apres.map((x) => x.nom).sort()).toEqual(["Fente bulgare", "Pompes"]);
    // La prescription survit au changement de lieu.
    for (const x of apres) {
      expect(x.series).toBe(4);
      expect(x.repsMin).toBe(8);
      expect(x.rpe).toBe(8);
      expect(x.repos).toBe(120);
      expect(x.raison).toMatch(/indisponible/);
    }
  });

  it("déplace la séance et retient le matériel du jour", async () => {
    await appeler({ gymId: maison, materielApporte: ["elastiques"] });
    const s = await db.query.sessionLogs.findFirst({ where: eq(schema.sessionLogs.id, sessionLogId) });
    expect(s?.gymId).toBe(maison);
    const etat = await db.query.dailyStates.findFirst({
      where: and(eq(schema.dailyStates.userId, U), eq(schema.dailyStates.date, JOUR)),
    });
    expect(etat?.materielApporte).toEqual(["elastiques"]);
  });

  it("l'aperçu ne modifie rien", async () => {
    const { corps } = await appeler({ gymId: maison, apercu: true });
    expect(corps.applique).toBe(false);
    expect((corps.remplacements as unknown as unknown[]).length).toBeGreaterThan(0);

    const apres = await seanceEnBase();
    expect(apres.map((x) => x.nom).sort()).toEqual(["Developpe couche", "Squat barre"]);
  });
});

describe("2. maison → salle", () => {
  it("retrouve les mouvements à la barre", async () => {
    await appeler({ gymId: maison });
    const { status } = await appeler({ gymId: salle });
    expect(status).toBe(200);

    const apres = await seanceEnBase();
    expect(apres.map((x) => x.nom).sort()).toEqual(["Developpe couche", "Squat barre"]);
    expect(apres.map((x) => x.instanceId).sort()).toEqual([instDeveloppe, instSquat].sort());
  });

  it("ne signale aucun changement quand on revient au même lieu", async () => {
    const { corps } = await appeler({ gymId: salle, apercu: true });
    expect(corps.remplacements).toEqual([]);
    expect(corps.retires).toEqual([]);
    expect(corps.conserves).toBe(2);
  });
});

describe("3. appareil absent, alternative disponible", () => {
  it("garde le pilier et les muscles visés", async () => {
    const { corps } = await appeler({ gymId: maison, apercu: true });
    const remplacements = corps.remplacements as unknown as Array<{ avant: string; apres: string }>;
    const parAvant = new Map(remplacements.map((r) => [r.avant, r.apres]));
    // Poussée reste poussée, squat reste squat.
    expect(parAvant.get("Developpe couche")).toBe("Pompes");
    expect(parAvant.get("Squat barre")).toBe("Fente bulgare");
  });
});

describe("4. matériel apporté qui débloque mieux", () => {
  it("choisit un remplaçant plus fidèle grâce au sac", async () => {
    // Une séance de tirage : sans élastiques, la maison n'offre rien.
    await db.delete(schema.sessionPlanItems).where(eq(schema.sessionPlanItems.sessionLogId, sessionLogId));
    const [instTirage] = await db.insert(schema.exerciseInstances).values({
      userId: U, exerciseId: tirageElastique, gymId: salle,
      machineNom: "Poulie haute", conventionCharge: "pile_affichee", incrementsPossibles: [5],
    }).returning();
    await db.insert(schema.sessionPlanItems).values({
      sessionLogId, ordre: 1, exerciseInstanceId: instTirage!.id, seriesCibles: 3,
      seriesPrevuesAvantAjustement: 3, fourchetteRepsMin: 10, fourchetteRepsMax: 12,
      rpeCible: 8, reposSecondes: 90, statut: "prevu",
    });

    const sansSac = await appeler({ gymId: maison, apercu: true });
    expect((sansSac.corps.retires as unknown as unknown[]).length).toBe(1);

    const avecSac = await appeler({ gymId: maison, materielApporte: ["elastiques"], apercu: true });
    expect(avecSac.corps.retires).toEqual([]);
    const r = (avecSac.corps.remplacements as unknown as Array<{ apres: string }>)[0];
    expect(r?.apres).toBe("Tirage elastique");
  });

  it("matérialise l'entrée manquante seulement au moment de l'appliquer", async () => {
    await db.delete(schema.sessionPlanItems).where(eq(schema.sessionPlanItems.sessionLogId, sessionLogId));
    const [instTirage] = await db.insert(schema.exerciseInstances).values({
      userId: U, exerciseId: tirageElastique, gymId: salle,
      machineNom: "Poulie haute", conventionCharge: "pile_affichee", incrementsPossibles: [5],
    }).returning();
    await db.insert(schema.sessionPlanItems).values({
      sessionLogId, ordre: 1, exerciseInstanceId: instTirage!.id, seriesCibles: 3,
      seriesPrevuesAvantAjustement: 3, fourchetteRepsMin: 10, fourchetteRepsMax: 12,
      rpeCible: 8, reposSecondes: 90, statut: "prevu",
    });

    const avant = await db.$count(schema.exerciseInstances, eq(schema.exerciseInstances.gymId, maison));
    await appeler({ gymId: maison, materielApporte: ["elastiques"], apercu: true });
    expect(await db.$count(schema.exerciseInstances, eq(schema.exerciseInstances.gymId, maison))).toBe(avant);

    await appeler({ gymId: maison, materielApporte: ["elastiques"] });
    const apres = await seanceEnBase();
    expect(apres[0]!.nom).toBe("Tirage elastique");
    const creee = await db.query.exerciseInstances.findFirst({
      where: and(eq(schema.exerciseInstances.gymId, maison), eq(schema.exerciseInstances.exerciseId, tirageElastique)),
    });
    expect(creee?.notesMachine).toMatch(/Déduit du matériel/);
  });
});

describe("5. aucun remplacement possible", () => {
  it("retire, le dit, et conseille de reconstruire", async () => {
    const [vide] = await db.insert(schema.gyms).values({
      userId: U, nom: `Vide ${U.slice(0, 8)}`, equipementsDisponibles: [],
    }).returning();
    ids.salles.push(vide!.id);

    // Un lieu sans rien : seul le poids du corps y est faisable, et les deux
    // exercices au poids du corps existent — on les retire du catalogue visible
    // en les archivant le temps du test.
    await db.update(schema.exercises).set({ equipement: "barre" })
      .where(inArray(schema.exercises.id, [pompes, fente]));

    const { corps } = await appeler({ gymId: vide!.id, apercu: true });
    expect((corps.retires as unknown as unknown[]).length).toBe(2);
    expect(corps.reconstructionConseillee).toBe(true);
    expect(String(corps.motifReconstruction)).toMatch(/sans équivalent ici/);

    await db.update(schema.exercises).set({ equipement: "poids_du_corps" })
      .where(inArray(schema.exercises.id, [pompes, fente]));
  });
});

describe("6. changement en plein cycle", () => {
  it("repasse les trois contrôles et mesure la dérive de volume", async () => {
    const { corps } = await appeler({ gymId: maison, apercu: true });
    const v = corps.validation as unknown as {
      seance: { seriesTotales: number };
      semaine: { anomalies: unknown[] };
      cycle: { phase: string; ecartVolumePct: number; aligne: boolean };
    };
    expect(v.seance).toBeTruthy();
    expect(v.semaine).toBeTruthy();
    expect(v.cycle.phase).toBeTruthy();
    // Volume conservé : huit séries avant, huit après.
    expect(v.cycle.ecartVolumePct).toBe(0);
    expect(v.cycle.aligne).toBe(true);
  });

  it("signale la perte de stimulus quand la séance maigrit", async () => {
    await db.update(schema.exercises).set({ equipement: "barre" })
      .where(eq(schema.exercises.id, fente));

    const { corps } = await appeler({ gymId: maison, apercu: true });
    const v = corps.validation as unknown as { cycle: { ecartVolumePct: number; aligne: boolean; motifs: string[] } };
    // La moitié de la séance disparaît : le cycle doit le dire.
    expect(v.cycle.ecartVolumePct).toBe(-50);
    expect(v.cycle.aligne).toBe(false);
    expect(v.cycle.motifs.join(" ")).toMatch(/perd 50 %/);

    await db.update(schema.exercises).set({ equipement: "poids_du_corps" })
      .where(eq(schema.exercises.id, fente));
  });

  it("refuse d'adapter une séance déjà terminée", async () => {
    await db.update(schema.sessionLogs).set({ dureeMinutes: 60 })
      .where(eq(schema.sessionLogs.id, sessionLogId));
    const { status, corps } = await appeler({ gymId: maison });
    expect(status).toBe(409);
    expect(String(corps.error)).toMatch(/terminée/);
  });
});
