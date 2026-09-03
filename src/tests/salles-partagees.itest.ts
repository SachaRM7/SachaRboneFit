import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Une salle est un lieu, pas une possession.
 *
 * La règle, arbitrée et désormais unique dans l'application :
 *
 *   visibilité    partagée   — n'importe qui voit St-Martin si elle existe,
 *                              et son inventaire physique n'est jamais
 *                              dupliqué par compte
 *   utilisation   explicite  — partagée ne veut pas dire choisie : il faut une
 *                              préférence, un contexte, ou une sélection
 *   maintenance  au mainteneur — `gyms.user_id` donne le droit d'éditer et de
 *                              supprimer, pas celui de voir
 *
 * Ces trois notions avaient été confondues dans les deux sens, à quelques
 * jours d'intervalle : d'abord la salle du jour DÉDUITE du lieu d'un autre
 * compte, puis la consultation FERMÉE pour corriger cette fuite au mauvais
 * endroit. Ce fichier tient les trois en même temps, plus la quatrième
 * propriété qui doit survivre au partage : rien de la vie sportive de A ne
 * traverse vers B.
 *
 * A tient la salle. B n'a aucun lieu à lui, aucune préférence, et n'a jamais
 * mis les pieds dans cette salle.
 */

const A = randomUUID();
const B = randomUUID();
let courant: string = A;
vi.mock("@/lib/supabase/auth-helper", () => ({ getAuthenticatedUserId: async () => courant }));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { and, eq, isNull, sql } = await import("drizzle-orm");
const { machinesUtilisablesAujourdhui } = await import("@/db/archivage");
const { peutGererLaSalle } = await import("@/lib/autorisations");
const { choisirSalleDuJour } = await import("@/lib/engine/etat-du-jour");
const { donneesTableauDeBord } = await import("@/services/tableau-de-bord");
const salleApi = await import("@/app/api/gyms/[id]/route");

const NOM = `St-Martin partagée ${A.slice(0, 6)}`;
const NOTE_PERSO = `Note privée de A ${A.slice(0, 6)}`;
let salle = "";
let machine = "";

const enTantQue = async <T>(qui: string, f: () => Promise<T>): Promise<T> => {
  const avant = courant;
  courant = qui;
  try {
    return await f();
  } finally {
    courant = avant;
  }
};

const params = (id: string) => ({ params: Promise.resolve({ id }) });

/** Exactement la requête de l'écran des salles. */
async function catalogue() {
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

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBeTruthy();

  for (const id of [A, B]) {
    await db.insert(schema.users).values({
      id, email: `${id}@t.test`, nom: id === A ? "A" : "B", onboardingTermineLe: new Date(),
    });
  }

  const [g] = await db.insert(schema.gyms).values({
    userId: A, nom: NOM, notes: NOTE_PERSO, equipementsDisponibles: ["machine"],
    inventaireStatut: "complet",
  }).returning();
  salle = g!.id;

  const [ex] = await db.insert(schema.exercises).values({
    userId: null, nom: "Presse à cuisses", pilier: "P3_squat", profilTension: "mi_range",
    type: "polyarticulaire", categorieRole: "pilier",
    musclesPrincipaux: ["quadriceps"], musclesSecondaires: [], equipement: "machine",
    slug: `presse-${A.slice(0, 8)}`,
  }).returning();

  const [i] = await db.insert(schema.exerciseInstances).values({
    userId: A, exerciseId: ex!.id, gymId: salle, machineNom: "Presse 1",
    conventionCharge: "pile_affichee", incrementsPossibles: [5],
  }).returning();
  machine = i!.id;

  // La vie sportive de A : une séance réalisée dans CETTE salle, avec ses
  // séries. C'est ce qui ne doit pas traverser.
  const [seance] = await db.insert(schema.sessionLogs).values({
    userId: A, date: "2026-08-20", gymId: salle, dureeMinutes: 52,
    notesSeance: NOTE_PERSO,
  }).returning();
  await db.insert(schema.setLogs).values({
    sessionLogId: seance!.id, exerciseInstanceId: machine,
    numeroSerie: 1, repsEffectuees: 8, charge: 140, rpeEffectif: 8,
  });
});

describe("B voit la salle que A tient à jour", () => {
  it("elle est dans le catalogue, avec son inventaire réel", async () => {
    const vue = (await catalogue()).find((s) => s.gym.id === salle);
    expect(vue, "la salle de A doit être visible par tous").toBeTruthy();
    // L'inventaire physique n'est pas dupliqué par compte : c'est la machine
    // de A que B verra, la même ligne.
    expect(vue!.appareils).toBe(1);
    expect(vue!.gym.nom).toBe(NOM);
  });

  it("et sa fiche s'ouvre pour B", async () => {
    const res = await enTantQue(B, () => salleApi.GET(new Request("http://t/"), params(salle)));
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(salle);
  });
});

describe("B peut la choisir, mais rien ne la choisit pour lui", () => {
  it("sans préférence, la salle d'un autre n'est pas sa salle du jour", () => {
    // Le point que le partage ne doit pas emporter : « il n'existe qu'une
    // salle dans le catalogue » ne donne pas le droit de l'attribuer.
    expect(choisirSalleDuJour({ id: B, prefSalleParDefautId: null }, [{ id: salle, userId: A }]))
      .toBeNull();
  });

  it("l'accueil de B ne part donc pas avec la salle de A", async () => {
    const donnees = await donneesTableauDeBord(B);
    expect(donnees.etat.salle).toBeNull();
    expect(donnees.etat.etat).toBe("sans_salle");
  });

  it("mais la désigner explicitement suffit, et n'exige rien d'autre", async () => {
    await db.update(schema.users)
      .set({ prefSalleParDefautId: salle })
      .where(eq(schema.users.id, B));

    const donnees = await donneesTableauDeBord(B);
    expect(donnees.etat.salle?.id).toBe(salle);
    // Et le lieu n'est pas annoncé vide : B s'entraîne sur les machines de A
    // sans avoir eu à ressaisir un parc déjà renseigné.
    expect(donnees.etat.etat).not.toBe("salle_vide");
  });
});

describe("B ne peut pas la modifier", () => {
  it("l'édition est refusée, avec la raison", async () => {
    const res = await enTantQue(B, () => salleApi.PATCH(
      new Request("http://t/", { method: "PATCH", body: JSON.stringify({ nom: "Renommée par B" }) }),
      params(salle),
    ));
    expect(res.status).toBe(403);

    const apres = await db.query.gyms.findFirst({ where: eq(schema.gyms.id, salle) });
    expect(apres?.nom).toBe(NOM);
    expect(apres?.userId).toBe(A);
  });

  it("la suppression aussi, et le lieu est toujours là", async () => {
    const res = await enTantQue(B, () => salleApi.DELETE(
      new Request("http://t/", { method: "DELETE" }), params(salle),
    ));
    expect(res.status).toBe(403);
    expect(await db.query.gyms.findFirst({ where: eq(schema.gyms.id, salle) })).toBeTruthy();
  });

  it("A, lui, en est le mainteneur", () => {
    expect(peutGererLaSalle({ userId: A }, A)).toBe(true);
    expect(peutGererLaSalle({ userId: A }, B)).toBe(false);
  });
});

describe("rien de la vie sportive de A ne traverse", () => {
  it("l'accueil de B ne porte aucune séance, série ni note de A", async () => {
    const donnees = await donneesTableauDeBord(B);
    const rendu = JSON.stringify(donnees);

    // La note personnelle de A est écrite à deux endroits — sur le lieu
    // partagé ET sur sa séance. Le lieu peut la montrer, c'est une note de
    // salle ; l'historique de B, jamais.
    expect(donnees.recentSessions).toEqual([]);
    expect(rendu).not.toContain("2026-08-20");
    expect(rendu).not.toContain(String(140));

    // Le poids et le bloc de A ne sont pas non plus les siens.
    expect(donnees.user.poidsActuel).toBeNull();
    expect(donnees.blocActif).toBeNull();
  });

  it("la dernière série sur la machine partagée n'est pas celle de A", async () => {
    // Le parc est commun : deux comptes s'entraînent sur la même machine. La
    // référence de charge, elle, est strictement personnelle — sinon B
    // démarrerait à 140 kg parce que A y est passé.
    const { dernieresSeriesPour } = await import("@/services/plan-seance");
    expect((await dernieresSeriesPour(B, [machine])).size).toBe(0);
    // Contrôle négatif : la série existe bel et bien, pour A.
    expect((await dernieresSeriesPour(A, [machine])).get(machine)?.sets[0]?.charge).toBe(140);
  });
});
