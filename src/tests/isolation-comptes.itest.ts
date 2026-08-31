import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Ce qu'un compte ne doit pas pouvoir atteindre chez un autre.
 *
 * L'audit transversal a trouvé trois chemins qui laissaient passer : une fiche
 * d'exercice modifiable par n'importe qui, la dernière séance d'autrui rendue
 * par son identifiant, et un gabarit de programme lisible par simple mention de
 * son identifiant.
 *
 * Le parc — salles et machines — est délibérément partagé : deux personnes
 * s'entraînent dans la même salle sur les mêmes machines. C'est l'historique,
 * le programme et les fiches personnelles qui ne le sont pas. Ces tests fixent
 * la frontière.
 */

const MOI = randomUUID();
const VOISIN = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({ getAuthenticatedUserId: async () => MOI }));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { eq } = await import("drizzle-orm");
const { construireSeanceDuJour } = await import("@/services/plan-seance");
const { PATCH, DELETE, GET } = await import("@/app/api/exercises/[id]/route");
const { GET: DERNIERE_SEANCE } = await import("@/app/api/sessions/last/route");

const AUJOURDHUI = new Date().toISOString().slice(0, 10);

let salle = "";
let instance = "";
let ficheCommune = "";
let fichePerso = "";
let ficheDuVoisin = "";
let gabaritDuVoisin = "";
let seanceDuVoisin = "";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBeTruthy();

  for (const id of [MOI, VOISIN]) {
    await db.insert(schema.users).values({
      id, email: `${id}@t.test`, nom: "Testeur", onboardingTermineLe: new Date(),
    });
  }

  const [g] = await db.insert(schema.gyms).values({ userId: MOI, nom: `Salle ${MOI.slice(0, 8)}` }).returning();
  salle = g!.id;

  // Trois fiches : la bibliothèque commune, la mienne, celle du voisin.
  const fiches: Array<[string, string | null]> = [
    ["commune", null], ["perso", MOI], ["voisin", VOISIN],
  ];
  for (const [cle, proprietaire] of fiches) {
    const [e] = await db.insert(schema.exercises).values({
      userId: proprietaire, nom: `Exercice ${cle}`, pilier: "P1_poussee",
      profilTension: "mi_range", type: "polyarticulaire", categorieRole: "pilier",
      musclesPrincipaux: ["pectoraux"], musclesSecondaires: [], equipement: "machine",
      slug: `${cle}-${MOI.slice(0, 8)}`,
    }).returning();
    if (cle === "commune") ficheCommune = e!.id;
    if (cle === "perso") fichePerso = e!.id;
    if (cle === "voisin") ficheDuVoisin = e!.id;
  }

  const [i] = await db.insert(schema.exerciseInstances).values({
    userId: MOI, exerciseId: ficheCommune, gymId: salle, machineNom: "Poste 1",
    conventionCharge: "poids_total", incrementsPossibles: [2.5],
  }).returning();
  instance = i!.id;

  // Le programme du voisin, et une séance qu'il a faite sur MA machine.
  const [bloc] = await db.insert(schema.programmeBlocs).values({
    userId: VOISIN, nom: "Bloc du voisin", dateDebut: "2026-08-01",
    typeCycle: "volume", actif: true,
  }).returning();
  const [t] = await db.insert(schema.seanceTemplates).values({
    blocId: bloc!.id, lettre: "A", nom: "Séance du voisin", ordreDansSemaine: 1,
  }).returning();
  gabaritDuVoisin = t!.id;
  await db.insert(schema.exerciseInTemplate).values({
    seanceTemplateId: gabaritDuVoisin, exerciseInstanceId: instance, ordre: 1,
    seriesCibles: 5, fourchetteRepsMin: 3, fourchetteRepsMax: 5, reposSecondes: 180,
  });

  const [s] = await db.insert(schema.sessionLogs).values({
    userId: VOISIN, date: AUJOURDHUI, gymId: salle, dureeMinutes: 45,
  }).returning();
  seanceDuVoisin = s!.id;
  await db.insert(schema.setLogs).values({
    sessionLogId: seanceDuVoisin, exerciseInstanceId: instance,
    numeroSerie: 1, repsEffectuees: 3, charge: 180,
  });
});

describe("les fiches d'exercice", () => {
  it("laisse lire la bibliothèque commune", async () => {
    const res = await GET(new Request("http://t/"), params(ficheCommune));
    expect(res.status).toBe(200);
  });

  it("ne laisse pas modifier la bibliothèque commune", async () => {
    // Elle n'a pas d'auteur : une correction faite par un compte s'imposerait
    // à tous les autres.
    const res = await PATCH(
      new Request("http://t/", { method: "PATCH", body: JSON.stringify({ nom: "Détourné" }) }),
      params(ficheCommune),
    );
    expect(res.status).toBe(403);

    const apres = await db.query.exercises.findFirst({ where: eq(schema.exercises.id, ficheCommune) });
    expect(apres?.nom).toBe("Exercice commune");
  });

  it("ne laisse ni lire ni modifier ni supprimer celle d'un autre", async () => {
    // 404 et non 403 : distinguer les deux dirait déjà qu'elle existe.
    expect((await GET(new Request("http://t/"), params(ficheDuVoisin))).status).toBe(404);
    expect((await PATCH(
      new Request("http://t/", { method: "PATCH", body: JSON.stringify({ nom: "Volée" }) }),
      params(ficheDuVoisin),
    )).status).toBe(404);
    expect((await DELETE(new Request("http://t/", { method: "DELETE" }), params(ficheDuVoisin))).status).toBe(404);

    const apres = await db.query.exercises.findFirst({ where: eq(schema.exercises.id, ficheDuVoisin) });
    expect(apres?.nom).toBe("Exercice voisin");
  });

  it("laisse modifier la mienne, sans laisser réécrire son propriétaire", async () => {
    const res = await PATCH(
      new Request("http://t/", {
        method: "PATCH",
        body: JSON.stringify({ nom: "Mon exercice renommé", userId: VOISIN, id: randomUUID() }),
      }),
      params(fichePerso),
    );
    expect(res.status).toBe(200);

    const apres = await db.query.exercises.findFirst({ where: eq(schema.exercises.id, fichePerso) });
    expect(apres?.nom).toBe("Mon exercice renommé");
    // Le corps était recopié tel quel : se réattribuer une fiche tenait dans
    // un champ, et se la faire prendre aussi.
    expect(apres?.userId).toBe(MOI);
    expect(apres?.id).toBe(fichePerso);
  });
});

describe("la dernière séance sur une machine partagée", () => {
  it("ne révèle pas celle du voisin", async () => {
    const res = await DERNIERE_SEANCE(
      new Request(`http://t/api/sessions/last?exerciseInstanceId=${instance}`),
    );
    const corps = await res.json();
    // Je n'ai jamais touché cette machine : la réponse est vide, et surtout
    // elle ne porte pas l'identifiant de la séance du voisin.
    expect(corps).toBeNull();
    expect(JSON.stringify(corps)).not.toContain(seanceDuVoisin);
  });
});

describe("le programme d'un autre", () => {
  it("ne se construit pas en désignant son gabarit", async () => {
    await expect(
      construireSeanceDuJour({
        userId: MOI, seanceTemplateId: gabaritDuVoisin, gymId: salle, date: AUJOURDHUI,
      }),
    ).rejects.toThrow(/introuvable/i);

    // Et rien n'a été créé dans mon compte au passage.
    const miennes = await db.query.sessionLogs.findMany({
      where: eq(schema.sessionLogs.userId, MOI),
    });
    expect(miennes).toHaveLength(0);
  });
});
