import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Abandonner une séance, et n'en avoir jamais deux ouvertes.
 *
 * Le bouton « Abandonner » du tableau de bord ne faisait qu'un `clear()` du
 * store React. La ligne `session_logs` restait ouverte en base : au
 * rechargement suivant « Séance en cours — 0 séries enregistrées »
 * réapparaissait, et chaque nouvelle tentative en créait une de plus. C'est
 * l'origine des séances fantômes et du « 4 séances cette semaine ».
 */

const MOI = randomUUID();
const AUTRE = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({ getAuthenticatedUserId: async () => MOI }));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { eq } = await import("drizzle-orm");
const {
  abandonnerSeance, seanceOuverte, creerSeance,
  SeanceIntrouvable, SeanceNonVide,
} = await import("@/services/seances");

let salle = "";
let gabarit = "";
let instance = "";

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBeTruthy();

  for (const id of [MOI, AUTRE]) {
    await db.insert(schema.users).values({
      id, email: `${id}@t.test`, nom: "Testeur", onboardingTermineLe: new Date(),
    });
  }

  const [g] = await db.insert(schema.gyms).values({ userId: MOI, nom: `Salle ${MOI.slice(0, 8)}` }).returning();
  salle = g!.id;

  const [ex] = await db.insert(schema.exercises).values({
    userId: null, nom: "Lat Pulldown", pilier: "P2_tirage", profilTension: "mi_range",
    type: "polyarticulaire", categorieRole: "pilier",
    musclesPrincipaux: ["dorsaux"], musclesSecondaires: [],
    equipement: "machine", slug: `lat-${MOI.slice(0, 8)}`,
  }).returning();
  const [i] = await db.insert(schema.exerciseInstances).values({
    userId: MOI, exerciseId: ex!.id, gymId: salle, machineNom: "Poste",
    conventionCharge: "pile_affichee", etat: "disponible",
  }).returning();
  instance = i!.id;

  const [bloc] = await db.insert(schema.programmeBlocs).values({
    userId: MOI, nom: "Bloc", dateDebut: "2026-09-01", typeCycle: "calibration", actif: true,
  }).returning();
  const [t] = await db.insert(schema.seanceTemplates).values({
    blocId: bloc!.id, lettre: "A", nom: "Séance A", ordreDansSemaine: 1,
  }).returning();
  gabarit = t!.id;

  await db.insert(schema.exerciseInTemplate).values({
    seanceTemplateId: gabarit, exerciseInstanceId: instance, ordre: 1,
    seriesCibles: 2, fourchetteRepsMin: 8, fourchetteRepsMax: 12, reposSecondes: 120,
  });
});

describe("8 — abandonner une séance vide fonctionne, et ne touche à rien d'autre", () => {
  it("la ligne et son plan disparaissent", async () => {
    const seance = await creerSeance({
      userId: MOI, date: "2026-09-11", seanceTemplateId: gabarit, gymId: salle,
    });
    await db.insert(schema.sessionPlanItems).values({
      sessionLogId: seance.id, ordre: 1, exerciseInstanceId: instance,
      seriesCibles: 2, fourchetteRepsMin: 8, fourchetteRepsMax: 12, statut: "prevu",
    });

    await abandonnerSeance(MOI, seance.id);

    expect(await db.query.sessionLogs.findFirst({
      where: eq(schema.sessionLogs.id, seance.id),
    })).toBeUndefined();
    expect(await db.query.sessionPlanItems.findMany({
      where: eq(schema.sessionPlanItems.sessionLogId, seance.id),
    })).toHaveLength(0);
  });

  it("le gabarit, le bloc et l'inventaire ne bougent pas", async () => {
    const lignes = await db.query.exerciseInTemplate.findMany({
      where: eq(schema.exerciseInTemplate.seanceTemplateId, gabarit),
    });
    expect(lignes).toHaveLength(1);
    expect(lignes[0]?.archiveLe).toBeNull();

    const bloc = await db.query.programmeBlocs.findFirst({
      where: eq(schema.programmeBlocs.userId, MOI),
    });
    expect(bloc?.actif).toBe(true);
    expect(bloc?.archiveLe).toBeNull();

    const machines = await db.query.exerciseInstances.findMany({
      where: eq(schema.exerciseInstances.gymId, salle),
    });
    expect(machines).toHaveLength(1);
    expect(machines[0]?.etat).toBe("disponible");
  });

  it("une séance qui porte des séries est refusée, pas effacée", async () => {
    const seance = await creerSeance({
      userId: MOI, date: "2026-09-12", seanceTemplateId: gabarit, gymId: salle,
    });
    await db.insert(schema.setLogs).values({
      sessionLogId: seance.id, exerciseInstanceId: instance,
      numeroSerie: 1, repsEffectuees: 10, charge: 45,
    });

    await expect(abandonnerSeance(MOI, seance.id)).rejects.toBeInstanceOf(SeanceNonVide);
    expect(await db.query.sessionLogs.findFirst({
      where: eq(schema.sessionLogs.id, seance.id),
    })).toBeDefined();

    // Elle reste ouverte, et c'est bien ce qu'on veut : l'athlète doit la
    // terminer. On la clôture ici pour que les cas suivants partent au propre.
    await db.update(schema.sessionLogs)
      .set({ dureeMinutes: 40 })
      .where(eq(schema.sessionLogs.id, seance.id));
  });

  it("la séance d'un autre compte est intouchable", async () => {
    const sienne = await creerSeance({ userId: AUTRE, date: "2026-09-13" });
    await expect(abandonnerSeance(MOI, sienne.id)).rejects.toBeInstanceOf(SeanceIntrouvable);
    expect(await db.query.sessionLogs.findFirst({
      where: eq(schema.sessionLogs.id, sienne.id),
    })).toBeDefined();
  });
});

describe("7 — une seule séance ouverte par compte", () => {
  it("relancer la même séance reprend au lieu de recréer", async () => {
    const a = await creerSeance({
      userId: MOI, date: "2026-09-14", seanceTemplateId: gabarit, gymId: salle,
    });
    const b = await creerSeance({
      userId: MOI, date: "2026-09-14", seanceTemplateId: gabarit, gymId: salle,
    });
    expect(b.id).toBe(a.id);

    await abandonnerSeance(MOI, a.id);
  });

  it("la séance ouverte du compte est celle qu'on retrouve", async () => {
    const seance = await creerSeance({
      userId: MOI, date: "2026-09-15", seanceTemplateId: gabarit, gymId: salle,
    });
    const ouverte = await seanceOuverte(MOI);
    expect(ouverte?.id).toBe(seance.id);

    await abandonnerSeance(MOI, seance.id);
    expect(await seanceOuverte(MOI)).toBeNull();
  });

  it("une séance clôturée n'est plus ouverte", async () => {
    const seance = await creerSeance({
      userId: MOI, date: "2026-09-16", seanceTemplateId: gabarit, gymId: salle,
    });
    await db.update(schema.sessionLogs)
      .set({ dureeMinutes: 45 })
      .where(eq(schema.sessionLogs.id, seance.id));

    expect(await seanceOuverte(MOI)).toBeNull();
  });

  it("l'ouverte d'un compte n'est jamais celle d'un autre", async () => {
    const sienne = await creerSeance({ userId: AUTRE, date: "2026-09-17" });
    expect(await seanceOuverte(MOI)).toBeNull();
    expect((await seanceOuverte(AUTRE))?.id).toBe(sienne.id);
  });
});
