import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * La fiche d'une salle s'ouvre, et dit ce qu'on a le droit d'y faire.
 *
 * La fiche répondait 500 — Safari affichait « This page couldn't load ». Le
 * Server Component passait `onSuccess={() => {}}` à `<GymForm>`, un composant
 * client : une fonction ne traverse pas cette frontière, et Next lève au
 * rendu. Ça ne se teste pas ici — c'est le typage et le build qui l'empêchent
 * désormais — mais la requête que la page exécute, si.
 *
 * Ce fichier a d'abord verrouillé la règle inverse de la bonne. Ces deux
 * écrans avaient été filtrés par `gyms.user_id` au motif que « chacun voyait
 * les lieux de l'autre » — et ça fermait la consultation d'un lieu commun.
 * Le modèle est explicite, jusque dans le commentaire de la colonne : une
 * salle et son inventaire décrivent un LIEU, `user_id` désigne qui le tient à
 * jour. La lecture est commune ; c'est l'écriture qui a un responsable.
 */

const MOI = randomUUID();
const AUTRE = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({ getAuthenticatedUserId: async () => MOI }));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { and, eq, isNull, sql } = await import("drizzle-orm");
const { machinesUtilisablesAujourdhui } = await import("@/db/archivage");
const { peutGererLaSalle } = await import("@/lib/autorisations");

let maSalle = "";
let saSalle = "";

/** Exactement la requête de `app/(app)/gyms/page.tsx`. */
async function catalogueDesSalles() {
  return db
    .select({ gym: schema.gyms, appareils: sql<number>`cast(count(${schema.exerciseInstances.id}) as int)` })
    .from(schema.gyms)
    .leftJoin(
      schema.exerciseInstances,
      and(eq(schema.exerciseInstances.gymId, schema.gyms.id), machinesUtilisablesAujourdhui()),
    )
    .where(isNull(schema.gyms.archiveLe))
    .groupBy(schema.gyms.id)
    .orderBy(schema.gyms.nom);
}

/** Exactement la requête de `app/(app)/gyms/[id]/page.tsx`. */
async function fiche(gymId: string) {
  const [ligne] = await db
    .select({ gym: schema.gyms, appareils: sql<number>`cast(count(${schema.exerciseInstances.id}) as int)` })
    .from(schema.gyms)
    .leftJoin(
      schema.exerciseInstances,
      and(eq(schema.exerciseInstances.gymId, schema.gyms.id), machinesUtilisablesAujourdhui()),
    )
    .where(and(eq(schema.gyms.id, gymId), isNull(schema.gyms.archiveLe)))
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
    const page = await fiche(maSalle);
    expect(page).not.toBeNull();
    // Deux utilisables sur trois décrites : le hors-service ne compte pas.
    expect(page!.appareils).toBe(2);
    expect(page!.gym.inventaireStatut).toBe("complet");
  });

  it("le statut d'inventaire ne vient plus de la note", async () => {
    const page = await fiche(maSalle);
    // La note dit encore « à inventorier » — elle date de la création du lieu.
    // Ce n'est plus elle qui décide de ce que l'écran annonce.
    expect(page!.gym.notes).toContain("inventorier");
    expect(page!.gym.inventaireStatut).toBe("complet");
    expect(page!.appareils).toBeGreaterThan(0);
  });
});

describe("20 — visible par tous, tenue à jour par son mainteneur", () => {
  it("l'écran des salles montre le catalogue entier, pas « les miennes »", async () => {
    const ids = (await catalogueDesSalles()).map((s) => s.gym.id);
    // La base de test est partagée entre les scénarios : on vérifie la
    // présence des deux lieux, pas la longueur de la liste.
    expect(ids).toContain(maSalle);
    expect(ids).toContain(saSalle);
  });

  it("la fiche d'une salle tenue par un autre compte s'ouvre", async () => {
    const page = await fiche(saSalle);
    expect(page).not.toBeNull();
    // Et son inventaire est celui du lieu, pas une copie par compte.
    expect(page!.appareils).toBe(1);
  });

  it("mais le formulaire n'y est pas : la maintenance a un responsable", () => {
    expect(peutGererLaSalle({ userId: AUTRE }, MOI)).toBe(false);
    expect(peutGererLaSalle({ userId: MOI }, MOI)).toBe(true);
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
