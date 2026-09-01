import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Une salle dont l'inventaire est déclaré complet ne fabrique plus d'appareil.
 *
 * Le défaut s'est vu sur un vrai téléphone, à Basic-Fit Saint-Martin-du-Touch :
 * un écran demandant de cocher « Barre, Haltères, Poulie… » pour une salle
 * qu'on venait d'inventorier appareil par appareil, puis une séance composée
 * de machines que personne n'avait vues. Deux voies menaient à la faisabilité
 * — un appareil décrit, une famille cochée — et la seconde matérialisait
 * ensuite ses déductions en vraies lignes `exercise_instances`.
 *
 * Ce que ce fichier vérifie tient en une phrase : ce qui n'est pas décrit dans
 * une salle complète n'y est pas, et rien ne le crée en douce. La vérification
 * porte sur la BASE — c'est là que les appareils fantômes apparaissaient, pas
 * en mémoire.
 */

const U = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({ getAuthenticatedUserId: async () => U }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: U, email: `${U}@t.test` } } }) },
  }),
}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { eq, and } = await import("drizzle-orm");
const { exercicesRealisables, statutInventaire } = await import("@/lib/engine/disponibilite");
const calibration = await import("@/app/api/programme/calibration/route");

let salle = "";
let exoPoulie = "";
let exoPresse = "";
let exoPompe = "";
let instancePresse = "";

/** Les exercices du catalogue vus par le moteur, pour cette salle. */
async function catalogue() {
  const fiches = await db.query.exercises.findMany({
    where: (e, { inArray }) => inArray(e.id, [exoPoulie, exoPresse, exoPompe]),
  });
  return fiches.map((e) => ({
    id: e.id, nom: e.nom, pilier: e.pilier, categorieRole: e.categorieRole,
    musclesPrincipaux: e.musclesPrincipaux ?? [], equipement: e.equipement, slug: e.slug,
  }));
}

async function faisables(statut: "inconnu" | "partiel" | "complet") {
  const instances = await db.query.exerciseInstances.findMany({
    where: and(eq(schema.exerciseInstances.gymId, salle)),
  });
  return exercicesRealisables({
    catalogue: await catalogue(),
    equipementsDuLieu: ["poulie", "leg_press"],
    statut,
    instances: instances.map((i) => ({
      id: i.id, exerciseId: i.exerciseId, machineNom: i.machineNom,
      incrementsPossibles: i.incrementsPossibles ?? [],
    })),
  }).map((r) => r.exerciceId);
}

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBeTruthy();

  await db.insert(schema.users).values({
    id: U, email: `${U}@t.test`, nom: "Testeur", onboardingTermineLe: new Date(),
    dureeSeanceCibleMinutes: 60, frequenceCibleParSemaine: 3,
  });

  // La poulie est COCHÉE dans le matériel du lieu, et pourtant aucune poulie
  // n'est décrite : c'est exactement la configuration observée sur le terrain.
  const [g] = await db.insert(schema.gyms).values({
    userId: U, nom: `Salle ${U.slice(0, 8)}`,
    equipementsDisponibles: ["poulie", "leg_press"],
  }).returning();
  salle = g!.id;

  const fiches: Array<[string, string, string, string, string[]]> = [
    ["poulie", "Tirage bras tendus", "P2_tirage", "poulie", ["dorsaux"]],
    ["presse", "Presse à cuisses", "P3_squat", "machine", ["quadriceps"]],
    ["pompe", "Pompes", "P1_poussee", "poids_du_corps", ["pectoraux"]],
  ];
  const ids: Record<string, string> = {};
  for (const [cle, nom, pilier, equipement, muscles] of fiches) {
    const [e] = await db.insert(schema.exercises).values({
      userId: null, nom, pilier, profilTension: "mi_range", type: "polyarticulaire",
      categorieRole: cle === "presse" ? "pilier" : "accessoire",
      musclesPrincipaux: muscles, musclesSecondaires: [], equipement,
      slug: `${cle}-${U.slice(0, 8)}`,
    }).returning();
    ids[cle] = e!.id;
  }
  exoPoulie = ids.poulie!;
  exoPresse = ids.presse!;
  exoPompe = ids.pompe!;

  // Un seul appareil réellement décrit.
  const [i] = await db.insert(schema.exerciseInstances).values({
    userId: U, exerciseId: exoPresse, gymId: salle, machineNom: "Leg Press 45°",
    conventionCharge: "pile_affichee", incrementsPossibles: [5],
  }).returning();
  instancePresse = i!.id;
});

describe("la valeur par défaut ne change rien", () => {
  it("une salle créée sans se prononcer est « inconnu »", async () => {
    const g = await db.query.gyms.findFirst({ where: eq(schema.gyms.id, salle) });
    expect(g?.inventaireStatut).toBe("inconnu");
    expect(statutInventaire(g?.inventaireStatut)).toBe("inconnu");
  });

  it("et garde le comportement historique : la famille cochée suffit", async () => {
    const ids = await faisables("inconnu");
    expect(ids).toContain(exoPoulie);
    expect(ids).toContain(exoPresse);
    expect(ids).toContain(exoPompe);
  });
});

describe("partiel", () => {
  it("garde les instances réelles prioritaires et laisse la famille compléter", async () => {
    const ids = await faisables("partiel");
    // La presse vient de son instance, la poulie du matériel coché : les deux
    // restent proposables, et c'est ce que « incomplet » veut dire.
    expect(ids).toContain(exoPresse);
    expect(ids).toContain(exoPoulie);
  });
});

describe("complet", () => {
  it("écarte l'exercice dont l'appareil n'est pas décrit", async () => {
    const ids = await faisables("complet");
    expect(ids).not.toContain(exoPoulie);
  });

  it("garde l'appareil décrit et le poids du corps", async () => {
    const ids = await faisables("complet");
    expect(ids).toContain(exoPresse);
    expect(ids).toContain(exoPompe);
  });

  it("interdit toute création « Déduit du matériel » par la calibration", async () => {
    await db.update(schema.gyms)
      .set({ inventaireStatut: "complet" })
      .where(eq(schema.gyms.id, salle));

    const avant = await db.$count(
      schema.exerciseInstances, eq(schema.exerciseInstances.gymId, salle),
    );

    const res = await calibration.POST(new Request("http://t/api/programme/calibration", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ salleId: salle }),
    }));

    // Quel que soit le verdict de la calibration — elle peut réussir avec une
    // séance réduite, ou refuser faute de matière —, ce qui compte est qu'AUCUN
    // appareil n'a été inventé.
    const apres = await db.$count(
      schema.exerciseInstances, eq(schema.exerciseInstances.gymId, salle),
    );
    expect(apres).toBe(avant);

    const deduites = await db.query.exerciseInstances.findMany({
      where: eq(schema.exerciseInstances.gymId, salle),
    });
    for (const i of deduites) {
      expect(i.notesMachine ?? "", i.machineNom).not.toMatch(/Déduit du matériel/);
    }
    expect([200, 201, 409, 500]).toContain(res.status);
  });

  it("laisse intact l'appareil réellement décrit", async () => {
    const i = await db.query.exerciseInstances.findFirst({
      where: eq(schema.exerciseInstances.id, instancePresse),
    });
    expect(i).toBeDefined();
    expect(i?.machineNom).toBe("Leg Press 45°");
    expect(i?.archiveLe).toBeNull();
  });
});

describe("purge", () => {
  it("efface ce que ce fichier a écrit", async () => {
    const blocs = await db.query.programmeBlocs.findMany({
      where: eq(schema.programmeBlocs.userId, U),
    });
    for (const b of blocs) {
      const gabarits = await db.query.seanceTemplates.findMany({
        where: eq(schema.seanceTemplates.blocId, b.id),
      });
      for (const g of gabarits) {
        await db.delete(schema.exerciseInTemplate)
          .where(eq(schema.exerciseInTemplate.seanceTemplateId, g.id));
      }
      await db.delete(schema.seanceTemplates).where(eq(schema.seanceTemplates.blocId, b.id));
    }
    await db.delete(schema.programmeBlocs).where(eq(schema.programmeBlocs.userId, U));
    await db.delete(schema.exerciseInstances).where(eq(schema.exerciseInstances.gymId, salle));
    await db.delete(schema.gyms).where(eq(schema.gyms.id, salle));
    for (const id of [exoPoulie, exoPresse, exoPompe]) {
      await db.delete(schema.exercises).where(eq(schema.exercises.id, id));
    }
    await db.delete(schema.users).where(eq(schema.users.id, U));
    expect(true).toBe(true);
  });
});
