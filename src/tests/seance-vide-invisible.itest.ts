import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Une séance ouverte mais vide n'est pas une séance faite.
 *
 * La ligne `session_logs` naît au DÉMARRAGE, pour porter le contexte du jour et
 * permettre la reprise après un rafraîchissement ou une reconnexion. C'est
 * voulu, et ce fichier commence par le vérifier : recommencer la même séance le
 * même jour reprend la ligne existante au lieu d'en créer une seconde.
 *
 * Le défaut était ailleurs : la moitié de l'application lisait cette ligne comme
 * la preuve d'un entraînement. Ouvrir l'écran puis ranger son téléphone
 * suffisait — le tableau de bord annonçait « c'est fait pour aujourd'hui », la
 * semaine comptait une séance, la rotation avançait d'une lettre, la
 * calibration croyait avoir de la matière. L'écran Progression, lui, restait
 * vide, parce qu'il partait des séries. Deux moitiés de l'application ne
 * racontaient pas le même entraînement.
 *
 * Ce fichier fixe la frontière : ACTIVE et RÉALISÉE sont deux choses
 * différentes. Une séance vide reste active — sinon on ne pourrait plus la
 * reprendre — mais elle n'est réalisée qu'à partir de la première série.
 */

const U = randomUUID();
const AUTRE = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({ getAuthenticatedUserId: async () => U }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: U, email: `${U}@t.test` } } }) },
  }),
}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { and, eq } = await import("drizzle-orm");
const { seancesRealisees } = await import("@/db/archivage");
const seances = await import("@/services/seances");
const bilan = await import("@/services/bilan");
const cycle = await import("@/services/cycle");
const programmes = await import("@/services/programmes");
const progression = await import("@/services/progression");

/** Un lundi figé : les semaines révolues sont alors nettes. */
const AUJOURDHUI = "2026-09-07";
const HIER = "2026-09-06";

let salle = "";
let exercice = "";
let instance = "";
let bloc = "";
let gabaritA = "";
let gabaritB = "";

/** Les séances que le moteur compte comme faites, pour ce compte. */
const realisees = () =>
  db.select({ id: schema.sessionLogs.id })
    .from(schema.sessionLogs)
    .where(seancesRealisees(U));

/** Valide une série sur une séance : c'est ce geste qui la rend réelle. */
const validerUneSerie = (sessionLogId: string, numero = 1) =>
  db.insert(schema.setLogs).values({
    sessionLogId, exerciseInstanceId: instance, numeroSerie: numero,
    repsEffectuees: 8, charge: 60, rpeEffectif: 8,
  });

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBeTruthy();

  for (const id of [U, AUTRE]) {
    await db.insert(schema.users).values({
      id, email: `${id}@t.test`, nom: "Testeur", onboardingTermineLe: new Date(),
      dureeSeanceCibleMinutes: 60,
      frequenceMinParSemaine: 1, frequenceCibleParSemaine: 3, frequenceMaxParSemaine: 4,
    });
  }

  const [g] = await db.insert(schema.gyms).values({
    userId: U, nom: `Salle ${U.slice(0, 8)}`, equipementsDisponibles: ["barre"],
  }).returning();
  salle = g!.id;

  const [e] = await db.insert(schema.exercises).values({
    userId: null, nom: "Développé couché", pilier: "P1_poussee", profilTension: "mi_range",
    type: "polyarticulaire", categorieRole: "pilier", musclesPrincipaux: ["pectoraux"],
    musclesSecondaires: [], equipement: "barre", slug: `dc-${U.slice(0, 8)}`,
  }).returning();
  exercice = e!.id;

  const [i] = await db.insert(schema.exerciseInstances).values({
    userId: U, exerciseId: exercice, gymId: salle, machineNom: `Banc ${U.slice(0, 8)}`,
    conventionCharge: "poids_total", incrementsPossibles: [2.5],
  }).returning();
  instance = i!.id;

  const [b] = await db.insert(schema.programmeBlocs).values({
    userId: U, nom: "Bloc", typeCycle: "accumulation", actif: true,
    dateDebut: "2026-08-31", dateFinPrevue: "2026-10-12",
  }).returning();
  bloc = b!.id;

  // Deux séances au programme : la rotation doit passer de A à B, mais
  // seulement quand A a réellement été faite.
  for (const [lettre, ordre] of [["A", 1], ["B", 2]] as const) {
    const [t] = await db.insert(schema.seanceTemplates).values({
      blocId: bloc, lettre, nom: `Séance ${lettre}`, ordreDansSemaine: ordre,
    }).returning();
    if (lettre === "A") gabaritA = t!.id; else gabaritB = t!.id;
    await db.insert(schema.exerciseInTemplate).values({
      seanceTemplateId: t!.id, exerciseInstanceId: instance, ordre: 1,
      seriesCibles: 3, fourchetteRepsMin: 6, fourchetteRepsMax: 10,
      rpeCible: 8, reposSecondes: 120,
    });
  }
});

let seanceVide = "";

describe("la ligne est créée au démarrage, et reprise ensuite", () => {
  it("un premier démarrage crée la séance", async () => {
    const s = await seances.creerSeance({
      userId: U, date: AUJOURDHUI, seanceTemplateId: gabaritA, gymId: salle,
    });
    seanceVide = s.id;
    expect(s.dureeMinutes).toBeNull();
    expect(s.archiveLe).toBeNull();
  });

  it("un second démarrage, même jour et même séance, REPREND la même ligne", async () => {
    // C'est la raison d'être de la création anticipée : un rafraîchissement,
    // un retour arrière ou une reconnexion ne doivent pas produire un doublon.
    const s = await seances.creerSeance({
      userId: U, date: AUJOURDHUI, seanceTemplateId: gabaritA, gymId: salle,
    });
    expect(s.id).toBe(seanceVide);

    const lignes = await db.$count(
      schema.sessionLogs,
      and(eq(schema.sessionLogs.userId, U), eq(schema.sessionLogs.date, AUJOURDHUI)),
    );
    expect(lignes).toBe(1);
  });

  it("elle est ACTIVE — c'est ce qui permet de la reprendre", async () => {
    const courante = await seances.seanceCourante(U, AUJOURDHUI);
    expect(courante?.id).toBe(seanceVide);
  });
});

describe("mais elle n'est pas RÉALISÉE", () => {
  it("aucune séance faite pour ce compte", async () => {
    expect(await realisees()).toHaveLength(0);
  });

  it("elle ne compte pas dans l'adhérence du bilan", async () => {
    const b = await bilan.bilanDeProgression(U, AUJOURDHUI);
    const total = (b.adherence?.seancesParSemaine ?? []).reduce((n, s) => n + s, 0);
    expect(total).toBe(0);
  });

  it("elle ne compte pas dans la calibration du cycle", async () => {
    const vue = await cycle.vueDuProgramme(U);
    expect(vue.cycle?.seancesFaites ?? 0).toBe(0);
  });

  it("elle ne fait pas avancer la rotation : la prochaine reste la séance A", async () => {
    const prochaine = await programmes.prochaineSeance(U);
    expect(prochaine?.template.id).toBe(gabaritA);
  });

  it("elle n'est pas la « dernière séance » du tableau de bord", async () => {
    const derniere = await db.query.sessionLogs.findFirst({ where: seancesRealisees(U) });
    expect(derniere).toBeUndefined();
  });

  it("elle ne rend pas l'utilisateur actif pour le précalcul nocturne", async () => {
    expect(await seances.utilisateursActifsDepuis("2026-09-01")).not.toContain(U);
  });

  it("et le feu de tendance n'a rien à lire", async () => {
    expect(await progression.feuDeTendance(U)).toBeNull();
  });
});

describe("la clôturer sans série est refusée", () => {
  it("lève SeanceSansSerie", async () => {
    await expect(
      seances.terminerSeance({
        userId: U, sessionLogId: seanceVide, dureeMinutes: 45, series: [],
      }),
    ).rejects.toThrow(seances.SeanceSansSerie);
  });

  it("et la route répond 422, pas 400 ni 500", async () => {
    const route = await import("@/app/api/session-logs/[id]/route");
    const res = await route.PATCH(
      new Request(`http://t/api/session-logs/${seanceVide}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dureeMinutes: 45, series: [] }),
      }),
      { params: Promise.resolve({ id: seanceVide }) },
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/sans série validée/);
  });

  it("la séance reste ouverte, donc reprenable", async () => {
    const s = await db.query.sessionLogs.findFirst({
      where: eq(schema.sessionLogs.id, seanceVide),
    });
    expect(s?.dureeMinutes).toBeNull();
    expect(s?.archiveLe).toBeNull();
    expect((await seances.seanceCourante(U, AUJOURDHUI))?.id).toBe(seanceVide);
  });
});

describe("dès la première série validée, elle compte", () => {
  beforeAll(async () => {
    // Par le vrai chemin : la clôture accepte, cette fois, parce qu'une série
    // est présente. C'est elle qui écrit `duree_minutes`, et la rotation exige
    // une séance CLÔTURÉE — désormais impossible sans série.
    await seances.terminerSeance({
      userId: U, sessionLogId: seanceVide, dureeMinutes: 55,
      series: [{ exerciseInstanceId: instance, numeroSerie: 1, repsEffectuees: 8, charge: 60 }],
    });
  });

  it("elle entre dans les séances réalisées", async () => {
    const r = await realisees();
    expect(r.map((x) => x.id)).toEqual([seanceVide]);
  });

  it("elle compte dans la calibration", async () => {
    const vue = await cycle.vueDuProgramme(U);
    expect(vue.cycle?.seancesFaites).toBe(1);
  });

  it("elle compte dans l'adhérence", async () => {
    const b = await bilan.bilanDeProgression(U, "2026-09-14");
    const total = (b.adherence?.seancesParSemaine ?? []).reduce((n, s) => n + s, 0);
    expect(total).toBe(1);
  });

  it("et la rotation passe à la séance suivante", async () => {
    const prochaine = await programmes.prochaineSeance(U);
    expect(prochaine?.template.id).toBe(gabaritB);
  });
});

describe("une séance archivée reste exclue, même avec des séries", () => {
  let archivee = "";

  beforeAll(async () => {
    const [s] = await db.insert(schema.sessionLogs).values({
      userId: U, date: HIER, seanceTemplateId: gabaritB, gymId: salle,
      dureeMinutes: 60, archiveLe: new Date(),
    }).returning();
    archivee = s!.id;
    await validerUneSerie(archivee, 1);
  });

  it("elle a bien des séries, et pourtant elle ne compte pas", async () => {
    expect(await db.$count(schema.setLogs, eq(schema.setLogs.sessionLogId, archivee))).toBe(1);
    const r = await realisees();
    expect(r.map((x) => x.id)).not.toContain(archivee);
    expect(r).toHaveLength(1);
  });

  it("et on ne peut pas la clôturer à nouveau", async () => {
    await expect(
      seances.terminerSeance({
        userId: U, sessionLogId: archivee, dureeMinutes: 60,
        series: [{ exerciseInstanceId: instance, numeroSerie: 1, repsEffectuees: 8, charge: 60 }],
      }),
    ).rejects.toThrow(seances.SeanceIntrouvable);
  });
});

describe("la frontière entre les comptes", () => {
  it("la séance réalisée d'un autre compte n'entre pas dans les nôtres", async () => {
    const [s] = await db.insert(schema.sessionLogs).values({
      userId: AUTRE, date: AUJOURDHUI, gymId: salle, dureeMinutes: 50,
    }).returning();
    await db.insert(schema.setLogs).values({
      sessionLogId: s!.id, exerciseInstanceId: instance, numeroSerie: 1,
      repsEffectuees: 5, charge: 100,
    });

    const miennes = await realisees();
    expect(miennes.map((x) => x.id)).not.toContain(s!.id);
    expect(miennes).toHaveLength(1);
  });

  it("efface ce que ce fichier a écrit", async () => {
    const toutes = await db.query.sessionLogs.findMany({
      where: (sl, { inArray }) => inArray(sl.userId, [U, AUTRE]),
    });
    for (const s of toutes) {
      await db.delete(schema.setLogs).where(eq(schema.setLogs.sessionLogId, s.id));
      await db.delete(schema.sessionPlanItems)
        .where(eq(schema.sessionPlanItems.sessionLogId, s.id));
      await db.delete(schema.sessionLogs).where(eq(schema.sessionLogs.id, s.id));
    }
    for (const g of [gabaritA, gabaritB]) {
      await db.delete(schema.exerciseInTemplate)
        .where(eq(schema.exerciseInTemplate.seanceTemplateId, g));
      await db.delete(schema.seanceTemplates).where(eq(schema.seanceTemplates.id, g));
    }
    await db.delete(schema.programmeBlocs).where(eq(schema.programmeBlocs.id, bloc));
    await db.delete(schema.exerciseInstances).where(eq(schema.exerciseInstances.gymId, salle));
    await db.delete(schema.gyms).where(eq(schema.gyms.id, salle));
    await db.delete(schema.exercises).where(eq(schema.exercises.id, exercice));
    for (const id of [U, AUTRE]) {
      await db.delete(schema.users).where(eq(schema.users.id, id));
    }
    expect(true).toBe(true);
  });
});
