import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Terminer une séance n'en ouvre pas une autre.
 *
 * Le 6 septembre, une calibration B réelle — six exercices, douze séries,
 * soixante et une minutes — a été close normalement. Immédiatement après
 * l'enregistrement du débrief, l'application a affiché une nouvelle
 * « Calibration B — 0/6 exercices — 0 min ». Une `session_log` vide venait de
 * naître, sans qu'aucun geste ne l'ait demandée.
 *
 * L'invariant de la PR #3 ne l'avait pas vu, et ne pouvait pas : il dit
 * qu'une séance ne COMPTE que si elle porte au moins une série, et laisse
 * volontairement vivre les séances ouvertes et vides — c'est ce qui permet de
 * reprendre une séance interrompue. La séance fantôme était donc parfaitement
 * légale au regard de cet invariant. Le défaut n'était pas dans le décompte
 * mais dans la CRÉATION.
 *
 * Ce fichier vérifie ce que la PR #3 ne dit pas : après une vraie clôture,
 * plus aucune ligne ne doit apparaître tant que personne n'a démarré.
 */

const U = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({
  getAuthenticatedUserId: async () => U,
  requireAuthenticatedUserId: async () => ({ userId: U, error: null }),
}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { and, eq } = await import("drizzle-orm");
const { prochaineSeance } = await import("@/services/programmes");
const { essentielTableauDeBord } = await import("@/services/tableau-de-bord");
const cloture = await import("@/app/api/session-logs/[id]/route");

let salle = "";
let seanceB = "";
let sessionFaite = "";
const instances: string[] = [];

const seancesDe = () =>
  db.query.sessionLogs.findMany({ where: eq(schema.sessionLogs.userId, U) });

beforeAll(async () => {
  await db.insert(schema.users).values({
    id: U, email: `${U}@t.test`, nom: "Terrain",
    onboardingTermineLe: new Date(), frequenceCibleParSemaine: 3,
  });

  const [g] = await db.insert(schema.gyms).values({
    userId: U, nom: `St-Martin ${U.slice(0, 6)}`, equipementsDisponibles: [],
  }).returning();
  salle = g!.id;

  const [bloc] = await db.insert(schema.programmeBlocs).values({
    userId: U, nom: "Reprise & calibration", dateDebut: "2026-09-01",
    typeCycle: "calibration", actif: true,
  }).returning();

  // Trois séances : la rotation doit pouvoir se tromper si elle avance deux fois.
  const gabarits: string[] = [];
  for (const [i, lettre] of ["A", "B", "C"].entries()) {
    const [t] = await db.insert(schema.seanceTemplates).values({
      blocId: bloc!.id, lettre, nom: `Calibration ${lettre}`, ordreDansSemaine: i + 1,
    }).returning();
    gabarits.push(t!.id);
  }
  seanceB = gabarits[1]!;

  // Six exercices, comme la séance réelle.
  for (let i = 0; i < 6; i += 1) {
    const [e] = await db.insert(schema.exercises).values({
      userId: null, nom: `Exercice ${i + 1}`, pilier: "P1_poussee",
      profilTension: "mi_range", type: "polyarticulaire", categorieRole: "pilier",
      musclesPrincipaux: ["pectoraux"], musclesSecondaires: [], equipement: "machine",
      slug: `ex-${i}-${U.slice(0, 8)}`,
    }).returning();
    const [inst] = await db.insert(schema.exerciseInstances).values({
      userId: U, exerciseId: e!.id, gymId: salle, machineNom: `Machine ${i + 1}`,
      conventionCharge: "pile_affichee", incrementsPossibles: [5], etat: "disponible",
    }).returning();
    instances.push(inst!.id);
  }

  // La séance A est close et porte des séries : c'est elle qui fait avancer la
  // rotation vers B, exactement comme le 6 septembre.
  const [faite] = await db.insert(schema.sessionLogs).values({
    userId: U, seanceTemplateId: gabarits[0]!, gymId: salle,
    date: "2026-09-05", dureeMinutes: 61,
  }).returning();
  sessionFaite = faite!.id;
  await db.insert(schema.setLogs).values(
    instances.slice(0, 2).map((id, n) => ({
      sessionLogId: sessionFaite, exerciseInstanceId: id,
      numeroSerie: n + 1, repsEffectuees: 8, charge: 20,
    })),
  );
});

describe("après une clôture, rien ne naît tout seul", () => {
  it("la clôture n'écrit qu'une séance, celle qu'on vient de faire", async () => {
    const avant = await seancesDe();

    // La vraie séance B : ouverte, remplie, close par la route de clôture.
    const [ouverte] = await db.insert(schema.sessionLogs).values({
      userId: U, seanceTemplateId: seanceB, gymId: salle, date: "2026-09-06",
    }).returning();

    const res = await cloture.PATCH(
      new Request("http://t/", {
        method: "PATCH",
        body: JSON.stringify({
          dureeMinutes: 61,
          energieFin: 6,
          notesSeance: "Léger mal de tête",
          series: instances.flatMap((id, i) => [
            { exerciseInstanceId: id, numeroSerie: 1, repsEffectuees: 9, charge: 20 + i, rpeEffectif: 7 },
            { exerciseInstanceId: id, numeroSerie: 2, repsEffectuees: 8, charge: 20 + i, rpeEffectif: 7 },
          ]),
        }),
      }),
      { params: Promise.resolve({ id: ouverte!.id }) },
    );
    expect(res.status).toBe(200);

    const apres = await seancesDe();
    // Une de plus que tout à l'heure : celle qu'on vient d'ouvrir et de clore.
    // Deux de plus voudrait dire qu'une séance est née de la clôture.
    expect(apres.length).toBe(avant.length + 1);

    const close = apres.find((s) => s.id === ouverte!.id);
    expect(close?.dureeMinutes).toBe(61);
  });

  it("les douze séries appartiennent à la séance close, et à elle seule", async () => {
    const seances = await seancesDe();
    const derniere = seances.find((s) => s.date === "2026-09-06");
    const series = await db.query.setLogs.findMany({
      where: eq(schema.setLogs.sessionLogId, derniere!.id),
    });
    expect(series).toHaveLength(12);
  });

  it("aucune séance vide ne traîne après la clôture", async () => {
    const seances = await seancesDe();
    const vides: string[] = [];
    for (const s of seances) {
      const n = await db.query.setLogs.findMany({
        where: eq(schema.setLogs.sessionLogId, s.id),
      });
      if (n.length === 0) vides.push(s.id);
    }
    expect(vides, "une séance vide est née sans qu'on la demande").toEqual([]);
  });

  it("la rotation n'avance que d'un cran", async () => {
    // A puis B ont été faites : la suivante est C. Si la clôture avait créé une
    // séance B fantôme et qu'elle comptait, on serait déjà ailleurs.
    const suite = await prochaineSeance(U);
    expect(suite?.template.lettre).toBe("C");
  });

  it("la semaine ne compte pas la séance deux fois", async () => {
    const accueil = await essentielTableauDeBord(U);
    // Les deux séances réelles des 5 et 6 septembre, pas davantage.
    expect(accueil.etat).toBeTruthy();
    const semaine = await db.query.sessionLogs.findMany({
      where: and(eq(schema.sessionLogs.userId, U)),
    });
    const datesRealisees = new Set(semaine.map((s) => s.date));
    expect([...datesRealisees].sort()).toEqual(["2026-09-05", "2026-09-06"]);
  });
});

describe("l'invariant de la PR #3 tient toujours", () => {
  it("une séance ouverte et vide reste reprenable", async () => {
    // Ce n'est PAS ce qu'on corrige : on corrige la création non demandée, pas
    // le concept de séance active vide. Une séance ouverte volontairement doit
    // continuer d'exister pour qu'on puisse y revenir.
    const [reprise] = await db.insert(schema.sessionLogs).values({
      userId: U, seanceTemplateId: seanceB, gymId: salle, date: "2026-09-07",
    }).returning();

    const lue = await db.query.sessionLogs.findFirst({
      where: eq(schema.sessionLogs.id, reprise!.id),
    });
    expect(lue).toBeTruthy();

    // Et elle ne compte pas comme faite : la rotation ne bouge pas.
    const suite = await prochaineSeance(U);
    expect(suite?.template.lettre).toBe("C");

    await db.delete(schema.sessionLogs).where(eq(schema.sessionLogs.id, reprise!.id));
  });
});
