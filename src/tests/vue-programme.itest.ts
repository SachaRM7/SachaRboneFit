import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * L'écran Programme, contre une vraie base.
 *
 * Le moteur est testé unitairement. Ce qui se vérifie ici est ce qu'il ne peut
 * pas voir : que les gabarits, les séances faites et les substitutions
 * remontent réellement, que la calibration n'est pas présentée comme un cycle
 * construit, et qu'un bloc enregistré sous l'ancien vocabulaire reste lisible
 * sans être réécrit.
 */

const U = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({ getAuthenticatedUserId: async () => U }));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { eq } = await import("drizzle-orm");
const { vueDuProgramme, mesurerCycle } = await import("@/services/cycle");
const { loadCoachContext } = await import("@/lib/coach/context-loader");
const { buildSystemPrompt } = await import("@/lib/coach/system-prompt");
const { lundiDe, decalerDe } = await import("@/lib/semaines");

const AUJOURDHUI = "2026-08-05"; // mercredi
const LUNDI = "2026-08-03";

let salle = "";
let exoA = "";
let exoB = "";
let instA = "";
let instB = "";
let blocId = "";
const templates: string[] = [];

const creerExercice = async (nom: string, pilier: string) => {
  const [e] = await db
    .insert(schema.exercises)
    .values({
      userId: null, nom, pilier, profilTension: "mi_range", type: "polyarticulaire",
      categorieRole: "pilier", musclesPrincipaux: ["pectoraux"], musclesSecondaires: [],
      equipement: "barre", slug: `${nom.toLowerCase().replace(/[^a-z]/g, "-")}-${U.slice(0, 8)}`,
    })
    .returning();
  return e!.id;
};

/** Crée un bloc actif avec deux gabarits de trois exercices. */
const creerBloc = async (typeCycle: string, dateDebut: string, dateFinPrevue: string | null = null) => {
  const [b] = await db
    .insert(schema.programmeBlocs)
    .values({ userId: U, nom: `Bloc ${typeCycle}`, dateDebut, dateFinPrevue, typeCycle, actif: true })
    .returning();
  blocId = b!.id;

  for (const [i, lettre] of ["A", "B"].entries()) {
    const [t] = await db
      .insert(schema.seanceTemplates)
      .values({ blocId: b!.id, lettre, nom: `Séance ${lettre}`, ordreDansSemaine: i + 1 })
      .returning();
    templates.push(t!.id);
    await db.insert(schema.exerciseInTemplate).values(
      [instA, instB, instA].map((instanceId, ordre) => ({
        seanceTemplateId: t!.id,
        exerciseInstanceId: instanceId,
        ordre: ordre + 1,
        seriesCibles: 3,
        fourchetteRepsMin: 8,
        fourchetteRepsMax: 12,
        reposSecondes: 120,
      })),
    );
  }
  return b!.id;
};

const enregistrerSeance = async (date: string, templateId: string | null, substitution = false) => {
  const [s] = await db
    .insert(schema.sessionLogs)
    .values({ userId: U, date, seanceTemplateId: templateId, dureeMinutes: 55 })
    .returning();
  await db.insert(schema.setLogs).values({
    sessionLogId: s!.id, exerciseInstanceId: instA, numeroSerie: 1,
    repsEffectuees: 10, charge: 60, rpeEffectif: 8,
  });
  if (substitution) {
    await db.insert(schema.sessionPlanItems).values({
      sessionLogId: s!.id, ordre: 1,
      exerciseInstanceId: instB,
      exerciseInstancePrevuId: instA,
      contexteAdaptation: { type: "changement_lieu", lieuApresNom: "Maison" },
      raisonSubstitution: "Banc indisponible à Maison.",
      seriesCibles: 3, fourchetteRepsMin: 8, fourchetteRepsMax: 12,
    });
  }
  return s!.id;
};

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBeTruthy();
  await db.insert(schema.users).values({
    id: U, email: `${U}@t.test`, nom: "Testeur", onboardingTermineLe: new Date(),
  });
  exoA = await creerExercice("Developpe couche", "P1_poussee");
  exoB = await creerExercice("Pompes", "P1_poussee");
  const [g] = await db.insert(schema.gyms).values({ userId: U, nom: `Salle ${U.slice(0, 8)}` }).returning();
  salle = g!.id;
  const inst = await db.insert(schema.exerciseInstances).values([
    { userId: U, exerciseId: exoA, gymId: salle, machineNom: "Banc", conventionCharge: "poids_total", incrementsPossibles: [2.5] },
    { userId: U, exerciseId: exoB, gymId: salle, machineNom: "Sol", conventionCharge: "poids_du_corps", incrementsPossibles: [] },
  ]).returning();
  instA = inst[0]!.id;
  instB = inst[1]!.id;
});

const nettoyer = async () => {
  const seances = await db.query.sessionLogs.findMany({ where: eq(schema.sessionLogs.userId, U) });
  for (const s of seances) {
    await db.delete(schema.setLogs).where(eq(schema.setLogs.sessionLogId, s.id));
    await db.delete(schema.sessionPlanItems).where(eq(schema.sessionPlanItems.sessionLogId, s.id));
  }
  await db.delete(schema.sessionLogs).where(eq(schema.sessionLogs.userId, U));
  for (const t of templates) {
    await db.delete(schema.exerciseInTemplate).where(eq(schema.exerciseInTemplate.seanceTemplateId, t));
    await db.delete(schema.seanceTemplates).where(eq(schema.seanceTemplates.id, t));
  }
  templates.length = 0;
  await db.delete(schema.programmeBlocs).where(eq(schema.programmeBlocs.userId, U));
};

beforeEach(nettoyer);

afterAll(async () => {
  await nettoyer();
  await db.delete(schema.exerciseInstances).where(eq(schema.exerciseInstances.gymId, salle));
  await db.delete(schema.gyms).where(eq(schema.gyms.id, salle));
  await db.delete(schema.exercises).where(eq(schema.exercises.id, exoA));
  await db.delete(schema.exercises).where(eq(schema.exercises.id, exoB));
  await db.delete(schema.users).where(eq(schema.users.id, U));
});

describe("vue du programme", () => {
  it("ne prétend rien sans cycle actif", async () => {
    const v = await vueDuProgramme(U, AUJOURDHUI);
    expect(v.etat).toBe("sans_cycle");
    expect(v.cycle).toBeNull();
    expect(v.semaine).toEqual([]);
    expect(v.lecture).toBeNull();
  });

  it("présente la calibration pour ce qu'elle est, sans numéro de cycle", async () => {
    await creerBloc("calibration", LUNDI);
    await enregistrerSeance("2026-08-03", templates[0]!);

    const v = await vueDuProgramme(U, AUJOURDHUI);
    expect(v.etat).toBe("calibration");
    expect(v.cycle!.libelle.libelle).toBe("Reprise & calibration");
    expect(v.cycle!.libelle.intention).toMatch(/j'apprends/i);
    expect(v.cycle!.seancesFaites).toBe(1);
    // Une calibration n'annonce pas de total : rien n'est encore construit.
    expect(v.cycle!.position.semainesTotal).toBeNull();
  });

  it("déduit la semaine de la date de début, pas du compteur figé", async () => {
    // `semaine_actuelle` vaut 1 en base et n'est jamais incrémentée.
    await creerBloc("volume", "2026-07-13");
    const enBase = await db.query.programmeBlocs.findFirst({
      where: eq(schema.programmeBlocs.id, blocId),
    });
    expect(enBase!.semaineActuelle).toBe(1);

    const v = await vueDuProgramme(U, AUJOURDHUI);
    expect(v.cycle!.position.semaine).toBe(4);
  });

  it("annonce un total seulement quand la date de fin existe", async () => {
    await creerBloc("volume", "2026-07-13", "2026-08-23");
    const v = await vueDuProgramme(U, AUJOURDHUI);
    expect(v.cycle!.position.semainesTotal).toBe(6);
    expect(v.cycle!.position.avancement).not.toBeNull();
  });

  it("signale un cycle dont la date de fin est passée", async () => {
    await creerBloc("volume", "2026-06-01", "2026-07-26");
    const v = await vueDuProgramme(U, AUJOURDHUI);
    expect(v.etat).toBe("cycle_termine");
    expect(v.cycle!.position.termine).toBe(true);
  });

  it("compte les exercices et estime la durée de chaque séance", async () => {
    await creerBloc("volume", LUNDI);
    const v = await vueDuProgramme(U, AUJOURDHUI);
    expect(v.semaine).toHaveLength(2);
    expect(v.semaine[0]!.exercices).toBe(3);
    expect(v.semaine[0]!.dureeEstimeeMinutes).toBeGreaterThan(0);
    expect(v.semaine[0]!.piliers).toContain("P1_poussee");
  });

  it("distingue terminée, adaptée et à venir dans la semaine en cours", async () => {
    await creerBloc("volume", LUNDI);
    await enregistrerSeance("2026-08-03", templates[0]!, true);

    const v = await vueDuProgramme(U, AUJOURDHUI);
    expect(v.semaine[0]!.etat).toBe("adaptee");
    expect(v.semaine[1]!.etat).toBe("prochaine");
  });

  it("ignore une séance de la semaine précédente", async () => {
    await creerBloc("volume", "2026-07-20");
    await enregistrerSeance("2026-07-29", templates[0]!);

    const v = await vueDuProgramme(U, AUJOURDHUI);
    expect(v.semaine.map((s) => s.etat)).toEqual(["prochaine", "a_venir"]);
  });

  it("attend un historique avant de lire l'état du corps", async () => {
    await creerBloc("volume", LUNDI);
    await enregistrerSeance("2026-08-03", templates[0]!);
    const peu = await vueDuProgramme(U, AUJOURDHUI);
    expect(peu.lecture).toBeNull();

    await enregistrerSeance("2026-08-04", templates[1]!);
    await enregistrerSeance("2026-08-05", templates[0]!);
    const assez = await vueDuProgramme(U, AUJOURDHUI);
    expect(assez.lecture).not.toBeNull();
    expect(assez.lecture!.phase).toBe("accumulation");
  });

  it("ne recommande pas de décharge sans signal du corps", async () => {
    await creerBloc("volume", "2026-06-01");
    for (const d of ["2026-08-03", "2026-08-04", "2026-08-05"]) {
      await enregistrerSeance(d, templates[0]!);
    }
    const v = await vueDuProgramme(U, AUJOURDHUI);
    // Le bloc dure depuis plus de six semaines : le moteur conseille une
    // décharge au calendrier. L'écran ne la relaie pas pour autant.
    expect(v.dechargeRecommandee).toBe(false);
  });

  it("garde lisible un bloc enregistré sous l'ancien vocabulaire, sans le réécrire", async () => {
    await creerBloc("mecanique", LUNDI);
    const v = await vueDuProgramme(U, AUJOURDHUI);

    expect(v.cycle!.libelle.libelle).toBe("Dominante charge");
    expect(v.cycle!.libelle.herite).toBe(true);

    // La valeur en base est intacte : aucune migration destructive.
    const enBase = await db.query.programmeBlocs.findFirst({
      where: eq(schema.programmeBlocs.id, blocId),
    });
    expect(enBase!.typeCycle).toBe("mecanique");
  });

  it("ne transmet plus « semaine 1 » au coach pour un bloc ancien", async () => {
    // Le point de la demande : `semaine_actuelle` reste à 1 en base, mais
    // l'interface, le classement de l'état et le coach doivent tous parler de
    // la même semaine — celle déduite de la date de début.
    // `mesurerCycle` et le contexte du coach lisent l'horloge réelle : le bloc
    // est donc ancré sur aujourd'hui pour que la semaine attendue soit sûre.
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const debut = decalerDe(lundiDe(aujourdhui), -21);
    await creerBloc("volume", debut);
    await enregistrerSeance(aujourdhui, templates[0]!);

    const enBase = await db.query.programmeBlocs.findFirst({
      where: eq(schema.programmeBlocs.id, blocId),
    });
    expect(enBase!.semaineActuelle).toBe(1);

    const vue = await vueDuProgramme(U, aujourdhui);
    const mesure = await mesurerCycle(U);
    const contexte = await loadCoachContext(U);
    const prompt = buildSystemPrompt(contexte);

    // Une seule semaine, partout.
    expect(vue.cycle!.position.semaine).toBe(4);
    expect(mesure.bloc!.semaine).toBe(4);
    expect(contexte.blocActif!.semaine).toBe(4);
    expect(prompt).toContain("semaine 4");
    expect(prompt).not.toContain("semaine 1");

    // Et aucune valeur brute de type de cycle dans le prompt.
    expect(contexte.blocActif!.libelleCycle).toBe("Dominante volume");
    expect(prompt).not.toContain("typeCycle");
  });

  it("ne promet pas de total au coach quand la date de fin manque", async () => {
    await creerBloc("volume", decalerDe(lundiDe(new Date().toISOString().slice(0, 10)), -21));
    const contexte = await loadCoachContext(U);
    expect(contexte.blocActif!.semainesTotal).toBeNull();
    // La semaine est dite seule : pas de dénominateur inventé.
    expect(buildSystemPrompt(contexte)).toMatch(/semaine 4\)/);
    expect(buildSystemPrompt(contexte)).not.toMatch(/semaine 4 sur/);
  });

  it("n'affiche jamais une valeur de type de cycle inconnue telle quelle", async () => {
    await creerBloc("bloc_perso_2024", LUNDI);
    const v = await vueDuProgramme(U, AUJOURDHUI);
    expect(v.cycle!.libelle.libelle).toBe("Bloc perso 2024");
    expect(v.cycle!.libelle.herite).toBe(true);
  });
});
