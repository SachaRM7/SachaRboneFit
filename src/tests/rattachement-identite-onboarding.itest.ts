import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Régression du compte Auth créé avec une adresse déjà présente dans `users`.
 *
 * Les premières versions de l'application créaient parfois le profil avant le
 * compte Supabase Auth. L'adresse était donc correcte, mais les deux UUID ne
 * correspondaient pas. `/api/user` échouait sur l'unicité de l'adresse, puis
 * l'onboarding échouait sur la clé étrangère de la première pesée.
 */
const ID_AUTH = randomUUID();
const ID_HERITE = randomUUID();
const EMAIL = `rattachement-${ID_AUTH.slice(0, 8)}@exemple.test`;
const NOM_SALLE = `Salle rattachement ${ID_AUTH.slice(0, 8)}`;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => ({
        data: {
          claims: {
            sub: ID_AUTH,
            email: EMAIL,
            user_metadata: { nom: "Nouveau compte" },
          },
        },
        error: null,
      }),
      getUser: async () => ({
        data: { user: { id: ID_AUTH, email: EMAIL } },
        error: null,
      }),
    },
  }),
}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { eq, inArray } = await import("drizzle-orm");
const utilisateur = await import("@/app/api/user/route");
const onboarding = await import("@/app/api/onboarding/route");

async function nettoyer() {
  await db.delete(schema.contraintes).where(inArray(schema.contraintes.userId, [ID_AUTH, ID_HERITE]));
  await db.delete(schema.bodyWeights).where(inArray(schema.bodyWeights.userId, [ID_AUTH, ID_HERITE]));
  await db.delete(schema.programmeBlocs).where(inArray(schema.programmeBlocs.userId, [ID_AUTH, ID_HERITE]));
  await db.delete(schema.gyms).where(inArray(schema.gyms.userId, [ID_AUTH, ID_HERITE]));
  await db.delete(schema.users).where(inArray(schema.users.id, [ID_AUTH, ID_HERITE]));
}

beforeEach(nettoyer);
afterAll(nettoyer);

describe("rattachement d'un ancien profil au compte Auth", () => {
  it("/api/user adopte un profil vide qui porte la même adresse", async () => {
    await db.insert(schema.users).values({ id: ID_HERITE, email: EMAIL, nom: "Profil hérité" });

    const reponse = await utilisateur.POST(new Request("http://test/api/user", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nom: "Nouveau compte" }),
    }));

    expect(reponse.status, await reponse.clone().text()).toBe(201);
    expect(await db.query.users.findFirst({ where: eq(schema.users.id, ID_HERITE) })).toBeUndefined();
    expect(await db.query.users.findFirst({ where: eq(schema.users.id, ID_AUTH) })).toMatchObject({
      email: EMAIL,
      nom: "Profil hérité",
    });
  });

  it("l'onboarding se répare seul si /api/user avait échoué auparavant", async () => {
    await db.insert(schema.users).values({ id: ID_HERITE, email: EMAIL, nom: "Profil hérité" });

    const reponse = await onboarding.POST(new Request("http://test/api/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        objectifType: "reprise",
        niveauExperience: "debutant",
        anneesDePratique: 0,
        moisDInterruption: 0,
        frequenceCibleParSemaine: 3,
        frequenceMinParSemaine: 2,
        frequenceMaxParSemaine: 3,
        dureeSeanceCibleMinutes: 60,
        dureeSeanceMaxMinutes: 75,
        preferenceMateriel: "machines",
        nouvelleSalleNom: NOM_SALLE,
        dateNaissance: "1995-05-12",
        sexe: "femme",
        taille: 165,
        poids: 60,
        poidsDate: new Date().toISOString().slice(0, 10),
      }),
    }));

    expect(reponse.status, await reponse.clone().text()).toBe(201);
    expect(await db.query.users.findFirst({ where: eq(schema.users.id, ID_HERITE) })).toBeUndefined();
    expect(await db.query.users.findFirst({ where: eq(schema.users.id, ID_AUTH) })).toMatchObject({
      email: EMAIL,
      onboardingTermineLe: expect.any(Date),
    });
    expect(await db.query.bodyWeights.findMany({ where: eq(schema.bodyWeights.userId, ID_AUTH) }))
      .toHaveLength(1);
  });

  it("refuse de rattacher silencieusement un profil déjà finalisé", async () => {
    await db.insert(schema.users).values({
      id: ID_HERITE,
      email: EMAIL,
      nom: "Compte actif",
      onboardingTermineLe: new Date(),
    });

    const reponse = await utilisateur.POST(new Request("http://test/api/user", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nom: "Autre compte" }),
    }));

    expect(reponse.status).toBe(409);
    expect(await db.query.users.findFirst({ where: eq(schema.users.id, ID_HERITE) }))
      .toMatchObject({ nom: "Compte actif" });
    expect(await db.query.users.findFirst({ where: eq(schema.users.id, ID_AUTH) })).toBeUndefined();
  });
});
