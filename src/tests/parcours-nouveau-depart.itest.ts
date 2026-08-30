import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Le parcours complet d'un nouveau départ, contre une vraie base.
 *
 * Onboarding → salle vide → matériel → calibration → check-in → séance →
 * séries → référence → séance suivante.
 *
 * Ce que cette suite attrape et que les tests unitaires ne peuvent pas voir :
 * un écran qui promet une étape suivante vers une route qui refuse, une
 * colonne qui n'existe pas, une jointure qui ne remonte rien. C'est là que
 * cette application est tombée en panne à chaque fois.
 *
 * L'identité est simulée au seul endroit où elle entre dans le code — les deux
 * helpers d'authentification. Tout le reste est le code de production.
 */

const UTILISATEUR = randomUUID();
const EMAIL = `test-${UTILISATEUR.slice(0, 8)}@exemple.test`;

vi.mock("@/lib/supabase/auth-helper", () => ({
  getAuthenticatedUserId: async () => UTILISATEUR,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: UTILISATEUR, email: EMAIL } } }) },
  }),
}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { eq, inArray } = await import("drizzle-orm");
const { CATALOGUE } = await import("@/lib/referentiels/catalogue");
const { ORDRE_PILIERS } = await import("@/lib/engine/plan-calibration");
const { rpeVersReserve } = await import("@/lib/engine/reserve");

const onboarding = await import("@/app/api/onboarding/route");
const calibration = await import("@/app/api/programme/calibration/route");
const dashboard = await import("@/app/api/dashboard/route");
const instances = await import("@/app/api/exercise-instances/route");
const { prochaineSeance } = await import("@/services/programmes");
const { construireSeanceDuJour, lirePlan } = await import("@/services/plan-seance");
const { recordsDeLExercice } = await import("@/lib/engine/records");

const poste = (url: string, corps: unknown) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corps),
  });

const AUJOURDHUI = new Date().toISOString().slice(0, 10);
const NOM_SALLE = `Salle de test ${UTILISATEUR.slice(0, 8)}`;

/** Un exercice du catalogue réel par pilier : la salle du test ressemble à une vraie salle. */
const EXERCICES_TEST = ORDRE_PILIERS.map((p) =>
  CATALOGUE.find((e) => e.pilier === p && e.categorieRole === "pilier")
  ?? CATALOGUE.find((e) => e.pilier === p),
).filter((e): e is (typeof CATALOGUE)[number] => Boolean(e));

let idsExercices: string[] = [];
let salleId = "";
let templateId = "";
let sessionLogId = "";
const idsInstances: string[] = [];

beforeAll(async () => {
  expect(process.env.DATABASE_URL, "DATABASE_URL doit viser une base jetable").toBeTruthy();
  expect(EXERCICES_TEST.length).toBe(ORDRE_PILIERS.length);

  await db.insert(schema.users).values({ id: UTILISATEUR, email: EMAIL, nom: "Testeur" });

  const crees = await db
    .insert(schema.exercises)
    .values(
      EXERCICES_TEST.map((e) => ({
        userId: null,
        nom: e.nom,
        pilier: e.pilier,
        profilTension: e.profilTension,
        type: e.type,
        categorieRole: e.categorieRole,
        musclesPrincipaux: e.musclesPrincipaux,
        musclesSecondaires: e.musclesSecondaires,
        equipement: e.equipement,
        slug: `${e.slug}-${UTILISATEUR.slice(0, 8)}`,
      })),
    )
    .returning();
  idsExercices = crees.map((e) => e.id);
});

afterAll(async () => {
  // Le test nettoie derrière lui : il n'y a pas de base « de test » à part.
  if (sessionLogId) {
    await db.delete(schema.setLogs).where(eq(schema.setLogs.sessionLogId, sessionLogId));
    await db.delete(schema.sessionPlanItems).where(eq(schema.sessionPlanItems.sessionLogId, sessionLogId));
  }
  await db.delete(schema.sessionLogs).where(eq(schema.sessionLogs.userId, UTILISATEUR));
  await db.delete(schema.dailyStates).where(eq(schema.dailyStates.userId, UTILISATEUR));
  if (templateId) {
    await db.delete(schema.exerciseInTemplate).where(eq(schema.exerciseInTemplate.seanceTemplateId, templateId));
  }
  const blocs = await db.query.programmeBlocs.findMany({
    where: eq(schema.programmeBlocs.userId, UTILISATEUR),
  });
  for (const b of blocs) {
    const gabarits = await db.query.seanceTemplates.findMany({
      where: eq(schema.seanceTemplates.blocId, b.id),
    });
    for (const g of gabarits) {
      await db.delete(schema.exerciseInTemplate).where(eq(schema.exerciseInTemplate.seanceTemplateId, g.id));
    }
    await db.delete(schema.seanceTemplates).where(eq(schema.seanceTemplates.blocId, b.id));
  }
  await db.delete(schema.programmeBlocs).where(eq(schema.programmeBlocs.userId, UTILISATEUR));
  await db.delete(schema.exerciseInstances).where(eq(schema.exerciseInstances.userId, UTILISATEUR));
  await db.delete(schema.contraintes).where(eq(schema.contraintes.userId, UTILISATEUR));
  if (salleId) await db.delete(schema.gyms).where(eq(schema.gyms.id, salleId));
  if (idsExercices.length) {
    await db.delete(schema.exercises).where(inArray(schema.exercises.id, idsExercices));
  }
  await db.delete(schema.users).where(eq(schema.users.id, UTILISATEUR));
});

const etatDuTableauDeBord = async () => {
  const res = await dashboard.GET();
  expect(res.status, await res.clone().text()).toBe(200);
  return (await res.json()).etat;
};

describe("parcours d'un nouveau départ", () => {
  it("1. un compte neuf n'a pas terminé son onboarding", async () => {
    const res = await onboarding.GET();
    expect(res.status).toBe(200);
    const corps = await res.json();
    expect(corps.termine).toBe(false);
  });

  it("2. l'onboarding écrit le profil, la salle et une phase de calibration", async () => {
    const res = await onboarding.POST(
      poste("http://test/api/onboarding", {
        objectifType: "prise_de_muscle",
        musclesPrioritaires: ["pectoraux", "dorsaux"],
        niveauExperience: "intermediaire",
        anneesDePratique: 4,
        moisDInterruption: 8,
        contraintes: [{ muscle: "epaules", severite: 4, notes: "gêne ancienne" }],
        frequenceCibleParSemaine: 3,
        frequenceMinParSemaine: 2,
        frequenceMaxParSemaine: 4,
        dureeSeanceCibleMinutes: 60,
        dureeSeanceMaxMinutes: 75,
        preferenceMateriel: "melange",
        exercicesRefuses: [],
        nouvelleSalleNom: NOM_SALLE,
        taille: 178,
      }),
    );
    expect(res.status, await res.clone().text()).toBe(201);
    const corps = await res.json();

    // Huit mois d'arrêt : une reprise, pas une continuité.
    expect(corps.reprise).toBe(true);
    expect(corps.salleId).toBeTruthy();
    salleId = corps.salleId;

    const profil = await db.query.users.findFirst({ where: eq(schema.users.id, UTILISATEUR) });
    expect(profil?.onboardingTermineLe).toBeTruthy();
    expect(profil?.objectifType).toBe("prise_de_muscle");
    expect(profil?.frequenceMaxParSemaine).toBe(4);
    expect(profil?.prefSalleParDefautId).toBe(salleId);

    const bloc = await db.query.programmeBlocs.findFirst({
      where: eq(schema.programmeBlocs.userId, UTILISATEUR),
    });
    expect(bloc?.typeCycle).toBe("calibration");
    expect(bloc?.actif).toBe(true);
  });

  it("3. l'accueil demande le matériel, pas une séance impossible", async () => {
    const etat = await etatDuJourAttendu("salle_vide");
    expect(etat.action).toEqual({ type: "equiper_salle", href: `/gyms/${salleId}/exercices` });
    expect(etat.enAttenteDeDonnees).toBe(true);
  });

  it("4. la calibration ne s'invente pas une séance dans un lieu non décrit", async () => {
    // Rien n'a été dit de cette salle : proposer une séance de pompes à
    // quelqu'un debout dans une salle équipée serait pire que demander.
    const res = await calibration.POST(poste("http://test/api/programme/calibration", {}));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/pas encore décrite/);
  });

  it("5. équiper la salle passe par la vraie route de création", async () => {
    for (const exerciseId of idsExercices) {
      const res = await instances.POST(
        poste("http://test/api/exercise-instances", {
          exerciseId,
          gymId: salleId,
          machineNom: "Machine de test",
          conventionCharge: "poids_total",
          incrementsPossibles: [2.5, 5],
        }),
      );
      expect(res.status, await res.clone().text()).toBe(201);
      idsInstances.push((await res.json()).id);
    }
    expect(idsInstances).toHaveLength(ORDRE_PILIERS.length);
  });

  it("6. l'accueil bascule alors sur la calibration", async () => {
    const etat = await etatDuJourAttendu("calibration");
    expect(etat.action.href).toBe("/session/calibration");
    expect(etat.enAttenteDeDonnees).toBe(false);
  });

  it("7. la calibration construit les séances à partir du parc réel", async () => {
    const res = await calibration.POST(poste("http://test/api/programme/calibration", {}));
    expect(res.status, await res.clone().text()).toBe(201);
    const corps = await res.json();

    // Trois séances : la fréquence visée à l'onboarding.
    expect(corps.seances).toHaveLength(3);
    expect(corps.piliersNonCouverts).toEqual([]);
    expect(corps.salle.id).toBe(salleId);

    // Chaque exercice prescrit existe réellement dans cette salle.
    const gabarits = await db.query.seanceTemplates.findMany({
      where: eq(schema.seanceTemplates.blocId, corps.blocId),
    });
    const lignes = await db.query.exerciseInTemplate.findMany({
      where: inArray(schema.exerciseInTemplate.seanceTemplateId, gabarits.map((g) => g.id)),
    });
    expect(lignes.length).toBeGreaterThan(0);
    for (const l of lignes) {
      expect(idsInstances).toContain(l.exerciseInstanceId);
      expect(l.seriesCibles).toBe(2);
      expect(l.rpeCible).toBe(7);
    }
  });

  it("8. rappelée deux fois, elle ne reconstruit pas le programme", async () => {
    const res = await calibration.POST(poste("http://test/api/programme/calibration", {}));
    expect(res.status).toBe(200);
    const corps = await res.json();
    expect(corps.deja).toBe(true);
    expect(corps.seances).toHaveLength(3);
    expect(corps.salle.id).toBe(salleId);
  });

  it("9. le moteur sait quelle séance vient ensuite", async () => {
    const suite = await prochaineSeance(UTILISATEUR);
    expect(suite).not.toBeNull();
    expect(suite!.toutesLesSeances).toHaveLength(3);
    expect(suite!.template.lettre).toBe("A");
    templateId = suite!.template.id;
  });

  it("10. l'accueil propose enfin de démarrer, avec la salle dans le lien", async () => {
    const etat = await etatDuJourAttendu("calibration");
    expect(etat.seance.templateId).toBe(templateId);
    expect(etat.action.href).toContain(`gymId=${salleId}`);
  });

  it("11. le check-in puis la construction produisent un plan réel", async () => {
    await db.insert(schema.dailyStates).values({
      userId: UTILISATEUR,
      date: AUJOURDHUI,
      gymId: salleId,
      sommeilHeures: 7,
      energieDepart: 7,
      courbatures: [],
    });

    const resultat = await construireSeanceDuJour({
      userId: UTILISATEUR,
      date: AUJOURDHUI,
      gymId: salleId,
      seanceTemplateId: templateId,
    });
    sessionLogId = resultat.seance.id;
    expect(resultat.items.length).toBeGreaterThan(0);
    expect(resultat.ecartes).toEqual([]);
  });

  it("12. la séance se sait en calibration et demande une réserve", async () => {
    const plan = await lirePlan(UTILISATEUR, sessionLogId);
    expect(plan).not.toBeNull();
    expect(plan!.phaseCycle).toBe("calibration");
    for (const item of plan!.items) {
      expect(item.seriesCibles).toBe(2);
      // RPE 7 côté prescription = « 3 de plus » proposé à l'écran.
      expect(rpeVersReserve(item.rpeCible)).toBe(3);
      // Première séance : aucune charge suggérée ne peut être inventée.
      expect(item.chargeSuggeree).toBeNull();
      expect(item.historique).toEqual([]);
    }
  });

  it("13. les séries s'enregistrent avec la réserve saisie", async () => {
    const plan = await lirePlan(UTILISATEUR, sessionLogId);
    const premier = plan!.items[0]!;
    await db.insert(schema.setLogs).values([
      {
        sessionLogId,
        exerciseInstanceId: premier.id,
        numeroSerie: 1,
        charge: 50,
        repsEffectuees: 10,
        rpeEffectif: 7,
      },
      {
        sessionLogId,
        exerciseInstanceId: premier.id,
        numeroSerie: 2,
        charge: 50,
        repsEffectuees: 9,
        rpeEffectif: 8,
      },
    ]);
    const series = await db.query.setLogs.findMany({
      where: eq(schema.setLogs.sessionLogId, sessionLogId),
    });
    expect(series).toHaveLength(2);
    expect(rpeVersReserve(series[0]!.rpeEffectif)).toBe(3);
  });

  it("14. la première mesure est une référence, jamais un record", async () => {
    // La demande était explicite : baseline ≠ PR, aucun ancien record.
    const r = recordsDeLExercice([
      { date: AUJOURDHUI, charge: 50, reps: 10, rir: 3 },
      { date: AUJOURDHUI, charge: 50, reps: 9, rir: 2 },
    ]);
    expect(r.parPlage.find((p) => p.plage === 10)!.nature).toBe("baseline");
    expect(r.debutDuParcours).toBe(AUJOURDHUI);
  });

  it("15. une fois la séance faite, l'accueil ne la repropose pas", async () => {
    await db
      .update(schema.sessionLogs)
      .set({ dureeMinutes: 55, energieFin: 6 })
      .where(eq(schema.sessionLogs.id, sessionLogId));

    const etat = await etatDuJourAttendu("deja_entraine");
    expect(etat.action).toEqual({ type: "voir_progression", href: "/progression" });
  });

  it("16. la rotation désigne la séance suivante, pas la même", async () => {
    const suite = await prochaineSeance(UTILISATEUR);
    expect(suite!.template.id).not.toBe(templateId);
    expect(suite!.template.lettre).toBe("B");
  });
});

/** Lit l'état du jour et échoue avec l'état obtenu quand il diffère. */
async function etatDuJourAttendu(attendu: string) {
  const etat = await etatDuTableauDeBord();
  expect(etat.etat, `état obtenu : ${JSON.stringify(etat)}`).toBe(attendu);
  return etat;
}
