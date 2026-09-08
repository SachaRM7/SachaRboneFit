import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Reprendre une séance substituée quand le brouillon local a DISPARU.
 *
 * LE DÉFAUT FERMÉ
 *
 * La lignée de substitution ne vivait que dans le store Zustand persisté. Cela
 * suffisait à un rafraîchissement — pas à un `localStorage` purgé par Safari
 * sous pression mémoire, ni à une reprise depuis un autre contexte.
 *
 * Or les séries, elles, reviennent bien de Postgres depuis ce lot. La moitié de
 * l'état survivait donc, et pas l'autre : la base rendait S1 sur la machine A,
 * le plan rendait la machine B, et sans lignée serveur B repartait à 0/3. Trois
 * séries prescrites, quatre réalisées — exactement le défaut que la lignée
 * devait fermer.
 *
 * CE QUE CE FICHIER FAIT
 *
 * Il ne teste pas une fonction pure : il rejoue le chemin complet. Séries
 * persistées par la route, substitution persistée par sa route, puis
 * reconstruction de l'état Live À PARTIR DU SERVEUR SEUL — aucun brouillon,
 * aucune mémoire locale.
 */

const SACHA = randomUUID();

let connecte = SACHA;
vi.mock("@/lib/supabase/auth-helper", () => ({
  getAuthenticatedUserId: async () => connecte,
}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { eq } = await import("drizzle-orm");
const series = await import("@/app/api/session-logs/[id]/series/route");
const substituer = await import("@/app/api/seance-du-jour/substituer/route");
const { lirePlan } = await import("@/services/plan-seance");
const { ligneeDe, slotsARemplir, avancementDeLaLignee, avancement } =
  await import("@/lib/live/vue-live");

const AUJOURDHUI = new Date().toISOString().slice(0, 10);

let seance = "";
let salleId = "";
const machines: Record<string, string> = {};
let horloge = 500_000;
const rev = () => (horloge += 1);

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const validerSerie = (exerciseInstanceId: string, numeroSerie: number, charge: number) =>
  series.POST(
    new Request("http://t/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        revision: rev(), exerciseInstanceId, numeroSerie,
        repsEffectuees: 10, charge, rpeEffectif: 8,
      }),
    }),
    params(seance),
  );

const substituerVers = (remplace: string, remplacant: string) =>
  substituer.POST(new Request("http://t/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionLogId: seance,
      remplaceInstanceId: remplace,
      remplacantInstanceId: remplacant,
      raison: "occupee",
    }),
  }));

/**
 * L'état du Live reconstruit DEPUIS LE SERVEUR SEUL.
 *
 * C'est le cœur du test : aucun `active.lignees`, aucun brouillon. Ce que
 * l'écran saurait faire avec un `localStorage` vide.
 */
async function reconstruireDepuisLeServeur() {
  const plan = (await lirePlan(SACHA, seance))!;
  const lignesEnBase = await db.select().from(schema.setLogs)
    .where(eq(schema.setLogs.sessionLogId, seance));

  const setsServeur = lignesEnBase.map((l) => ({
    exerciseInstanceId: l.exerciseInstanceId,
    numeroSerie: l.numeroSerie,
    repsEffectuees: l.repsEffectuees,
    charge: l.charge,
  }));

  // Exactement ce que la page fait à l'hydratation : des lignées d'au moins
  // deux maillons, telles que le plan les porte.
  const lignees = plan.items
    .map((e) => e.lignee ?? [])
    .filter((l) => l.length > 1)
    .map((instances) => ({ origine: instances[0]!, instances }));

  return { plan, setsServeur, lignees };
}

beforeAll(async () => {
  expect(process.env.DATABASE_URL, "base de test requise").toBeTruthy();

  await db.insert(schema.users).values({
    id: SACHA, email: `${SACHA}@t.test`, nom: "Sacha", onboardingTermineLe: new Date(),
  });

  const [salle] = await db.insert(schema.gyms)
    .values({ userId: SACHA, nom: `Salle ${SACHA.slice(0, 6)}` }).returning();
  salleId = salle!.id;

  const [ex] = await db.insert(schema.exercises).values({
    userId: null, nom: "Chest Press", pilier: "P1_poussee", profilTension: "mi_range",
    type: "polyarticulaire", categorieRole: "pilier",
    musclesPrincipaux: ["pectoraux"], musclesSecondaires: [], equipement: "machine",
    slug: `cp-${SACHA.slice(0, 8)}`,
  }).returning();

  // Quatre machines : de quoi éprouver A → B → C → D.
  for (const nom of ["A", "B", "C", "D"]) {
    const [i] = await db.insert(schema.exerciseInstances).values({
      userId: SACHA, exerciseId: ex!.id, gymId: salleId, machineNom: `Chest Press ${nom}`,
      conventionCharge: "pile_affichee",
    }).returning();
    machines[nom] = i!.id;
  }

  const [s] = await db.insert(schema.sessionLogs)
    .values({ userId: SACHA, date: AUJOURDHUI, gymId: salleId }).returning();
  seance = s!.id;

  // Le plan du jour : trois séries sur la machine A.
  await db.insert(schema.sessionPlanItems).values({
    sessionLogId: seance,
    ordre: 1,
    exerciseInstanceId: machines.A!,
    seriesCibles: 3,
    fourchetteRepsMin: 8,
    fourchetteRepsMax: 12,
  });
});

describe("A → B, puis perte totale du brouillon", () => {
  it("S1 est persistée sur A, et la substitution en base", async () => {
    connecte = SACHA;
    expect((await validerSerie(machines.A!, 1, 40)).status).toBe(200);

    const sub = await substituerVers(machines.A!, machines.B!);
    expect(sub.status).toBe(200);

    // Le plan désigne désormais B.
    const plan = (await lirePlan(SACHA, seance))!;
    expect(plan.items[0]!.id).toBe(machines.B);
  });

  it("la lignée survit dans le plan serveur", async () => {
    const plan = (await lirePlan(SACHA, seance))!;
    expect(plan.items[0]!.lignee).toEqual([machines.A, machines.B]);
  });

  it("et l'état Live se reconstruit sans aucun brouillon", async () => {
    /*
     * Le scénario complet : `localStorage` vide, on ne dispose que du plan et
     * des séries. B doit afficher 1/3 et ne demander que S2 et S3.
     */
    const { plan, setsServeur, lignees } = await reconstruireDepuisLeServeur();
    const exercice = plan.items[0]!;

    const lignee = ligneeDe(lignees, exercice.id);
    expect(lignee.instances).toEqual([machines.A, machines.B]);

    expect(avancementDeLaLignee(lignee, setsServeur, exercice.seriesCibles))
      .toEqual({ faites: 1, cibles: 3 });
    expect(slotsARemplir(lignee, setsServeur, exercice.seriesCibles)).toEqual([2, 3]);
  });

  it("la liste de séance affiche 1/3, pas 0/3", async () => {
    // Sans lignée serveur, `avancement` comptait par entrée : B n'ayant rien,
    // l'écran repartait de zéro.
    const { plan, setsServeur, lignees } = await reconstruireDepuisLeServeur();
    const etats = avancement(
      plan.items.map((e) => ({ id: e.id, nom: e.nom, seriesCibles: e.seriesCibles })),
      setsServeur,
      lignees,
    );
    expect(etats[0]).toMatchObject({ faites: 1, cibles: 3, statut: "en_cours" });
  });

  it("et S1 reste attachée à A — l'historique dit la vérité", async () => {
    const lignes = await db.select().from(schema.setLogs)
      .where(eq(schema.setLogs.sessionLogId, seance));
    expect(lignes).toHaveLength(1);
    expect(lignes[0]!.exerciseInstanceId).toBe(machines.A);
  });
});

describe("A → B → C : aucune machine intermédiaire n'est perdue", () => {
  it("S2 sur B, puis substitution vers C", async () => {
    connecte = SACHA;
    expect((await validerSerie(machines.B!, 2, 45)).status).toBe(200);
    expect((await substituerVers(machines.B!, machines.C!)).status).toBe(200);
  });

  it("la lignée porte les TROIS machines", async () => {
    /*
     * C'est ici que les deux colonnes historiques ne suffisent pas :
     * `substitutionDeInstanceId` vaut B, `exerciseInstancePrevuId` vaut A — et
     * personne ne nomme plus B… qui porte pourtant S2.
     */
    const plan = (await lirePlan(SACHA, seance))!;
    expect(plan.items[0]!.lignee).toEqual([machines.A, machines.B, machines.C]);
  });

  it("après perte du brouillon, C affiche 2/3 et ne demande que S3", async () => {
    const { plan, setsServeur, lignees } = await reconstruireDepuisLeServeur();
    const exercice = plan.items[0]!;
    expect(exercice.id).toBe(machines.C);

    const lignee = ligneeDe(lignees, exercice.id);
    expect(avancementDeLaLignee(lignee, setsServeur, exercice.seriesCibles))
      .toEqual({ faites: 2, cibles: 3 });
    expect(slotsARemplir(lignee, setsServeur, exercice.seriesCibles)).toEqual([3]);
  });

  it("et l'historique réel reste A:S1, B:S2", async () => {
    const lignes = await db.select().from(schema.setLogs)
      .where(eq(schema.setLogs.sessionLogId, seance));
    const parInstance = Object.fromEntries(
      lignes.map((l) => [l.exerciseInstanceId, l.numeroSerie]),
    );
    expect(parInstance[machines.A!]).toBe(1);
    expect(parInstance[machines.B!]).toBe(2);
    expect(lignes).toHaveLength(2);
  });
});

describe("A → B → C → D : la chaîne tient sur quatre maillons", () => {
  it("aucun intermédiaire ne disparaît", async () => {
    connecte = SACHA;
    expect((await substituerVers(machines.C!, machines.D!)).status).toBe(200);

    const plan = (await lirePlan(SACHA, seance))!;
    expect(plan.items[0]!.lignee)
      .toEqual([machines.A, machines.B, machines.C, machines.D]);
  });

  it("et D ne demande toujours que la série qui reste", async () => {
    const { plan, setsServeur, lignees } = await reconstruireDepuisLeServeur();
    const exercice = plan.items[0]!;
    const lignee = ligneeDe(lignees, exercice.id);

    expect(slotsARemplir(lignee, setsServeur, exercice.seriesCibles)).toEqual([3]);
    expect(avancementDeLaLignee(lignee, setsServeur, exercice.seriesCibles).faites).toBe(2);
  });

  it("la dernière série se fait sur D, et le total reste de trois", async () => {
    connecte = SACHA;
    expect((await validerSerie(machines.D!, 3, 50)).status).toBe(200);

    const lignes = await db.select().from(schema.setLogs)
      .where(eq(schema.setLogs.sessionLogId, seance));
    expect(lignes, "quatre séries pour trois prescrites").toHaveLength(3);

    const { plan, setsServeur, lignees } = await reconstruireDepuisLeServeur();
    const lignee = ligneeDe(lignees, plan.items[0]!.id);
    expect(slotsARemplir(lignee, setsServeur, 3)).toEqual([]);
    expect(avancementDeLaLignee(lignee, setsServeur, 3)).toEqual({ faites: 3, cibles: 3 });
  });

  it("et chaque série est restée sur la machine qui l'a portée", async () => {
    // Trois machines différentes pour trois séries : l'historique final dit
    // exactement ce qui s'est passé.
    const lignes = await db.select().from(schema.setLogs)
      .where(eq(schema.setLogs.sessionLogId, seance));
    const paires = lignes
      .map((l) => `${l.numeroSerie}:${l.exerciseInstanceId}`)
      .sort();
    expect(paires).toEqual([
      `1:${machines.A}`, `2:${machines.B}`, `3:${machines.D}`,
    ].sort());
  });
});
