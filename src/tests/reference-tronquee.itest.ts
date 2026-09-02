import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * La référence de progression doit porter les séries qu'on lui avait demandées.
 *
 * `computeNextSets` évaluait sa complétion sur les séries PRÉSENTES : une seule
 * série au haut de fourchette suffisait à conclure « fourchette complétée » et à
 * monter la charge, alors que deux séries n'avaient jamais eu lieu. Le moteur
 * prescrivait donc plus lourd à partir d'une séance interrompue.
 *
 * Le nombre attendu est `session_plan_items.series_cibles` de la séance de
 * référence — donc APRÈS les adaptations déterministes de volume. Une réduction
 * décidée par le moteur est une prescription légitime : qui l'a respectée a fait
 * ce qu'on lui demandait, et lui compter la série retirée serait faux.
 *
 * Ce fichier vérifie la chaîne complète — `set_logs` → `derniereSeriesPour` →
 * `computeNextSets` → `session_plan_items.charge_suggeree` — et surtout les deux
 * façons dont elle pourrait mal tourner : une séance sans plan qui bloquerait la
 * progression, et une sous-requête qui dupliquerait les séries de la référence.
 */

const SACHA = randomUUID();
const MARIA = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({ getAuthenticatedUserId: async () => SACHA }));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { and, eq, asc } = await import("drizzle-orm");
const { derniereSeriesPour, construireSeanceDuJour } = await import("@/services/plan-seance");

let salle = "";
let exercice = "";
let machine = "";
let bloc = "";

/** Une séance close, avec son plan et ses séries. Le socle de tous les cas. */
async function seance(entrees: {
  userId: string;
  date: string;
  /** Séries réellement enregistrées. */
  faites: number;
  /** `series_cibles` du plan, c'est-à-dire ce qui était demandé ce jour-là. */
  demandees: number | null;
  reps: number;
  charge: number;
  instance?: string;
  /** Pour le cas « plusieurs lignes de plan sur le même couple ». */
  lignesDePlan?: number;
}) {
  const instance = entrees.instance ?? machine;
  const [s] = await db.insert(schema.sessionLogs).values({
    userId: entrees.userId, date: entrees.date, gymId: salle, dureeMinutes: 60,
  }).returning();

  if (entrees.demandees !== null) {
    for (let n = 0; n < (entrees.lignesDePlan ?? 1); n += 1) {
      await db.insert(schema.sessionPlanItems).values({
        sessionLogId: s!.id, ordre: n + 1, exerciseInstanceId: instance,
        seriesCibles: entrees.demandees,
        seriesPrevuesAvantAjustement: 3,
        fourchetteRepsMin: 6, fourchetteRepsMax: 8,
      });
    }
  }

  if (entrees.faites > 0) {
    await db.insert(schema.setLogs).values(
      Array.from({ length: entrees.faites }, (_, i) => ({
        sessionLogId: s!.id, exerciseInstanceId: instance,
        numeroSerie: i + 1, repsEffectuees: entrees.reps, charge: entrees.charge,
      })),
    );
  }
  return s!.id;
}

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

describe("le nombre de séries attendu remonte jusqu'au moteur", () => {
  it("il est lu sur la ligne de plan de la séance de référence", async () => {
    await seance({ userId: SACHA, date: "2026-03-01", faites: 1, demandees: 3, reps: 8, charge: 80 });
    const r = await derniereSeriesPour(SACHA, machine);
    expect(r?.sets).toHaveLength(1);
    expect(r?.seriesAttendues).toBe(3);
  });

  it("il vaut le nombre APRÈS ajustement de volume, pas celui d'avant", async () => {
    // La ligne porte series_cibles = 2 et series_prevues_avant_ajustement = 3.
    // C'est 2 qu'on doit lire : c'est ce qui a réellement été demandé.
    await seance({ userId: SACHA, date: "2026-03-08", faites: 2, demandees: 2, reps: 8, charge: 80 });
    const r = await derniereSeriesPour(SACHA, machine);
    expect(r?.seriesAttendues).toBe(2);
  });

  it("il est nul quand la séance n'a aucune ligne de plan", async () => {
    // Le chemin de repli POST /api/sessions : la séance existe, le plan non.
    await seance({ userId: SACHA, date: "2026-03-15", faites: 3, demandees: null, reps: 8, charge: 80 });
    const r = await derniereSeriesPour(SACHA, machine);
    expect(r?.sets).toHaveLength(3);
    expect(r?.seriesAttendues).toBeNull();
  });

  it("plusieurs lignes de plan sur le même couple ne dupliquent aucune série", async () => {
    // Rien ne garantit l'unicité de (session_log_id, exercise_instance_id) :
    // une jointure aurait rendu six séries au lieu de trois, et le comptage que
    // ce chantier corrige aurait été faussé par sa propre lecture.
    await seance({
      userId: SACHA, date: "2026-03-22", faites: 3, demandees: 3, reps: 8, charge: 80,
      lignesDePlan: 2,
    });
    const r = await derniereSeriesPour(SACHA, machine);
    expect(r?.sets).toHaveLength(3);
    expect(r?.seriesAttendues).toBe(3);
  });
});

describe("bout en bout : la charge suggérée de la séance suivante", () => {
  /** Construit la séance du jour et rend la ligne de plan de notre machine. */
  async function planDuJour(date: string) {
    const [gabarit] = await db.insert(schema.seanceTemplates).values({
      blocId: bloc, lettre: "A", nom: `Séance ${date}`, ordreDansSemaine: 1,
    }).returning();
    await db.insert(schema.exerciseInTemplate).values({
      seanceTemplateId: gabarit!.id, exerciseInstanceId: machine, ordre: 1,
      seriesCibles: 3, fourchetteRepsMin: 6, fourchetteRepsMax: 8,
    });
    const { seance: creee } = await construireSeanceDuJour({
      userId: SACHA, seanceTemplateId: gabarit!.id, gymId: salle, date,
    });
    const [ligne] = await db.select().from(schema.sessionPlanItems)
      .where(and(
        eq(schema.sessionPlanItems.sessionLogId, creee.id),
        eq(schema.sessionPlanItems.exerciseInstanceId, machine),
      ))
      .orderBy(asc(schema.sessionPlanItems.ordre));
    return ligne!;
  }

  /** Efface l'historique de la machine entre deux scénarios. */
  async function repartirDeZero() {
    const nôtres = await db.select({ id: schema.sessionLogs.id })
      .from(schema.sessionLogs).where(eq(schema.sessionLogs.userId, SACHA));
    const ids = nôtres.map((s) => s.id);
    for (const id of ids) {
      await db.delete(schema.setLogs).where(eq(schema.setLogs.sessionLogId, id));
      await db.delete(schema.sessionPlanItems).where(eq(schema.sessionPlanItems.sessionLogId, id));
    }
    await db.delete(schema.sessionLogs).where(eq(schema.sessionLogs.userId, SACHA));
  }

  it("référence 1/3 au maximum : la charge ne monte pas", async () => {
    await repartirDeZero();
    await seance({ userId: SACHA, date: "2026-04-01", faites: 1, demandees: 3, reps: 8, charge: 80 });
    const ligne = await planDuJour("2026-04-08");
    expect(ligne.chargeSuggeree).toBe(80);
    expect(ligne.messageProgression).toContain("1 série sur 3");
  });

  it("référence 3/3 au maximum : la charge monte", async () => {
    await repartirDeZero();
    await seance({ userId: SACHA, date: "2026-04-15", faites: 3, demandees: 3, reps: 8, charge: 80 });
    const ligne = await planDuJour("2026-04-22");
    expect(ligne.chargeSuggeree).toBe(82.5);
    expect(ligne.messageProgression).toContain("Fourchette complétée");
  });

  it("volume réduit à 2, deux séries faites : la charge monte", async () => {
    await repartirDeZero();
    await seance({ userId: SACHA, date: "2026-05-01", faites: 2, demandees: 2, reps: 8, charge: 80 });
    const ligne = await planDuJour("2026-05-08");
    expect(ligne.chargeSuggeree).toBe(82.5);
  });

  it("référence sans plan : comportement historique, la charge monte", async () => {
    await repartirDeZero();
    await seance({ userId: SACHA, date: "2026-05-15", faites: 1, demandees: null, reps: 8, charge: 80 });
    const ligne = await planDuJour("2026-05-22");
    expect(ligne.chargeSuggeree).toBe(82.5);
  });
});

describe("l'isolation ne bouge pas", () => {
  it("la référence d'un compte n'est jamais celle d'un autre sur la même machine", async () => {
    // Le parc est partagé : Maria s'entraîne sur la machine décrite par Sacha.
    await db.delete(schema.setLogs).where(eq(schema.setLogs.exerciseInstanceId, machine));
    await seance({ userId: MARIA, date: "2026-06-01", faites: 3, demandees: 3, reps: 8, charge: 40 });

    const pourSacha = await derniereSeriesPour(SACHA, machine);
    expect(pourSacha).toBeNull();

    const pourMaria = await derniereSeriesPour(MARIA, machine);
    expect(pourMaria?.sets).toHaveLength(3);
    expect(pourMaria?.sets[0]!.charge).toBe(40);
    expect(pourMaria?.seriesAttendues).toBe(3);
  });

  it("une séance archivée ne sert jamais de référence", async () => {
    const id = await seance({
      userId: MARIA, date: "2026-06-08", faites: 3, demandees: 3, reps: 8, charge: 60,
    });
    await db.update(schema.sessionLogs)
      .set({ archiveLe: new Date() })
      .where(eq(schema.sessionLogs.id, id));

    // La référence redevient celle du 1er juin : l'archivée est ignorée.
    const r = await derniereSeriesPour(MARIA, machine);
    expect(r?.sets[0]!.charge).toBe(40);
  });
});
