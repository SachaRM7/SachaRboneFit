import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Deux comptes, une seule salle.
 *
 * La règle posée : les salles, les machines et les exercices sont communs —
 * ce sont des objets et des mouvements, pas des personnes. Tout ce qui décrit
 * quelqu'un — séances, séries, charges, contraintes, mémoire du coach — reste
 * strictement à lui.
 *
 * Cette suite vérifie les deux moitiés de cette phrase en même temps, parce
 * qu'elles se contredisent facilement : filtrer par propriétaire pour protéger
 * l'historique avait fini par cacher aussi le parc, obligeant le deuxième
 * compte à re-saisir des machines déjà renseignées.
 */

const A = randomUUID();
const B = randomUUID();
// `randomUUID()` a un type littéral : sans annotation, la réaffectation est refusée.
let courant: string = A;

vi.mock("@/lib/supabase/auth-helper", () => ({
  getAuthenticatedUserId: async () => courant,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: courant, email: `${courant}@exemple.test` } } }) },
  }),
}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { eq, inArray } = await import("drizzle-orm");
const { CATALOGUE } = await import("@/lib/referentiels/catalogue");
const { ORDRE_PILIERS } = await import("@/lib/engine/plan-calibration");
const dashboard = await import("@/app/api/dashboard/route");
const instances = await import("@/app/api/exercise-instances/route");
const calibration = await import("@/app/api/programme/calibration/route");

const poste = (corps: unknown) =>
  new Request("http://test/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corps),
  });

const EXOS = ORDRE_PILIERS.map(
  (p) => CATALOGUE.find((e) => e.pilier === p && e.categorieRole === "pilier") ?? CATALOGUE.find((e) => e.pilier === p),
).filter((e): e is (typeof CATALOGUE)[number] => Boolean(e));

let idsExercices: string[] = [];
let salleId = "";
const machinesDeA: string[] = [];

const enTantQue = async <T>(qui: string, action: () => Promise<T>): Promise<T> => {
  const avant = courant;
  courant = qui;
  try {
    return await action();
  } finally {
    courant = avant;
  }
};

const etat = async (qui: string) =>
  enTantQue(qui, async () => {
    const res = await dashboard.GET();
    expect(res.status, await res.clone().text()).toBe(200);
    return (await res.json()).etat;
  });

beforeAll(async () => {
  expect(process.env.DATABASE_URL, "DATABASE_URL doit viser une base jetable").toBeTruthy();

  await db.insert(schema.users).values([
    { id: A, email: `a-${A.slice(0, 8)}@exemple.test`, nom: "Compte A", frequenceCibleParSemaine: 3 },
    { id: B, email: `b-${B.slice(0, 8)}@exemple.test`, nom: "Compte B", frequenceCibleParSemaine: 3 },
  ]);

  const crees = await db
    .insert(schema.exercises)
    .values(
      EXOS.map((e) => ({
        userId: null,
        nom: e.nom,
        pilier: e.pilier,
        profilTension: e.profilTension,
        type: e.type,
        categorieRole: e.categorieRole,
        musclesPrincipaux: e.musclesPrincipaux,
        musclesSecondaires: e.musclesSecondaires,
        equipement: e.equipement,
        slug: `${e.slug}-${A.slice(0, 8)}`,
      })),
    )
    .returning();
  idsExercices = crees.map((e) => e.id);

  // La salle est saisie par A. B ira à la même.
  const [salle] = await db
    .insert(schema.gyms)
    .values({ userId: A, nom: `Salle commune ${A.slice(0, 8)}` })
    .returning();
  salleId = salle!.id;

  await db
    .update(schema.users)
    .set({ prefSalleParDefautId: salleId, onboardingTermineLe: new Date() })
    .where(inArray(schema.users.id, [A, B]));

  for (const uid of [A, B]) {
    await db.insert(schema.programmeBlocs).values({
      userId: uid,
      nom: "Calibration",
      dateDebut: new Date().toISOString().slice(0, 10),
      typeCycle: "calibration",
      semaineActuelle: 1,
      actif: true,
    });
  }
});

afterAll(async () => {
  const blocs = await db.query.programmeBlocs.findMany({
    where: inArray(schema.programmeBlocs.userId, [A, B]),
  });
  for (const b of blocs) {
    const gabarits = await db.query.seanceTemplates.findMany({
      where: eq(schema.seanceTemplates.blocId, b.id),
    });
    for (const g of gabarits) {
      await db.delete(schema.exerciseInTemplate).where(eq(schema.exerciseInTemplate.seanceTemplateId, g.id));
    }
    await db.delete(schema.seanceTemplates).where(eq(schema.seanceTemplates.blocId, b.id));
  }
  await db.delete(schema.programmeBlocs).where(inArray(schema.programmeBlocs.userId, [A, B]));
  await db.delete(schema.exerciseInstances).where(inArray(schema.exerciseInstances.userId, [A, B]));
  if (salleId) await db.delete(schema.gyms).where(eq(schema.gyms.id, salleId));
  if (idsExercices.length) {
    await db.delete(schema.exercises).where(inArray(schema.exercises.id, idsExercices));
  }
  await db.delete(schema.users).where(inArray(schema.users.id, [A, B]));
});

describe("deux comptes dans la même salle", () => {
  it("A équipe la salle", async () => {
    await enTantQue(A, async () => {
      for (const exerciseId of idsExercices) {
        const res = await instances.POST(
          poste({
            exerciseId,
            gymId: salleId,
            machineNom: "Machine commune",
            conventionCharge: "poids_total",
            incrementsPossibles: [2.5, 5],
          }),
        );
        expect(res.status, await res.clone().text()).toBe(201);
        machinesDeA.push((await res.json()).id);
      }
    });
    expect(machinesDeA).toHaveLength(ORDRE_PILIERS.length);
  });

  it("B voit le parc saisi par A, sans rien re-saisir", async () => {
    // Le cœur de la demande : le deuxième compte ne recommence pas le travail.
    const vues = await enTantQue(B, async () => {
      const res = await instances.GET(new Request(`http://test/api/exercise-instances?gymId=${salleId}`));
      expect(res.status).toBe(200);
      return (await res.json()) as Array<{ id: string }>;
    });
    expect(vues.map((m) => m.id).sort()).toEqual([...machinesDeA].sort());
  });

  it("l'accueil de B ne le renvoie pas équiper une salle déjà équipée", async () => {
    // Avant, le compteur filtrait par propriétaire : B tombait sur « salle_vide »
    // devant une salle pleine.
    expect((await etat(B)).etat).toBe("calibration");
  });

  it("B construit sa calibration sur les machines de A", async () => {
    const res = await enTantQue(B, () => calibration.POST(poste({})));
    expect(res.status, await res.clone().text()).toBe(201);
    const corps = await res.json();
    expect(corps.piliersNonCouverts).toEqual([]);

    const lignes = await db.query.exerciseInTemplate.findMany({
      where: inArray(
        schema.exerciseInTemplate.seanceTemplateId,
        corps.seances.map((s: { id: string }) => s.id),
      ),
    });
    expect(lignes.length).toBeGreaterThan(0);
    for (const l of lignes) expect(machinesDeA).toContain(l.exerciseInstanceId);
  });

  it("mais le programme de B lui appartient : A ne le voit pas", async () => {
    const [etatA, etatB] = [await etat(A), await etat(B)];
    // B a des séances, A n'en a aucune : le parc est commun, pas la programmation.
    expect(etatB.seance).not.toBeNull();
    expect(etatA.seance).toBeNull();
    expect(etatA.etat).toBe("calibration");
  });

  it("les séances de A restent invisibles à B", async () => {
    await db.insert(schema.sessionLogs).values({
      userId: A,
      date: new Date().toISOString().slice(0, 10),
      gymId: salleId,
      dureeMinutes: 50,
    });

    // A s'est entraîné aujourd'hui, B non : chacun son compte.
    expect((await etat(A)).etat).toBe("deja_entraine");
    expect((await etat(B)).etat).not.toBe("deja_entraine");

    await db.delete(schema.sessionLogs).where(eq(schema.sessionLogs.userId, A));
  });

  it("B ne peut ni modifier ni retirer un exercice de la salle de A", async () => {
    // Lecture commune, écriture au responsable : tenir un parc à jour est un
    // travail de terrain, il a un auteur.
    const { PATCH, DELETE } = await import("@/app/api/exercise-instances/[id]/route");
    const cible = machinesDeA[0]!;
    const params = { params: Promise.resolve({ id: cible }) };

    const modif = await enTantQue(B, () => PATCH(poste({ incrementsPossibles: [1.25] }), params));
    expect(modif.status).toBe(403);

    const suppr = await enTantQue(B, () => DELETE(poste({}), params));
    expect(suppr.status).toBe(403);

    const relue = await db.query.exerciseInstances.findFirst({
      where: eq(schema.exerciseInstances.id, cible),
    });
    expect(relue, "l'entrée doit avoir survécu aux deux refus").toBeTruthy();
    expect(relue!.incrementsPossibles).toEqual([2.5, 5]);
  });

  it("B ne peut pas non plus ajouter un exercice à la salle de A", async () => {
    const res = await enTantQue(B, () =>
      instances.POST(
        poste({
          exerciseId: idsExercices[0],
          gymId: salleId,
          machineNom: "Ajout non autorisé",
          conventionCharge: "poids_total",
          incrementsPossibles: [5],
        }),
      ),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/consulter/);
  });

  it("A, lui, corrige ce qu'il a saisi", async () => {
    // Si Basic-Fit change la pile d'un appareil, le responsable met à jour.
    const { PATCH } = await import("@/app/api/exercise-instances/[id]/route");
    const cible = machinesDeA[0]!;
    const res = await enTantQue(A, () =>
      PATCH(poste({ incrementsPossibles: [1.25] }), { params: Promise.resolve({ id: cible }) }),
    );
    expect(res.status, await res.clone().text()).toBe(200);

    const relue = await db.query.exerciseInstances.findFirst({
      where: eq(schema.exerciseInstances.id, cible),
    });
    expect(relue?.incrementsPossibles).toEqual([1.25]);
    expect(relue?.userId).toBe(A);
  });

  it("un exercice sans appareil se déclare sans nom sur place", async () => {
    // « Machine » était une vulgarisation : une barre de traction n'a pas de nom
    // d'appareil, et l'exiger rendait l'exercice impossible à déclarer.
    const [libre] = await db
      .insert(schema.exercises)
      .values({
        userId: null,
        nom: "Traction à la barre",
        pilier: "P2_tirage",
        profilTension: "stretch",
        type: "polyarticulaire",
        categorieRole: "pilier",
        musclesPrincipaux: ["dorsaux"],
        musclesSecondaires: ["biceps"],
        equipement: "poids_du_corps",
        slug: `traction-${A.slice(0, 8)}`,
      })
      .returning();
    idsExercices.push(libre!.id);
    const exerciceLibre = libre!.id;

    const res = await enTantQue(A, () =>
      instances.POST(
        poste({
          exerciseId: exerciceLibre,
          gymId: salleId,
          conventionCharge: "poids_total",
          incrementsPossibles: [2.5],
        }),
      ),
    );
    expect(res.status, await res.clone().text()).toBe(201);

    const creee = await res.json();
    const exercice = await db.query.exercises.findFirst({
      where: eq(schema.exercises.id, exerciceLibre),
    });
    // Faute de nom sur place, celui de l'exercice fait l'affaire.
    expect(creee.machineNom).toBe(exercice!.nom);
  });
});
