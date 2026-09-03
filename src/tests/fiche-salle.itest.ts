import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * La fiche d'une salle s'ouvre, et ne montre que les siennes.
 *
 * Deux défauts se cumulaient sur cet écran.
 *
 * La fiche répondait 500 — Safari affichait « This page couldn't load ». Le
 * Server Component passait `onSuccess={() => {}}` à `<GymForm>`, un composant
 * client : une fonction ne traverse pas cette frontière, et Next lève au
 * rendu. Ça ne se teste pas ici — c'est le typage et le build qui l'empêchent
 * désormais — mais la requête que la page exécute, si.
 *
 * Et la liste des salles ne filtrait que `archive_le IS NULL` : sur une base à
 * deux comptes, chacun voyait les lieux de l'autre.
 */

const MOI = randomUUID();
const AUTRE = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({ getAuthenticatedUserId: async () => MOI }));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { and, eq, isNull, sql } = await import("drizzle-orm");
const { machinesUtilisablesAujourdhui } = await import("@/db/archivage");

let maSalle = "";
let saSalle = "";

/** Exactement la requête de `app/(app)/gyms/page.tsx`. */
async function sallesDe(userId: string) {
  return db
    .select({ gym: schema.gyms, appareils: sql<number>`cast(count(${schema.exerciseInstances.id}) as int)` })
    .from(schema.gyms)
    .leftJoin(
      schema.exerciseInstances,
      and(eq(schema.exerciseInstances.gymId, schema.gyms.id), machinesUtilisablesAujourdhui()),
    )
    .where(and(eq(schema.gyms.userId, userId), isNull(schema.gyms.archiveLe)))
    .groupBy(schema.gyms.id)
    .orderBy(schema.gyms.nom);
}

/** Exactement la requête de `app/(app)/gyms/[id]/page.tsx`. */
async function fiche(gymId: string, userId: string) {
  const [ligne] = await db
    .select({ gym: schema.gyms, appareils: sql<number>`cast(count(${schema.exerciseInstances.id}) as int)` })
    .from(schema.gyms)
    .leftJoin(
      schema.exerciseInstances,
      and(eq(schema.exerciseInstances.gymId, schema.gyms.id), machinesUtilisablesAujourdhui()),
    )
    .where(and(eq(schema.gyms.id, gymId), eq(schema.gyms.userId, userId), isNull(schema.gyms.archiveLe)))
    .groupBy(schema.gyms.id)
    .limit(1);
  return ligne ?? null;
}

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBeTruthy();

  for (const id of [MOI, AUTRE]) {
    await db.insert(schema.users).values({
      id, email: `${id}@t.test`, nom: "Testeur", onboardingTermineLe: new Date(),
    });
  }

  const [a] = await db.insert(schema.gyms).values({
    userId: MOI, nom: `St-Martin ${MOI.slice(0, 6)}`, inventaireStatut: "complet",
    notes: "Machines a inventorier sur place.",
  }).returning();
  maSalle = a!.id;

  const [b] = await db.insert(schema.gyms).values({
    userId: AUTRE, nom: `Salle de l'autre ${AUTRE.slice(0, 6)}`,
  }).returning();
  saSalle = b!.id;

  const [ex] = await db.insert(schema.exercises).values({
    userId: null, nom: "Lat Pulldown", pilier: "P2_tirage", profilTension: "mi_range",
    type: "polyarticulaire", categorieRole: "pilier",
    musclesPrincipaux: ["dorsaux"], musclesSecondaires: [],
    equipement: "machine", slug: `lat-${MOI.slice(0, 8)}`,
  }).returning();

  // Trois appareils décrits chez moi, dont un hors service.
  for (const [nom, etat] of [["Poste 1", "disponible"], ["Poste 2", "disponible"],
                             ["Poste 3", "temporairement_indisponible"]] as const) {
    await db.insert(schema.exerciseInstances).values({
      userId: MOI, exerciseId: ex!.id, gymId: maSalle, machineNom: nom,
      conventionCharge: "pile_affichee", etat,
    });
  }
  // Et un chez l'autre compte.
  await db.insert(schema.exerciseInstances).values({
    userId: AUTRE, exerciseId: ex!.id, gymId: saSalle, machineNom: "Son poste",
    conventionCharge: "pile_affichee", etat: "disponible",
  });
});

describe("16 — la fiche Saint-Martin se charge", () => {
  it("elle existe et porte son inventaire réel", async () => {
    const page = await fiche(maSalle, MOI);
    expect(page).not.toBeNull();
    // Deux utilisables sur trois décrites : le hors-service ne compte pas.
    expect(page!.appareils).toBe(2);
    expect(page!.gym.inventaireStatut).toBe("complet");
  });

  it("le statut d'inventaire ne vient plus de la note", async () => {
    const page = await fiche(maSalle, MOI);
    // La note dit encore « à inventorier » — elle date de la création du lieu.
    // Ce n'est plus elle qui décide de ce que l'écran annonce.
    expect(page!.gym.notes).toContain("inventorier");
    expect(page!.gym.inventaireStatut).toBe("complet");
    expect(page!.appareils).toBeGreaterThan(0);
  });
});

describe("20 — les données d'un autre compte restent isolées", () => {
  it("ma liste ne contient que mes salles", async () => {
    const miennes = await sallesDe(MOI);
    expect(miennes).toHaveLength(1);
    expect(miennes[0]!.gym.id).toBe(maSalle);
  });

  it("la fiche d'une salle qui n'est pas la mienne est introuvable", async () => {
    // Avant, l'identifiant suffisait : la fiche s'ouvrait, formulaire compris.
    expect(await fiche(saSalle, MOI)).toBeNull();
  });

  it("et l'autre compte ne voit pas la mienne", async () => {
    const siennes = await sallesDe(AUTRE);
    expect(siennes.map((s) => s.gym.id)).toEqual([saSalle]);
  });
});

describe("17 — l'inventaire n'est pas modifié par ces lectures", () => {
  it("les trois appareils décrits sont toujours là, dans le même état", async () => {
    const instances = await db.query.exerciseInstances.findMany({
      where: eq(schema.exerciseInstances.gymId, maSalle),
    });
    expect(instances).toHaveLength(3);
    expect(instances.filter((i) => i.etat === "disponible")).toHaveLength(2);
    expect(instances.every((i) => i.archiveLe === null)).toBe(true);
  });
});
