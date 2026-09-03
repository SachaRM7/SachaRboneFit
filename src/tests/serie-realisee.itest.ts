import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * La séance de recette du 3 septembre, rejouée de bout en bout.
 *
 * Elle a été saisie exprès pour casser l'application : 0 kg, 0 répétition,
 * champs vides, RPE à 99. L'historique en a fait « 17 séries, 0 kg de volume »,
 * et la double progression a proposé de monter la charge de 4,5 kg sur un
 * exercice que personne n'avait fait.
 *
 * Ce fichier tient deux choses que seule une vraie base peut montrer : ce qui
 * entre en base à la clôture, et ce que la référence de progression en retient.
 */

const U = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({ getAuthenticatedUserId: async () => U }));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { eq } = await import("drizzle-orm");
const { terminerSeance, SeanceSansSerie } = await import("@/services/seances");
const { derniereSeriesPour } = await import("@/services/plan-seance");

let salle = "";
let gabarit = "";
/** Une pile : zéro kilo n'y veut rien dire. */
let pile = "";
/** Une assistance : zéro y est le meilleur résultat possible. */
let assistee = "";
/** Un mouvement au poids du corps : la charge vaut zéro par convention. */
let corps = "";

async function nouvelleSeance(date: string) {
  const [s] = await db.insert(schema.sessionLogs).values({
    userId: U, date, gymId: salle, seanceTemplateId: gabarit,
  }).returning();
  return s!.id;
}

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBeTruthy();

  await db.insert(schema.users).values({
    id: U, email: `${U}@t.test`, nom: "Testeur", onboardingTermineLe: new Date(),
    dureeSeanceCibleMinutes: 60, dureeSeanceMaxMinutes: 90, frequenceCibleParSemaine: 3,
  });

  const [g] = await db.insert(schema.gyms).values({
    userId: U, nom: `Salle ${U.slice(0, 8)}`, equipementsDisponibles: [],
  }).returning();
  salle = g!.id;

  const machines: Array<[string, string, string, string]> = [
    ["pile", "Lat Pulldown", "pile_affichee", "resistance"],
    ["assistee", "Traction assistée", "pile_affichee", "assistance"],
    ["corps", "Dips", "sans_charge", "resistance"],
  ];
  const ids: Record<string, string> = {};
  for (const [cle, nom, convention, nature] of machines) {
    const [e] = await db.insert(schema.exercises).values({
      userId: null, nom, pilier: "P2_tirage", profilTension: "mi_range",
      type: "polyarticulaire", categorieRole: "pilier",
      musclesPrincipaux: ["dorsaux"], musclesSecondaires: [],
      equipement: "machine", slug: `${cle}-${U.slice(0, 8)}`,
    }).returning();
    const [i] = await db.insert(schema.exerciseInstances).values({
      userId: U, exerciseId: e!.id, gymId: salle, machineNom: nom,
      conventionCharge: convention, natureCharge: nature,
      incrementsPossibles: [2.5], etat: "disponible",
    }).returning();
    ids[cle] = i!.id;
  }
  pile = ids.pile!; assistee = ids.assistee!; corps = ids.corps!;

  const [bloc] = await db.insert(schema.programmeBlocs).values({
    userId: U, nom: "Bloc", dateDebut: "2026-09-01", typeCycle: "calibration", actif: true,
  }).returning();
  const [t] = await db.insert(schema.seanceTemplates).values({
    blocId: bloc!.id, lettre: "A", nom: "Séance A", ordreDansSemaine: 1,
  }).returning();
  gabarit = t!.id;
});

describe("1 — une série vide ou à zéro ne devient pas une série réalisée", () => {
  it("la clôture n'écrit que ce qui a eu lieu", async () => {
    const seance = await nouvelleSeance("2026-09-03");

    await terminerSeance({
      userId: U, sessionLogId: seance, dureeMinutes: 138,
      series: [
        { exerciseInstanceId: pile, numeroSerie: 1, repsEffectuees: 10, charge: 45 },
        { exerciseInstanceId: pile, numeroSerie: 2, repsEffectuees: 0, charge: 0 },
        { exerciseInstanceId: pile, numeroSerie: 3, repsEffectuees: 0, charge: 45 },
        { exerciseInstanceId: pile, numeroSerie: 4, repsEffectuees: 8, charge: 0 },
      ],
    });

    const enBase = await db.query.setLogs.findMany({
      where: eq(schema.setLogs.sessionLogId, seance),
    });
    expect(enBase).toHaveLength(1);
    expect(enBase[0]?.numeroSerie).toBe(1);
  });

  it("une séance entièrement absurde ne peut pas être clôturée", async () => {
    const seance = await nouvelleSeance("2026-09-04");
    await expect(terminerSeance({
      userId: U, sessionLogId: seance, dureeMinutes: 138,
      series: [
        { exerciseInstanceId: pile, numeroSerie: 1, repsEffectuees: 0, charge: 0 },
        { exerciseInstanceId: pile, numeroSerie: 2, repsEffectuees: 0, charge: 0 },
      ],
    })).rejects.toBeInstanceOf(SeanceSansSerie);

    // Et rien n'a été écrit : la séance reste ouverte, donc reprenable.
    const enBase = await db.query.setLogs.findMany({
      where: eq(schema.setLogs.sessionLogId, seance),
    });
    expect(enBase).toHaveLength(0);
  });

  it("un RPE hors plage est jeté, la série est gardée", async () => {
    const seance = await nouvelleSeance("2026-09-05");
    await terminerSeance({
      userId: U, sessionLogId: seance, dureeMinutes: 45,
      series: [
        { exerciseInstanceId: pile, numeroSerie: 1, repsEffectuees: 9, charge: 45, rpeEffectif: 99 },
        { exerciseInstanceId: pile, numeroSerie: 2, repsEffectuees: 9, charge: 45, rpeEffectif: 8 },
      ],
    });
    const enBase = await db.query.setLogs.findMany({
      where: eq(schema.setLogs.sessionLogId, seance),
      orderBy: (s, { asc }) => [asc(s.numeroSerie)],
    });
    expect(enBase).toHaveLength(2);
    expect(enBase[0]?.rpeEffectif).toBeNull();
    expect(enBase[1]?.rpeEffectif).toBe(8);
  });
});

describe("zéro kilo selon ce que la charge mesure", () => {
  it("une assistance à zéro est une vraie série", async () => {
    const seance = await nouvelleSeance("2026-09-06");
    await terminerSeance({
      userId: U, sessionLogId: seance, dureeMinutes: 40,
      series: [{ exerciseInstanceId: assistee, numeroSerie: 1, repsEffectuees: 6, charge: 0 }],
    });
    const enBase = await db.query.setLogs.findMany({
      where: eq(schema.setLogs.sessionLogId, seance),
    });
    expect(enBase).toHaveLength(1);
  });

  it("un mouvement au poids du corps aussi", async () => {
    const seance = await nouvelleSeance("2026-09-07");
    await terminerSeance({
      userId: U, sessionLogId: seance, dureeMinutes: 40,
      series: [{ exerciseInstanceId: corps, numeroSerie: 1, repsEffectuees: 12, charge: 0 }],
    });
    const enBase = await db.query.setLogs.findMany({
      where: eq(schema.setLogs.sessionLogId, seance),
    });
    expect(enBase).toHaveLength(1);
  });
});

describe("2 — une série invalide n'alimente ni progression ni référence", () => {
  it("une référence entièrement invalide ne fait pas monter la charge", async () => {
    // Écriture directe : ces lignes existent déjà en production, écrites avant
    // que l'invariant ne soit posé. Elles ne doivent plus rien décider.
    const seance = await nouvelleSeance("2026-09-08");
    await db.insert(schema.setLogs).values([
      { sessionLogId: seance, exerciseInstanceId: corps, numeroSerie: 1, repsEffectuees: 0, charge: 0 },
      { sessionLogId: seance, exerciseInstanceId: corps, numeroSerie: 2, repsEffectuees: 0, charge: 0 },
    ]);

    // `sans_charge` rend zéro légitime, mais zéro RÉPÉTITION ne l'est jamais.
    // La séance du 07 — 12 répétitions au poids du corps — reste donc la
    // référence, alors que celle du 08 est PLUS RÉCENTE : c'est exactement le
    // cas qui faisait proposer une hausse de charge sur une séance vide.
    const reference = await derniereSeriesPour(U, corps);
    expect(reference).not.toBeNull();
    expect(reference!.sets).toHaveLength(1);
    expect(reference!.sets[0]?.reps).toBe(12);
  });

  it("sans aucune série valide, il n'y a pas de référence du tout", async () => {
    const [vierge] = await db.insert(schema.exerciseInstances).values({
      userId: U, exerciseId: (await db.query.exerciseInstances.findFirst({
        where: eq(schema.exerciseInstances.id, pile),
      }))!.exerciseId,
      gymId: salle, machineNom: "Poste jamais utilisé",
      conventionCharge: "pile_affichee", natureCharge: "resistance",
      incrementsPossibles: [2.5], etat: "disponible",
    }).returning();

    const seance = await nouvelleSeance("2026-09-10");
    await db.insert(schema.setLogs).values([
      { sessionLogId: seance, exerciseInstanceId: vierge!.id, numeroSerie: 1, repsEffectuees: 0, charge: 0 },
    ]);

    expect(await derniereSeriesPour(U, vierge!.id)).toBeNull();
  });

  it("les séries valides d'une séance mixte sont seules retenues", async () => {
    const seance = await nouvelleSeance("2026-09-09");
    await db.insert(schema.setLogs).values([
      { sessionLogId: seance, exerciseInstanceId: assistee, numeroSerie: 1, repsEffectuees: 8, charge: 20 },
      { sessionLogId: seance, exerciseInstanceId: assistee, numeroSerie: 2, repsEffectuees: 0, charge: 0 },
      { sessionLogId: seance, exerciseInstanceId: assistee, numeroSerie: 3, repsEffectuees: 7, charge: 20 },
    ]);

    const reference = await derniereSeriesPour(U, assistee);
    expect(reference).not.toBeNull();
    expect(reference!.sets).toHaveLength(2);
    expect(reference!.sets.map((s) => s.reps)).toEqual([8, 7]);
  });
});

describe("17 — l'inventaire de la salle n'est jamais modifié par une écriture de séance", () => {
  it("les instances sont intactes après toutes ces clôtures", async () => {
    // Les trois machines du départ, telles qu'elles ont été décrites : aucune
    // clôture de séance, aucune série refusée n'a touché à l'inventaire.
    const instances = await db.query.exerciseInstances.findMany({
      where: (i, { inArray }) => inArray(i.id, [pile, assistee, corps]),
    });
    expect(instances).toHaveLength(3);
    expect(instances.every((i) => i.etat === "disponible" && i.archiveLe === null)).toBe(true);
    expect(instances.map((i) => i.conventionCharge).sort())
      .toEqual(["pile_affichee", "pile_affichee", "sans_charge"]);
  });
});
