import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Le prescrit et le réalisé, de bout en bout.
 *
 * Trois défauts sont vérifiés ici, et le premier explique pourquoi
 * `repos_reel_secondes` était vide sur tout l'historique mesuré :
 *
 *   1. `session_plan_items.repos_secondes` recevait la valeur BRUTE du gabarit
 *      alors que le même champ était défaulté à 120 s soixante-dix lignes plus
 *      haut pour l'ajustement de volume. Un gabarit sans repos renseigné rendait
 *      donc `null`, le chronomètre ne démarrait jamais, et aucune série de la
 *      séance n'était mesurée.
 *
 *   2. Fermer le minuteur effaçait l'instant de départ : masquer un affichage
 *      détruisait la mesure en cours.
 *
 *   3. Un repos entamé sur un exercice pouvait être attribué au suivant.
 *
 * Les deux derniers vivent dans le client ; ils sont couverts par les tests
 * unitaires du store et par la garde de `TableauSeries`. Ici on vérifie ce qui
 * traverse la base.
 */

const SACHA = randomUUID();
const MARIA = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({ getAuthenticatedUserId: async () => SACHA }));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { and, eq, asc } = await import("drizzle-orm");
const { construireSeanceDuJour, REPOS_PAR_DEFAUT_SECONDES } = await import("@/services/plan-seance");
const { executionReelle } = await import("@/lib/engine/execution-reelle");

let salle = "";
let exercice = "";
let machine = "";
let bloc = "";

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBeTruthy();

  for (const id of [SACHA, MARIA]) {
    await db.insert(schema.users).values({ id, email: `${id}@t.test` });
  }
  const [g] = await db.insert(schema.gyms).values({
    userId: SACHA, nom: `Salle ${SACHA.slice(0, 8)}`,
  }).returning();
  salle = g!.id;

  const [e] = await db.insert(schema.exercises).values({
    userId: null, nom: "Leg Extension", pilier: "P3_squat", profilTension: "contract",
    type: "isolation", categorieRole: "accessoire", musclesPrincipaux: ["quadriceps"],
    musclesSecondaires: [], equipement: "machine", slug: `le-${SACHA.slice(0, 8)}`,
  }).returning();
  exercice = e!.id;

  const [i] = await db.insert(schema.exerciseInstances).values({
    userId: SACHA, exerciseId: exercice, gymId: salle,
    machineNom: `Matrix ${SACHA.slice(0, 6)}`,
    conventionCharge: "pile_affichee", incrementsPossibles: [2.5],
  }).returning();
  machine = i!.id;

  const [b] = await db.insert(schema.programmeBlocs).values({
    userId: SACHA, nom: "Bloc", dateDebut: "2026-01-01", typeCycle: "charge", actif: true,
  }).returning();
  bloc = b!.id;
});

/** Un gabarit, avec ou sans repos prescrit, puis la séance du jour construite. */
async function planAvecRepos(entrees: {
  date: string;
  reposSecondes: number | null;
  rpeCible?: number | null;
  tempo?: string | null;
}) {
  const [gabarit] = await db.insert(schema.seanceTemplates).values({
    blocId: bloc, lettre: "A", nom: `S ${entrees.date}`, ordreDansSemaine: 1,
  }).returning();
  await db.insert(schema.exerciseInTemplate).values({
    seanceTemplateId: gabarit!.id, exerciseInstanceId: machine, ordre: 1,
    seriesCibles: 3, fourchetteRepsMin: 6, fourchetteRepsMax: 8,
    reposSecondes: entrees.reposSecondes,
    rpeCible: entrees.rpeCible ?? null,
    tempo: entrees.tempo ?? null,
  });
  const { seance } = await construireSeanceDuJour({
    userId: SACHA, seanceTemplateId: gabarit!.id, gymId: salle, date: entrees.date,
  });
  const [ligne] = await db.select().from(schema.sessionPlanItems)
    .where(and(
      eq(schema.sessionPlanItems.sessionLogId, seance.id),
      eq(schema.sessionPlanItems.exerciseInstanceId, machine),
    ))
    .orderBy(asc(schema.sessionPlanItems.ordre));
  return { sessionLogId: seance.id, ligne: ligne! };
}

describe("le repos prescrit atteint toujours la séance", () => {
  it("un gabarit SANS repos reçoit le défaut, sinon le chronomètre ne démarre jamais", async () => {
    // Le défaut qui vidait la colonne : sans cette valeur, `lancerRepos` sort
    // immédiatement et aucune série de la séance n'est mesurée.
    const { ligne } = await planAvecRepos({ date: "2026-07-01", reposSecondes: null });
    expect(ligne.reposSecondes).toBe(REPOS_PAR_DEFAUT_SECONDES);
    expect(ligne.reposSecondes).toBeGreaterThan(0);
  });

  it("un gabarit AVEC repos garde le sien, le défaut ne l'écrase pas", async () => {
    const { ligne } = await planAvecRepos({ date: "2026-07-08", reposSecondes: 90 });
    expect(ligne.reposSecondes).toBe(90);
  });

  it("la cible d'effort et le tempo prescrit traversent aussi", async () => {
    const { ligne } = await planAvecRepos({
      date: "2026-07-15", reposSecondes: 120, rpeCible: 7, tempo: "3-0-1-0",
    });
    expect(ligne.rpeCible).toBe(7);
    expect(ligne.tempo).toBe("3-0-1-0");
  });
});

describe("les faits d'exécution, lus depuis la base", () => {
  /** Enregistre des séries sur une séance déjà planifiée. */
  async function series(sessionLogId: string, lignes: Array<{
    reps: number; charge: number; rpe?: number | null;
    tempoRespecte?: boolean | null; reposReelSecondes?: number | null;
  }>) {
    await db.insert(schema.setLogs).values(lignes.map((l, i) => ({
      sessionLogId, exerciseInstanceId: machine, numeroSerie: i + 1,
      repsEffectuees: l.reps, charge: l.charge,
      rpeEffectif: l.rpe ?? null,
      tempoRespecte: l.tempoRespecte ?? null,
      reposReelSecondes: l.reposReelSecondes ?? null,
    })));
  }

  /** Relit la séance telle que le Coach la lira, puis calcule les faits. */
  async function faitsDe(sessionLogId: string) {
    const [plan] = await db.select().from(schema.sessionPlanItems)
      .where(and(
        eq(schema.sessionPlanItems.sessionLogId, sessionLogId),
        eq(schema.sessionPlanItems.exerciseInstanceId, machine),
      ));
    const sets = await db.select().from(schema.setLogs)
      .where(and(
        eq(schema.setLogs.sessionLogId, sessionLogId),
        eq(schema.setLogs.exerciseInstanceId, machine),
      ))
      .orderBy(asc(schema.setLogs.numeroSerie));
    return executionReelle({
      seriesAttendues: plan?.seriesCibles,
      rpeCible: plan?.rpeCible,
      tempoPrescrit: plan?.tempo,
      reposPrescritSecondes: plan?.reposSecondes,
      series: sets.map((s) => ({
        rpe: s.rpeEffectif,
        tempoRespecte: s.tempoRespecte,
        reposReelSecondes: s.reposReelSecondes,
      })),
    });
  }

  it("séance renseignée : les quatre faits sortent de la base", async () => {
    const { sessionLogId } = await planAvecRepos({
      date: "2026-08-01", reposSecondes: 120, rpeCible: 8, tempo: "3-0-1-0",
    });
    await series(sessionLogId, [
      // La première série n'a rien avant elle : son intervalle est nul, et ce
      // n'est pas un trou.
      { reps: 8, charge: 80, rpe: 9, tempoRespecte: false, reposReelSecondes: null },
      { reps: 8, charge: 80, rpe: 9, tempoRespecte: false, reposReelSecondes: 140 },
      { reps: 8, charge: 80, rpe: 9, tempoRespecte: false, reposReelSecondes: 160 },
    ]);

    const f = await faitsDe(sessionLogId);
    expect(f.volume).toMatchObject({ attendues: 3, realisees: 3, etat: "complete" });
    expect(f.effort).toMatchObject({ rpeCible: 8, rpeReel: 9, ecartRpe: 1 });
    expect(f.tempo).toMatchObject({ prescrit: "3-0-1-0", respecte: false });
    expect(f.repos).toMatchObject({ prescritSecondes: 120, observeSecondes: 150, ecartSecondes: 30, ecartPourcent: 25 });
  });

  it("séance ancienne, colonnes nulles : tout est inconnu et rien ne casse", async () => {
    const { sessionLogId } = await planAvecRepos({ date: "2026-08-08", reposSecondes: 120 });
    await series(sessionLogId, [
      { reps: 8, charge: 80 },
      { reps: 8, charge: 80 },
      { reps: 8, charge: 80 },
    ]);
    const f = await faitsDe(sessionLogId);
    expect(f.effort.ecartRpe).toBeNull();
    expect(f.tempo.respecte).toBeNull();
    expect(f.repos.observeSecondes).toBeNull();
    expect(f.repos.ecartSecondes).toBeNull();
    // Le volume, lui, reste connu : il ne dépend d'aucun signal nouveau.
    expect(f.volume.etat).toBe("complete");
  });

  it("volume incomplet : le fait le dit, exactement comme PR #5", async () => {
    const { sessionLogId } = await planAvecRepos({ date: "2026-08-15", reposSecondes: 120 });
    await series(sessionLogId, [{ reps: 8, charge: 80 }]);
    const f = await faitsDe(sessionLogId);
    expect(f.volume).toMatchObject({ attendues: 3, realisees: 1, etat: "incomplete" });
  });

  it("un timer inexploitable ne devient jamais zéro seconde", async () => {
    const { sessionLogId } = await planAvecRepos({ date: "2026-08-22", reposSecondes: 120 });
    await series(sessionLogId, [
      { reps: 8, charge: 80, reposReelSecondes: null },
      { reps: 8, charge: 80, reposReelSecondes: null },
    ]);
    const f = await faitsDe(sessionLogId);
    expect(f.repos.observeSecondes).toBeNull();
    expect(f.repos.observeSecondes).not.toBe(0);
  });
});

describe("l'isolation et la progression ne bougent pas", () => {
  it("les faits d'un compte ne se mélangent pas à ceux d'un autre", async () => {
    const { sessionLogId } = await planAvecRepos({ date: "2026-09-01", reposSecondes: 120, rpeCible: 8 });
    await db.insert(schema.setLogs).values([
      { sessionLogId, exerciseInstanceId: machine, numeroSerie: 1, repsEffectuees: 8, charge: 80, rpeEffectif: 9 },
    ]);

    // Maria s'entraîne sur la même machine du parc partagé, sans plan.
    const [sienne] = await db.insert(schema.sessionLogs).values({
      userId: MARIA, date: "2026-09-01", gymId: salle, dureeMinutes: 50,
    }).returning();
    await db.insert(schema.setLogs).values([
      { sessionLogId: sienne!.id, exerciseInstanceId: machine, numeroSerie: 1, repsEffectuees: 12, charge: 40, rpeEffectif: 6 },
    ]);

    const [planSacha] = await db.select().from(schema.sessionPlanItems)
      .where(eq(schema.sessionPlanItems.sessionLogId, sessionLogId));
    const [planMaria] = await db.select().from(schema.sessionPlanItems)
      .where(eq(schema.sessionPlanItems.sessionLogId, sienne!.id));

    expect(planSacha?.rpeCible).toBe(8);
    // Aucune ligne de plan pour Maria : ses faits d'effort sont inconnus, pas
    // empruntés à Sacha.
    expect(planMaria).toBeUndefined();
  });

  it("la charge suggérée reste celle de PR #5, insensible aux nouveaux signaux", async () => {
    // Une référence complète au maximum monte la charge, que le tempo soit
    // signalé non tenu ou que le repos ait doublé. Ces faits ne décident rien.
    const { sessionLogId } = await planAvecRepos({
      date: "2026-10-01", reposSecondes: 120, rpeCible: 8, tempo: "3-0-1-0",
    });
    await db.insert(schema.setLogs).values(
      Array.from({ length: 3 }, (_, i) => ({
        sessionLogId, exerciseInstanceId: machine, numeroSerie: i + 1,
        repsEffectuees: 8, charge: 80, rpeEffectif: 8,
        tempoRespecte: false, reposReelSecondes: 400,
      })),
    );

    const { ligne } = await planAvecRepos({ date: "2026-10-08", reposSecondes: 120 });
    expect(ligne.chargeSuggeree).toBe(82.5);
    expect(ligne.messageProgression).toContain("Fourchette complétée");
  });
});
