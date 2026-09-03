import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Lire une séance passée n'appelle jamais le modèle.
 *
 * C'est l'invariant de ce lot, et c'est celui qui coûtait le plus cher : le
 * débrief était redemandé au coach à CHAQUE ouverture d'une fiche de séance —
 * y compris une séance vieille de six mois consultée pour vérifier une charge.
 * Chaque consultation créait une conversation, écrivait deux messages, payait
 * un appel modèle. Et n'affichait rien : le composant lisait la réponse comme
 * un flux d'événements alors que la route répond en JSON.
 *
 * Le modèle est remplacé ici par un compteur. Ce n'est pas la qualité du texte
 * qu'on teste — c'est le NOMBRE de fois où on le demande.
 */

const U = randomUUID();
const VOISIN = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({ getAuthenticatedUserId: async () => U }));

let appels = 0;
vi.mock("@/lib/coach/llm-client", async (original) => {
  const vrai = await original<typeof import("@/lib/coach/llm-client")>();
  return {
    ...vrai,
    appelerLLM: async () => {
      appels += 1;
      return { texte: `Débrief numéro ${appels}`, appelsOutils: [], modeleUtilise: "test:modele" };
    },
  };
});

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { eq } = await import("drizzle-orm");
const { debriefEnregistre, genererDebrief } = await import("@/services/debrief-seance");
const { SeanceIntrouvable } = await import("@/services/seances");
const route = await import("@/app/api/sessions/[id]/debrief/route");

const AUJOURDHUI = new Date().toISOString().slice(0, 10);
let seance = "";
let seanceDuVoisin = "";
let instance = "";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBeTruthy();

  for (const id of [U, VOISIN]) {
    await db.insert(schema.users).values({
      id, email: `${id}@t.test`, nom: "Testeur", onboardingTermineLe: new Date(),
    });
  }
  const [salle] = await db.insert(schema.gyms)
    .values({ userId: U, nom: `Salle ${U.slice(0, 6)}` }).returning();
  const [ex] = await db.insert(schema.exercises).values({
    userId: null, nom: "Développé couché", pilier: "P1_poussee", profilTension: "mi_range",
    type: "polyarticulaire", categorieRole: "pilier",
    musclesPrincipaux: ["pectoraux"], musclesSecondaires: [], equipement: "barre",
    slug: `dc-${U.slice(0, 8)}`,
  }).returning();
  const [i] = await db.insert(schema.exerciseInstances).values({
    userId: U, exerciseId: ex!.id, gymId: salle!.id, machineNom: "Banc 1",
    conventionCharge: "poids_total",
  }).returning();
  instance = i!.id;

  const [s] = await db.insert(schema.sessionLogs)
    .values({ userId: U, date: AUJOURDHUI, gymId: salle!.id, dureeMinutes: 55 }).returning();
  seance = s!.id;
  await db.insert(schema.setLogs).values({
    sessionLogId: seance, exerciseInstanceId: instance,
    numeroSerie: 1, repsEffectuees: 8, charge: 80, rpeEffectif: 8,
  });

  const [sv] = await db.insert(schema.sessionLogs)
    .values({ userId: VOISIN, date: AUJOURDHUI, gymId: salle!.id, dureeMinutes: 40 }).returning();
  seanceDuVoisin = sv!.id;
  await db.insert(schema.setLogs).values({
    sessionLogId: seanceDuVoisin, exerciseInstanceId: instance,
    numeroSerie: 1, repsEffectuees: 5, charge: 100, rpeEffectif: 9,
  });
});

describe("la lecture ne coûte rien", () => {
  it("une séance sans débrief se lit sans appeler le modèle", async () => {
    const avant = appels;
    expect(await debriefEnregistre(U, seance)).toBeNull();
    const res = await route.GET(new Request("http://t/"), params(seance));
    expect(res.status).toBe(200);
    expect((await res.json()).debrief).toBeNull();
    expect(appels, "une lecture a déclenché une génération").toBe(avant);
  });

  it("la génération est explicite, et une seule fois", async () => {
    const avant = appels;
    const genere = await genererDebrief(U, seance);
    expect(appels).toBe(avant + 1);
    expect(genere.contenu).toContain("Débrief numéro");
    expect(genere.modele).toBe("test:modele");
  });

  it("dix lectures ensuite ne rappellent jamais le modèle", async () => {
    const avant = appels;
    for (let i = 0; i < 10; i += 1) {
      const res = await route.GET(new Request("http://t/"), params(seance));
      const { debrief } = await res.json();
      expect(debrief.contenu).toContain("Débrief numéro");
    }
    expect(appels, "consulter l'historique coûte encore des appels modèle").toBe(avant);
  });

  it("régénérer remplace, sans empiler", async () => {
    const precedent = (await debriefEnregistre(U, seance))!.contenu;
    const res = await route.POST(new Request("http://t/", { method: "POST" }), params(seance));
    expect(res.status).toBe(200);

    const apres = (await debriefEnregistre(U, seance))!;
    expect(apres.contenu).not.toBe(precedent);

    const lignes = await db.select().from(schema.sessionDebriefs)
      .where(eq(schema.sessionDebriefs.sessionLogId, seance));
    expect(lignes, "un débrief par séance").toHaveLength(1);
  });
});

describe("ce que le débrief conserve", () => {
  it("porte sa date et le modèle qui l'a écrit", async () => {
    const d = (await debriefEnregistre(U, seance))!;
    expect(d.genereLe).toBeInstanceOf(Date);
    expect(d.modele).toBe("test:modele");
  });

  it("se déclare périmé quand les séries changent, sans se régénérer", async () => {
    expect((await debriefEnregistre(U, seance))!.perime).toBe(false);

    const avant = appels;
    await db.update(schema.setLogs).set({ charge: 90 })
      .where(eq(schema.setLogs.sessionLogId, seance));

    const apres = (await debriefEnregistre(U, seance))!;
    expect(apres.perime, "la correction d'une charge doit se constater").toBe(true);
    // Constater n'est pas refaire : rien ne se régénère tout seul.
    expect(appels).toBe(avant);
  });
});

describe("le débrief d'un autre compte", () => {
  it("ne se lit pas", async () => {
    expect(await debriefEnregistre(U, seanceDuVoisin)).toBeNull();
  });

  it("ne se génère pas non plus", async () => {
    const avant = appels;
    await expect(genererDebrief(U, seanceDuVoisin)).rejects.toBeInstanceOf(SeanceIntrouvable);
    // Et l'appel modèle n'a même pas eu lieu : le refus précède la dépense.
    expect(appels).toBe(avant);

    const res = await route.POST(new Request("http://t/", { method: "POST" }), params(seanceDuVoisin));
    expect(res.status).toBe(404);
  });
});
