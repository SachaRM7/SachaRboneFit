import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Une séance qui a six exercices ne s'ouvre pas à zéro.
 *
 * Reproduction de la panne du 03/09 : le gabarit « Calibration B » portait ses
 * six lignes, actives, pointant toutes vers des machines disponibles de la
 * salle du jour — et l'écran de séance affichait « 0/0 exercices. Aucun
 * exercice dans cette séance. »
 *
 * Deux chemins mènent à cet écran, et ce fichier les tient tous les deux :
 *
 *   le PLAN      `construireSeanceDuJour` → `session_plan_items`
 *   le REPLI     `/api/sessions/[id]`, utilisé dès que le plan est vide
 *
 * Le repli est la garantie de dernier recours : il ne consulte ni la salle, ni
 * l'état du jour, ni la résolution. Tant qu'il rend une ligne par exercice
 * programmé, l'écran ne peut pas être vide sans raison.
 */

const U = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({ getAuthenticatedUserId: async () => U }));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { construireSeanceDuJour } = await import("@/services/plan-seance");
const { GET: lireGabarit } = await import("@/app/api/sessions/[id]/route");

let gabarit = "";
let salle = "";
const instances: string[] = [];

/** Les six exercices de Calibration B, tels qu'ils sont en production. */
const EXERCICES: Array<[string, string, string[]]> = [
  ["Front Squat", "P4_squat", ["quadriceps"]],
  ["Lying Machine Chest Press", "P1_poussee", ["pectoraux"]],
  ["Lat Pulldown", "P2_tirage", ["dorsaux"]],
  ["Dip", "P1_poussee", ["pectoraux"]],
  ["Preacher Curl", "bras_biceps", ["biceps"]],
  ["Cable Woodchop", "tronc", ["obliques"]],
];

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBeTruthy();

  await db.insert(schema.users).values({
    id: U, email: `${U}@t.test`, nom: "Testeur", onboardingTermineLe: new Date(),
    dureeSeanceCibleMinutes: 120, frequenceCibleParSemaine: 3,
  });

  const [g] = await db.insert(schema.gyms).values({
    userId: U, nom: "St-Martin-Du-Touch", equipementsDisponibles: [],
  }).returning();
  salle = g!.id;

  for (const [nom, pilier, muscles] of EXERCICES) {
    const [e] = await db.insert(schema.exercises).values({
      userId: null, nom, pilier, profilTension: "mi_range", type: "polyarticulaire",
      categorieRole: "pilier", musclesPrincipaux: muscles, musclesSecondaires: [],
      equipement: "machine", slug: `${nom.toLowerCase().replace(/\W+/g, "-")}-${U.slice(0, 8)}`,
    }).returning();
    const [i] = await db.insert(schema.exerciseInstances).values({
      userId: U, exerciseId: e!.id, gymId: salle, machineNom: nom,
      conventionCharge: "poids_total", incrementsPossibles: [2.5],
      // Exactement l'état de production : disponible, non archivée.
      etat: "disponible",
    }).returning();
    instances.push(i!.id);
  }

  const [bloc] = await db.insert(schema.programmeBlocs).values({
    userId: U, nom: "Reprise & calibration", dateDebut: "2026-09-01",
    typeCycle: "calibration", actif: true,
  }).returning();
  const [t] = await db.insert(schema.seanceTemplates).values({
    blocId: bloc!.id, lettre: "B", nom: "Calibration B", ordreDansSemaine: 2,
  }).returning();
  gabarit = t!.id;

  // Six lignes actives, la prescription de production : 2 × 8-12.
  for (const [index, instanceId] of instances.entries()) {
    await db.insert(schema.exerciseInTemplate).values({
      seanceTemplateId: gabarit, exerciseInstanceId: instanceId,
      ordre: index + 1, seriesCibles: 2, fourchetteRepsMin: 8, fourchetteRepsMax: 12,
      reposSecondes: 120,
    });
  }
});

describe("le plan du jour", () => {
  it("porte les six exercices programmés", async () => {
    const resultat = await construireSeanceDuJour({
      userId: U, seanceTemplateId: gabarit, gymId: salle, date: "2026-09-03",
    });
    expect(resultat.items).toHaveLength(6);
  });

  it("n'écarte rien sans le dire", async () => {
    const resultat = await construireSeanceDuJour({
      userId: U, seanceTemplateId: gabarit, gymId: salle, date: "2026-09-03",
    });
    // Un exercice absent du plan doit toujours porter une raison affichable :
    // c'est ce qui distingue une décision d'une disparition.
    expect(resultat.items.length + resultat.ecartes.length).toBe(6);
  });
});

describe("le repli du gabarit ne peut pas rendre une séance vide", () => {
  it("rend une ligne par exercice programmé", async () => {
    const reponse = await lireGabarit(new Request("http://t/api/sessions/x"), {
      params: Promise.resolve({ id: gabarit }),
    });

    // Le défaut : la route échouait en 500, l'écran lisait `t.exercises` sur un
    // corps d'erreur, obtenait `undefined`, et affichait « Aucun exercice dans
    // cette séance » — une panne serveur présentée comme un programme vide.
    expect(reponse.status).toBe(200);

    const corps = await reponse.json();
    expect(Array.isArray(corps.exercises)).toBe(true);
    expect(corps.exercises).toHaveLength(6);
    expect(corps.exercises.map((e: { nom: string }) => e.nom).sort())
      .toEqual([...EXERCICES.map(([nom]) => nom)].sort());
  });
});
