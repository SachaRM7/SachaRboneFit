import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Une séance archivée est invisible de TOUS les calculs sportifs.
 *
 * L'archivage était censé dire une chose simple : « ceci ne compte plus, mais
 * ceci a eu lieu ». Une séance de test faite en salle a montré que la première
 * moitié n'était pas tenue. Trois lectures partaient de `set_logs` sans jamais
 * nommer `session_logs` — l'historique servi au Coach, la proposition de charge
 * suivante, la garde d'immutabilité des instances — et une quatrième lisait les
 * séances d'un gabarit sans filtre. Aucune n'avait « oublié un filtre » au sens
 * habituel : la table qui porte l'archivage n'était pas dans la requête.
 *
 * Ce fichier vérifie la propriété entière, lecteur par lecteur nommé. Une
 * assertion générique ne servirait à rien : ce qui protège, c'est que l'ajout
 * d'un calcul sportif oblige à venir ajouter une ligne ici. La liste EST le
 * test.
 *
 * Le dernier bloc vérifie l'autre moitié de la phrase, celle qu'on casserait en
 * « corrigeant » trop loin : les lignes ne sont pas supprimées, et les chemins
 * d'histoire et d'export continuent de les voir.
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

const progression = await import("@/services/progression");
const bilan = await import("@/services/bilan");
const cycle = await import("@/services/cycle");
const planSeance = await import("@/services/plan-seance");
const seances = await import("@/services/seances");
const contexteCoach = await import("@/services/contexte-coach");
const coachTools = await import("@/lib/coach/tools");
const tendency = await import("@/app/api/sessions/tendency/route");
const instanceRoute = await import("@/app/api/exercise-instances/[id]/route");

/** Un lundi figé : les semaines révolues sont alors nettes. */
const AUJOURDHUI = "2026-08-03";
const HIER = "2026-08-02";

let salle = "";
let exercice = "";
let instance = "";
let bloc = "";
let gabarit = "";
let seance = "";

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBeTruthy();

  for (const id of [U, AUTRE]) {
    await db.insert(schema.users).values({
      id, email: `${id}@t.test`, nom: "Testeur", onboardingTermineLe: new Date(),
      dureeSeanceCibleMinutes: 60,
      // La fourchette complète : sans elle, l'adhérence ne se calcule pas et le
      // bilan n'aurait rien à faire disparaître.
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
    musclesSecondaires: ["triceps"], equipement: "barre", slug: `dc-${U.slice(0, 8)}`,
  }).returning();
  exercice = e!.id;

  const [i] = await db.insert(schema.exerciseInstances).values({
    userId: U, exerciseId: exercice, gymId: salle, machineNom: "Banc plat",
    conventionCharge: "poids_total", incrementsPossibles: [2.5], chargeMax: 200,
  }).returning();
  instance = i!.id;

  const [b] = await db.insert(schema.programmeBlocs).values({
    userId: U, nom: "Bloc", typeCycle: "accumulation", actif: true,
    dateDebut: "2026-07-01", dateFinPrevue: "2026-08-12",
  }).returning();
  bloc = b!.id;

  const [t] = await db.insert(schema.seanceTemplates).values({
    blocId: bloc, lettre: "A", nom: "Poussée", ordreDansSemaine: 1,
  }).returning();
  gabarit = t!.id;

  const [ligne] = await db.insert(schema.exerciseInTemplate).values({
    seanceTemplateId: gabarit, exerciseInstanceId: instance, ordre: 1,
    seriesCibles: 3, fourchetteRepsMin: 6, fourchetteRepsMax: 10, rpeCible: 8,
    reposSecondes: 120,
  }).returning();

  // LA séance : la seule de cet utilisateur, complète, et pas encore archivée.
  const [s] = await db.insert(schema.sessionLogs).values({
    userId: U, seanceTemplateId: gabarit, date: HIER, gymId: salle,
    dureeMinutes: 65, feuBiologiqueJour: "vert", energieFin: 7,
  }).returning();
  seance = s!.id;

  await db.insert(schema.setLogs).values(
    [1, 2, 3].map((n) => ({
      sessionLogId: seance, exerciseInstanceId: instance, numeroSerie: n,
      repsEffectuees: 8, charge: 80, rpeEffectif: 8,
    })),
  );

  await db.insert(schema.sessionPlanItems).values({
    sessionLogId: seance, ordre: 1, exerciseInstanceId: instance,
    exerciseInTemplateId: ligne!.id, exerciseInstancePrevuId: instance,
    seriesCibles: 3, fourchetteRepsMin: 6, fourchetteRepsMax: 10, rpeCible: 8,
    reposSecondes: 120, chargeSuggeree: 80,
  });
});

/**
 * Ce que chaque lecteur répond, ramené à une valeur comparable.
 *
 * Chaque entrée est un lecteur sportif nommé. `avant` doit voir la séance,
 * `apres` ne doit plus rien en savoir — et c'est le fait que les deux passes
 * appellent EXACTEMENT le même code qui donne sa valeur au test.
 */
async function lectures() {
  const requete = (chemin: string) => new Request(`http://t${chemin}`);

  const [
    records, listeStagnations, feu, fourchettes, volume,
    bilanProg, exercices, mesure, derniere, contexte,
    historiqueCoach, suggestion, reponseTendance,
  ] = await Promise.all([
    progression.recordsPersonnels(U),
    progression.stagnations(U),
    progression.feuDeTendance(U),
    progression.fourchettesCompletees(U),
    progression.volumeParMuscle(U, "2026-01-01"),
    bilan.bilanDeProgression(U, AUJOURDHUI),
    bilan.exercicesTravailles(U),
    cycle.vueDuProgramme(U),
    planSeance.derniereSeriesPour(U, instance),
    contexteCoach.resoudreContexte(U, { ecran: "seance" }),
    coachTools.getExerciseHistory(instance, 10, U),
    coachTools.suggestNextSetsTool(instance, U),
    tendency.GET(requete(`/api/sessions/tendency?seanceTemplateId=${gabarit}`)),
  ]);

  return {
    /** progression / records : un PR ne se fonde pas sur une séance retirée. */
    records: records.length,
    /** stagnation : une séance archivée ne prouve ni progrès ni surplace. */
    stagnations: listeStagnations.length,
    /** feu de tendance : il compare des séances, pas des traces. */
    feuDeTendance: feu,
    /** alertes : la fourchette complétée hier n'a plus été complétée. */
    fourchettesCompletees: fourchettes.length,
    /** volume par muscle : le tonnage archivé ne compte plus. */
    volumeParMuscle: volume.length,
    /** bilan : nombre de séances retenues sur la fenêtre d'adhérence. */
    bilanSeances: (bilanProg.adherence?.seancesParSemaine ?? []).reduce((n, s) => n + s, 0),
    /** bilan : le sélecteur « Par exercice » ne propose pas un exercice fantôme. */
    exercicesTravailles: exercices.length,
    /** cycle : la mesure du bloc en cours. */
    cycleSeances: mesure.cycle?.seancesFaites ?? 0,
    /** plan de séance : la charge de départ de la prochaine séance. */
    derniereSerie: derniere?.sets.length ?? 0,
    /** contexte Coach : ce que le modèle apprend de la dernière séance. */
    contexteDerniereSeance: contexte.texte ?? "",
    /** Coach, historique de l'exercice. */
    coachHistorique: historiqueCoach.output,
    /** Coach, proposition de charge suivante. */
    coachSuggestion: suggestion.output,
    /** tendance du gabarit : nombre de séances qui la composent. */
    tendance: ((await reponseTendance.json()) as unknown[]).length,
  };
}

let avant: Awaited<ReturnType<typeof lectures>>;
let apres: Awaited<ReturnType<typeof lectures>>;

describe("avant archivage : la séance compte partout", () => {
  it("chaque lecteur la voit", async () => {
    avant = await lectures();

    expect(avant.records).toBeGreaterThan(0);
    expect(avant.fourchettesCompletees).toBeGreaterThan(0);
    expect(avant.volumeParMuscle).toBeGreaterThan(0);
    expect(avant.bilanSeances).toBe(1);
    expect(avant.exercicesTravailles).toBe(1);
    expect(avant.cycleSeances).toBe(1);
    expect(avant.derniereSerie).toBe(3);
    expect(avant.contexteDerniereSeance).toContain(HIER);
    expect(avant.coachHistorique).toContain("80kg");
    expect(avant.coachSuggestion).not.toMatch(/Pas d'historique/);
    expect(avant.tendance).toBe(1);
    expect(await seances.utilisateursActifsDepuis("2026-07-01")).toContain(U);
  });

  it("et la garde d'immutabilité est armée", async () => {
    // Trois séries existent : la sémantique de l'appareil est figée.
    const res = await instanceRoute.PATCH(
      new Request(`http://t/api/exercise-instances/${instance}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conventionCharge: "pile_affichee" }),
      }),
      { params: Promise.resolve({ id: instance }) },
    );
    expect(res.status).toBe(409);
  });
});

describe("après archivage : elle disparaît de tous les calculs", () => {
  beforeAll(async () => {
    await db.update(schema.sessionLogs)
      .set({ archiveLe: new Date() })
      .where(eq(schema.sessionLogs.id, seance));
    apres = await lectures();
  });

  it("progression : plus aucun record", () => {
    expect(apres.records).toBe(0);
  });

  it("progression : plus aucune stagnation", () => {
    expect(apres.stagnations).toBe(0);
  });

  it("progression : plus de feu de tendance", () => {
    expect(apres.feuDeTendance).toBeNull();
  });

  it("progression : plus de fourchette complétée", () => {
    expect(apres.fourchettesCompletees).toBe(0);
  });

  it("progression : plus de volume par muscle", () => {
    expect(apres.volumeParMuscle).toBe(0);
  });

  it("bilan : plus aucune séance comptée", () => {
    expect(apres.bilanSeances).toBe(0);
  });

  it("bilan : plus aucun exercice travaillé", () => {
    expect(apres.exercicesTravailles).toBe(0);
  });

  it("cycle : plus aucune séance faite", () => {
    expect(apres.cycleSeances).toBe(0);
  });

  it("plan de séance : plus de dernière série d'où partir", () => {
    expect(apres.derniereSerie).toBe(0);
  });

  it("contexte Coach : plus de dernière séance", () => {
    expect(apres.contexteDerniereSeance).not.toContain(HIER);
    expect(apres.contexteDerniereSeance).toContain("sans séance enregistrée");
  });

  it("Coach : l'historique de l'exercice est vide", () => {
    expect(apres.coachHistorique).toContain("Aucune historique");
    expect(apres.coachHistorique).not.toContain("80kg");
  });

  it("Coach : plus de charge proposée, faute d'historique", () => {
    // Le défaut le plus grave : la double progression repartait des séries
    // d'une séance retirée du calcul, et proposait la charge d'après.
    expect(apres.coachSuggestion).toMatch(/Pas d'historique/);
  });

  it("tendance du gabarit : plus aucune séance", () => {
    expect(apres.tendance).toBe(0);
  });

  it("précalcul : elle ne suffit plus à rendre l'utilisateur actif", async () => {
    const actifs = await seances.utilisateursActifsDepuis("2026-07-01");
    expect(actifs).not.toContain(U);
  });

  it("immutabilité : l'instance redevient corrigeable", async () => {
    // Une donnée qui ne compte plus ne doit pas continuer d'interdire.
    const res = await instanceRoute.PATCH(
      new Request(`http://t/api/exercise-instances/${instance}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conventionCharge: "pile_affichee" }),
      }),
      { params: Promise.resolve({ id: instance }) },
    );
    expect(res.status).toBe(200);
  });
});

describe("la trace, elle, est intacte", () => {
  it("aucune ligne n'a été supprimée", async () => {
    const s = await db.query.sessionLogs.findFirst({
      where: eq(schema.sessionLogs.id, seance),
    });
    expect(s).toBeDefined();
    expect(s?.archiveLe).not.toBeNull();
    expect(s?.dureeMinutes).toBe(65);

    const series = await db.$count(schema.setLogs, eq(schema.setLogs.sessionLogId, seance));
    expect(series).toBe(3);

    const items = await db.$count(
      schema.sessionPlanItems, eq(schema.sessionPlanItems.sessionLogId, seance),
    );
    expect(items).toBe(1);
  });

  it("l'export continue de la rendre, avec ses séries", async () => {
    // L'export est un chemin d'archive assumé : il rend tout ce qui a eu lieu.
    // Le « corriger » en y appliquant le filtre reviendrait à effacer.
    const route = await import("@/app/api/export/route");
    const donnees = (await (await route.GET(new Request("http://t/api/export"))).json()) as {
      sessions: Array<{ id: string }>;
      sets: Array<{ sessionLogId: string }>;
    };
    expect(donnees.sessions.some((x) => x.id === seance)).toBe(true);
    expect(donnees.sets.filter((x) => x.sessionLogId === seance)).toHaveLength(3);
  });
});

/**
 * Le parc est partagé entre les comptes d'un même lieu : deux lectures doivent
 * donc distinguer « pas archivé » de « pas archivé ET à moi ».
 */
describe("la frontière entre les comptes", () => {
  let seanceAutre = "";

  beforeAll(async () => {
    const [s] = await db.insert(schema.sessionLogs).values({
      userId: AUTRE, date: HIER, gymId: salle, dureeMinutes: 60,
    }).returning();
    seanceAutre = s!.id;
    await db.insert(schema.setLogs).values({
      sessionLogId: seanceAutre, exerciseInstanceId: instance,
      numeroSerie: 1, repsEffectuees: 5, charge: 120, rpeEffectif: 9,
    });
  });

  it("la charge proposée ne part jamais de l'entraînement d'autrui", async () => {
    const suggestion = await coachTools.suggestNextSetsTool(instance, U);
    expect(suggestion.output).toMatch(/Pas d'historique/);
    expect(suggestion.output).not.toContain("120");
  });

  it("ni l'historique servi au Coach", async () => {
    const historique = await coachTools.getExerciseHistory(instance, 10, U);
    expect(historique.output).toContain("Aucune historique");
  });

  it("mais leurs séries figent la sémantique de l'appareil, comme les nôtres", async () => {
    // L'appareil est le même objet physique pour les deux comptes : relire une
    // pile affichée comme un poids total fausserait aussi SA courbe.
    const res = await instanceRoute.PATCH(
      new Request(`http://t/api/exercise-instances/${instance}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conventionCharge: "poids_total" }),
      }),
      { params: Promise.resolve({ id: instance }) },
    );
    expect(res.status).toBe(409);
  });

  it("efface ce que ce fichier a écrit", async () => {
    await db.delete(schema.setLogs).where(eq(schema.setLogs.sessionLogId, seanceAutre));
    await db.delete(schema.sessionLogs).where(eq(schema.sessionLogs.id, seanceAutre));
    await db.delete(schema.sessionPlanItems)
      .where(eq(schema.sessionPlanItems.sessionLogId, seance));
    await db.delete(schema.setLogs).where(eq(schema.setLogs.sessionLogId, seance));
    await db.delete(schema.sessionLogs).where(eq(schema.sessionLogs.id, seance));
    await db.delete(schema.exerciseInTemplate)
      .where(eq(schema.exerciseInTemplate.seanceTemplateId, gabarit));
    await db.delete(schema.seanceTemplates).where(eq(schema.seanceTemplates.id, gabarit));
    await db.delete(schema.programmeBlocs).where(eq(schema.programmeBlocs.id, bloc));
    await db.delete(schema.exerciseInstances)
      .where(and(eq(schema.exerciseInstances.gymId, salle)));
    await db.delete(schema.gyms).where(eq(schema.gyms.id, salle));
    await db.delete(schema.exercises).where(eq(schema.exercises.id, exercice));
    for (const id of [U, AUTRE]) {
      await db.delete(schema.users).where(eq(schema.users.id, id));
    }
    expect(true).toBe(true);
  });
});
