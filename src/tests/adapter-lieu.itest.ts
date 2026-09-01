import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Changer de lieu alors que la séance est déjà construite, contre une vraie base.
 *
 * Les six cas demandés : salle → maison, maison → salle, appareil absent avec
 * alternative, matériel apporté qui débloque mieux, aucun remplacement
 * possible, et changement en plein cycle sans casser la semaine.
 *
 * Le moteur est déjà testé unitairement. Ce qui se vérifie ici est ce qu'il ne
 * peut pas voir : que la séance en base est réellement réécrite, que la
 * prescription survit au passage par SQL, et que les trois contrôles tournent.
 */

const U = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({ getAuthenticatedUserId: async () => U }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: U, email: `${U}@t.test` } } }) } }),
}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { and, eq, inArray, asc } = await import("drizzle-orm");
const adapter = await import("@/app/api/seance-du-jour/adapter/route");

const poste = (corps: unknown) =>
  new Request("http://test/api/seance-du-jour/adapter", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corps),
  });

const JOUR = new Date().toISOString().slice(0, 10);

/** Un exercice du catalogue, décrit à la main pour maîtriser le scénario. */
const creerExercice = async (
  nom: string,
  pilier: string,
  equipement: string,
  muscles: string[],
  profilTension = "mi_range",
  categorieRole = "pilier",
) => {
  const [e] = await db
    .insert(schema.exercises)
    .values({
      userId: null,
      nom,
      pilier,
      profilTension,
      type: "polyarticulaire",
      categorieRole,
      musclesPrincipaux: muscles,
      musclesSecondaires: [],
      equipement,
      slug: `${nom.toLowerCase().replace(/[^a-z]/g, "-")}-${U.slice(0, 8)}`,
    })
    .returning();
  return e!;
};

/**
 * Une possibilité physique = UNE entrée active dans la salle.
 *
 * Ces décors recréaient l'appareil à chaque usage : deux tests de suite
 * fabriquaient deux « Poulie haute » dans la même salle, et trois séances
 * passées trois « Pompes » à la maison. C'était faux avant — on ne fait pas
 * apparaître un banc chaque fois qu'on s'en sert — et l'index partiel de la
 * migration 0011 le refuse désormais.
 *
 * Retrouver puis créer, plutôt que créer : le décor reste juste, et il survit
 * au `beforeEach` qui efface les entrées d'une salle entre deux tests.
 */
const instanceActive = async (
  gymId: string,
  exerciseId: string,
  machineNom: string,
  champs: { conventionCharge: string; incrementsPossibles: number[] },
) => {
  const existante = await db.query.exerciseInstances.findFirst({
    where: (i, { and, eq, isNull }) =>
      and(
        eq(i.gymId, gymId),
        eq(i.exerciseId, exerciseId),
        eq(i.machineNom, machineNom),
        isNull(i.archiveLe),
      ),
  });
  if (existante) return existante;
  const [creee] = await db.insert(schema.exerciseInstances).values({
    userId: U, exerciseId, gymId, machineNom, ...champs,
  }).returning();
  return creee!;
};

const ids: { exercices: string[]; salles: string[] } = { exercices: [], salles: [] };
let salle = "";
let maison = "";
let sessionLogId = "";
let developpe = "";
let squat = "";
let pompes = "";
let fente = "";
let tirageElastique = "";
let instDeveloppe = "";
let instSquat = "";

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBeTruthy();
  await db.insert(schema.users).values({
    id: U,
    email: `${U}@t.test`,
    nom: "Testeur",
    dureeSeanceCibleMinutes: 90,
  });

  const dev = await creerExercice("Developpe couche", "P1_poussee", "barre", ["pectoraux"]);
  const sq = await creerExercice("Squat barre", "P3_squat", "barre", ["quadriceps"]);
  const po = await creerExercice("Pompes", "P1_poussee", "poids_du_corps", ["pectoraux"]);
  const fe = await creerExercice("Fente bulgare", "P3_squat", "poids_du_corps", ["quadriceps"]);
  const ti = await creerExercice("Tirage elastique", "P2_tirage", "elastiques", ["dorsaux"], "stretch");
  developpe = dev.id; squat = sq.id; pompes = po.id; fente = fe.id; tirageElastique = ti.id;
  ids.exercices = [dev.id, sq.id, po.id, fe.id, ti.id];

  const [s] = await db.insert(schema.gyms).values({
    userId: U, nom: `Salle ${U.slice(0, 8)}`, equipementsDisponibles: ["barre"],
  }).returning();
  const [m] = await db.insert(schema.gyms).values({
    userId: U, nom: `Maison ${U.slice(0, 8)}`, equipementsDisponibles: [],
  }).returning();
  salle = s!.id; maison = m!.id;
  ids.salles = [salle, maison];

  // Les deux exercices à la barre sont décrits comme appareils de la salle.
  const inst = await db.insert(schema.exerciseInstances).values([
    { userId: U, exerciseId: developpe, gymId: salle, machineNom: "Banc", conventionCharge: "poids_total", incrementsPossibles: [2.5] },
    { userId: U, exerciseId: squat, gymId: salle, machineNom: "Rack", conventionCharge: "poids_total", incrementsPossibles: [2.5] },
  ]).returning();
  instDeveloppe = inst[0]!.id; instSquat = inst[1]!.id;
});

afterAll(async () => {
  const seances = await db.query.sessionLogs.findMany({ where: eq(schema.sessionLogs.userId, U) });
  for (const s of seances) {
    await db.delete(schema.setLogs).where(eq(schema.setLogs.sessionLogId, s.id));
    await db.delete(schema.sessionPlanItems).where(eq(schema.sessionPlanItems.sessionLogId, s.id));
  }
  await db.delete(schema.sessionLogs).where(eq(schema.sessionLogs.userId, U));
  await db.delete(schema.dailyStates).where(eq(schema.dailyStates.userId, U));
  for (const g of ids.salles) {
    await db.delete(schema.exerciseInstances).where(eq(schema.exerciseInstances.gymId, g));
    await db.delete(schema.gyms).where(eq(schema.gyms.id, g));
  }
  if (ids.exercices.length) {
    await db.delete(schema.exercises).where(inArray(schema.exercises.id, ids.exercices));
  }
  await db.delete(schema.users).where(eq(schema.users.id, U));
});

/** Reconstruit la séance de départ : développé + squat, à la salle. */
beforeEach(async () => {
  const anciennes = await db.query.sessionLogs.findMany({ where: eq(schema.sessionLogs.userId, U) });
  for (const s of anciennes) {
    await db.delete(schema.setLogs).where(eq(schema.setLogs.sessionLogId, s.id));
    await db.delete(schema.sessionPlanItems).where(eq(schema.sessionPlanItems.sessionLogId, s.id));
  }
  await db.delete(schema.sessionLogs).where(eq(schema.sessionLogs.userId, U));
  await db.delete(schema.dailyStates).where(eq(schema.dailyStates.userId, U));
  // Les entrées déduites créées par un test précédent ne doivent pas fausser
  // le suivant : seuls les deux appareils décrits au départ subsistent.
  await db.delete(schema.exerciseInstances).where(
    and(eq(schema.exerciseInstances.userId, U), inArray(schema.exerciseInstances.gymId, [maison])),
  );

  const [s] = await db.insert(schema.sessionLogs).values({
    userId: U, date: JOUR, gymId: salle,
  }).returning();
  sessionLogId = s!.id;

  await db.insert(schema.sessionPlanItems).values([
    { sessionLogId, ordre: 1, exerciseInstanceId: instDeveloppe, seriesCibles: 4, seriesPrevuesAvantAjustement: 4, fourchetteRepsMin: 8, fourchetteRepsMax: 12, rpeCible: 8, reposSecondes: 120, statut: "prevu" },
    { sessionLogId, ordre: 2, exerciseInstanceId: instSquat, seriesCibles: 4, seriesPrevuesAvantAjustement: 4, fourchetteRepsMin: 8, fourchetteRepsMax: 12, rpeCible: 8, reposSecondes: 120, statut: "prevu" },
  ]);

  await db.insert(schema.dailyStates).values({
    userId: U, date: JOUR, gymId: salle, sommeilHeures: 7, energieDepart: 7, courbatures: [],
  });
});

const appeler = async (corps: Record<string, unknown>) => {
  const res = await adapter.POST(poste({ sessionLogId, ...corps }));
  const json = await res.clone().json().catch(() => null);
  return { status: res.status, corps: json as Record<string, never> & Record<string, unknown> };
};

const seanceEnBase = async () =>
  db
    .select({
      ordre: schema.sessionPlanItems.ordre,
      instanceId: schema.sessionPlanItems.exerciseInstanceId,
      series: schema.sessionPlanItems.seriesCibles,
      repsMin: schema.sessionPlanItems.fourchetteRepsMin,
      rpe: schema.sessionPlanItems.rpeCible,
      repos: schema.sessionPlanItems.reposSecondes,
      raison: schema.sessionPlanItems.raisonSubstitution,
      nom: schema.exercises.nom,
    })
    .from(schema.sessionPlanItems)
    .innerJoin(schema.exerciseInstances, eq(schema.exerciseInstances.id, schema.sessionPlanItems.exerciseInstanceId))
    .innerJoin(schema.exercises, eq(schema.exercises.id, schema.exerciseInstances.exerciseId))
    .where(eq(schema.sessionPlanItems.sessionLogId, sessionLogId))
    .orderBy(asc(schema.sessionPlanItems.ordre));

describe("1. salle → maison", () => {
  it("remplace ce qui devient impossible et conserve le reste", async () => {
    const { status, corps } = await appeler({ gymId: maison });
    expect(status, JSON.stringify(corps)).toBe(200);
    expect(corps.applique).toBe(true);

    const apres = await seanceEnBase();
    expect(apres.map((x) => x.nom).sort()).toEqual(["Fente bulgare", "Pompes"]);
    // La prescription survit au changement de lieu.
    for (const x of apres) {
      expect(x.series).toBe(4);
      expect(x.repsMin).toBe(8);
      expect(x.rpe).toBe(8);
      expect(x.repos).toBe(120);
      expect(x.raison).toMatch(/indisponible/);
    }
  });

  it("déplace la séance et retient le matériel du jour", async () => {
    await appeler({ gymId: maison, materielApporte: ["elastiques"] });
    const s = await db.query.sessionLogs.findFirst({ where: eq(schema.sessionLogs.id, sessionLogId) });
    expect(s?.gymId).toBe(maison);
    const etat = await db.query.dailyStates.findFirst({
      where: and(eq(schema.dailyStates.userId, U), eq(schema.dailyStates.date, JOUR)),
    });
    expect(etat?.materielApporte).toEqual(["elastiques"]);
  });

  it("l'aperçu ne modifie rien", async () => {
    const { corps } = await appeler({ gymId: maison, apercu: true });
    expect(corps.applique).toBe(false);
    expect((corps.remplacements as unknown as unknown[]).length).toBeGreaterThan(0);

    const apres = await seanceEnBase();
    expect(apres.map((x) => x.nom).sort()).toEqual(["Developpe couche", "Squat barre"]);
  });
});

describe("2. maison → salle", () => {
  it("retrouve les mouvements à la barre", async () => {
    await appeler({ gymId: maison });
    const { status } = await appeler({ gymId: salle });
    expect(status).toBe(200);

    const apres = await seanceEnBase();
    expect(apres.map((x) => x.nom).sort()).toEqual(["Developpe couche", "Squat barre"]);
    expect(apres.map((x) => x.instanceId).sort()).toEqual([instDeveloppe, instSquat].sort());
  });

  it("ne signale aucun changement quand on revient au même lieu", async () => {
    const { corps } = await appeler({ gymId: salle, apercu: true });
    expect(corps.remplacements).toEqual([]);
    expect(corps.retires).toEqual([]);
    expect(corps.conserves).toBe(2);
  });
});

describe("3. appareil absent, alternative disponible", () => {
  it("garde le pilier et les muscles visés", async () => {
    const { corps } = await appeler({ gymId: maison, apercu: true });
    const remplacements = corps.remplacements as unknown as Array<{ avant: string; apres: string }>;
    const parAvant = new Map(remplacements.map((r) => [r.avant, r.apres]));
    // Poussée reste poussée, squat reste squat.
    expect(parAvant.get("Developpe couche")).toBe("Pompes");
    expect(parAvant.get("Squat barre")).toBe("Fente bulgare");
  });
});

describe("4. matériel apporté qui débloque mieux", () => {
  it("choisit un remplaçant plus fidèle grâce au sac", async () => {
    // Une séance de tirage : sans élastiques, la maison n'offre rien.
    await db.delete(schema.sessionPlanItems).where(eq(schema.sessionPlanItems.sessionLogId, sessionLogId));
    const instTirage = await instanceActive(salle, tirageElastique, "Poulie haute", {
      conventionCharge: "pile_affichee", incrementsPossibles: [5],
    });
    await db.insert(schema.sessionPlanItems).values({
      sessionLogId, ordre: 1, exerciseInstanceId: instTirage.id, seriesCibles: 3,
      seriesPrevuesAvantAjustement: 3, fourchetteRepsMin: 10, fourchetteRepsMax: 12,
      rpeCible: 8, reposSecondes: 90, statut: "prevu",
    });

    const sansSac = await appeler({ gymId: maison, apercu: true });
    expect((sansSac.corps.retires as unknown as unknown[]).length).toBe(1);

    const avecSac = await appeler({ gymId: maison, materielApporte: ["elastiques"], apercu: true });
    expect(avecSac.corps.retires).toEqual([]);
    const r = (avecSac.corps.remplacements as unknown as Array<{ apres: string }>)[0];
    expect(r?.apres).toBe("Tirage elastique");
  });

  it("matérialise l'entrée manquante seulement au moment de l'appliquer", async () => {
    await db.delete(schema.sessionPlanItems).where(eq(schema.sessionPlanItems.sessionLogId, sessionLogId));
    const instTirage = await instanceActive(salle, tirageElastique, "Poulie haute", {
      conventionCharge: "pile_affichee", incrementsPossibles: [5],
    });
    await db.insert(schema.sessionPlanItems).values({
      sessionLogId, ordre: 1, exerciseInstanceId: instTirage.id, seriesCibles: 3,
      seriesPrevuesAvantAjustement: 3, fourchetteRepsMin: 10, fourchetteRepsMax: 12,
      rpeCible: 8, reposSecondes: 90, statut: "prevu",
    });

    const avant = await db.$count(schema.exerciseInstances, eq(schema.exerciseInstances.gymId, maison));
    await appeler({ gymId: maison, materielApporte: ["elastiques"], apercu: true });
    expect(await db.$count(schema.exerciseInstances, eq(schema.exerciseInstances.gymId, maison))).toBe(avant);

    await appeler({ gymId: maison, materielApporte: ["elastiques"] });
    const apres = await seanceEnBase();
    expect(apres[0]!.nom).toBe("Tirage elastique");
    const creee = await db.query.exerciseInstances.findFirst({
      where: and(eq(schema.exerciseInstances.gymId, maison), eq(schema.exerciseInstances.exerciseId, tirageElastique)),
    });
    expect(creee?.notesMachine).toMatch(/Déduit du matériel/);
  });
});

describe("5. aucun remplacement possible", () => {
  it("retire, le dit, et conseille de reconstruire", async () => {
    const [vide] = await db.insert(schema.gyms).values({
      userId: U, nom: `Vide ${U.slice(0, 8)}`, equipementsDisponibles: [],
    }).returning();
    ids.salles.push(vide!.id);

    // Un lieu sans rien : seul le poids du corps y est faisable, et les deux
    // exercices au poids du corps existent — on les retire du catalogue visible
    // en les archivant le temps du test.
    await db.update(schema.exercises).set({ equipement: "barre" })
      .where(inArray(schema.exercises.id, [pompes, fente]));

    const { corps } = await appeler({ gymId: vide!.id, apercu: true });
    expect((corps.retires as unknown as unknown[]).length).toBe(2);
    expect(corps.reconstructionConseillee).toBe(true);
    expect(String(corps.motifReconstruction)).toMatch(/sans équivalent ici/);

    await db.update(schema.exercises).set({ equipement: "poids_du_corps" })
      .where(inArray(schema.exercises.id, [pompes, fente]));
  });
});

describe("7. traçabilité prévu / effectué", () => {
  it("garde la mémoire de ce qui était prévu, et le contexte", async () => {
    await appeler({ gymId: maison, materielApporte: ["elastiques"] });

    const lignes = await db.query.sessionPlanItems.findMany({
      where: eq(schema.sessionPlanItems.sessionLogId, sessionLogId),
    });
    expect(lignes.length).toBe(2);
    for (const l of lignes) {
      // Ce qui était prévu au départ, distinct de ce qui sera fait.
      expect([instDeveloppe, instSquat]).toContain(l.exerciseInstancePrevuId);
      expect(l.exerciseInstancePrevuId).not.toBe(l.exerciseInstanceId);
      expect(l.raisonSubstitution).toMatch(/indisponible/);

      const c = l.contexteAdaptation!;
      expect(c.type).toBe("changement_lieu");
      expect(c.lieuAvantId).toBe(salle);
      expect(c.lieuApresId).toBe(maison);
      expect(c.materielApporte).toEqual(["elastiques"]);
      expect(c.niveauFidelite).toBeTruthy();
      expect(c.qualite).toBeTruthy();
    }
  });

  it("ne réécrit pas le prévu à la deuxième adaptation", async () => {
    // Après un aller-retour, ce que la séance devait être ne doit pas s'être
    // perdu au profit du pis-aller de l'étape précédente.
    await appeler({ gymId: maison });
    await appeler({ gymId: salle });

    const lignes = await db.query.sessionPlanItems.findMany({
      where: eq(schema.sessionPlanItems.sessionLogId, sessionLogId),
    });
    for (const l of lignes) {
      expect([instDeveloppe, instSquat]).toContain(l.exerciseInstancePrevuId);
      // De retour à la salle, on refait ce qui était prévu : plus de substitution.
      expect(l.exerciseInstanceId).toBe(l.exerciseInstancePrevuId);
      expect(l.raisonSubstitution).toBeNull();
      expect(l.contexteAdaptation).toBeNull();
    }
  });

  it("la progression ne compte pas un exercice empêché comme une stagnation", async () => {
    // Le point de la demande : une substitution ne doit jamais devenir une
    // mauvaise performance ni une absence inexpliquée.
    const { stagnations } = await import("@/services/progression");

    // Un record ancien sur le développé, puis une séance en deçà : deux dates,
    // ce qu'il faut pour que la stagnation soit calculable.
    const [record] = await db.insert(schema.sessionLogs).values({
      userId: U, date: "2026-06-01", gymId: salle, dureeMinutes: 60,
    }).returning();
    const [ancienne] = await db.insert(schema.sessionLogs).values({
      userId: U, date: "2026-07-01", gymId: salle, dureeMinutes: 60,
    }).returning();
    await db.insert(schema.setLogs).values([
      { sessionLogId: record!.id, exerciseInstanceId: instDeveloppe, numeroSerie: 1, charge: 90, repsEffectuees: 8 },
      { sessionLogId: ancienne!.id, exerciseInstanceId: instDeveloppe, numeroSerie: 1, charge: 70, repsEffectuees: 8 },
    ]);

    const avant = (await stagnations(U, 0)).find((x) => x.exerciseInstanceId === instDeveloppe);
    expect(avant, "le développé doit apparaître avant adaptation").toBeTruthy();
    const semainesAvant = avant!.semainesSansProgression;

    await appeler({ gymId: maison });

    const apres = (await stagnations(U, 0)).find((x) => x.exerciseInstanceId === instDeveloppe);
    expect(apres!.semainesEmpechees).toBeGreaterThan(0);
    expect(apres!.semainesSansProgression).toBeLessThan(semainesAvant);

    for (const s of [record!, ancienne!]) {
      await db.delete(schema.setLogs).where(eq(schema.setLogs.sessionLogId, s.id));
      await db.delete(schema.sessionLogs).where(eq(schema.sessionLogs.id, s.id));
    }
  });
});

describe("8. niveaux d'adaptation explicites", () => {
  it("annonce le niveau et son explication", async () => {
    const { corps } = await appeler({ gymId: maison, apercu: true });
    expect(["equivalente", "degradee", "insuffisante"]).toContain(corps.qualite);
    expect(corps.libelleQualite).toBeTruthy();
    expect(corps.explicationQualite).toBeTruthy();
  });

  it("équivalente quand rien ne change", async () => {
    const { corps } = await appeler({ gymId: salle, apercu: true });
    expect(corps.qualite).toBe("equivalente");
    expect(corps.motifs).toEqual([]);
  });

  it("insuffisante quand un pilier disparaît", async () => {
    await db.update(schema.exercises).set({ equipement: "barre" })
      .where(inArray(schema.exercises.id, [pompes, fente]));
    const { corps } = await appeler({ gymId: maison, apercu: true });
    expect(corps.qualite).toBe("insuffisante");
    expect(corps.reconstructionConseillee).toBe(true);
    await db.update(schema.exercises).set({ equipement: "poids_du_corps" })
      .where(inArray(schema.exercises.id, [pompes, fente]));
  });
});

describe("9. la mémoire des empêchements nourrit le planificateur", () => {

  /**
   * Les pompes à la maison : UNE possibilité physique, donc UNE entrée.
   *
   * Chaque séance en recréait une, si bien que trois séances laissaient trois
   * lignes actives de même identité dans la même salle. Le décor était faux —
   * on ne fait pas apparaître un banc à chaque fois qu'on s'en sert — et
   * l'index partiel de la migration 0011 le refuse désormais. L'entrée est
   * donc créée une fois et réutilisée, comme dans la vraie vie.
   */
  const pompesDeLaMaison = async () =>
    (await instanceActive(maison, pompes, "Pompes", {
      conventionCharge: "poids_total", incrementsPossibles: [1],
    })).id;

  /** Enregistre une séance passée où l'exercice prévu a été empêché. */
  const seancePassee = async (date: string, type = "changement_lieu") => {
    const [s] = await db.insert(schema.sessionLogs).values({
      userId: U, date, gymId: maison, dureeMinutes: 55,
    }).returning();
    await db.insert(schema.sessionPlanItems).values({
      sessionLogId: s!.id, ordre: 1,
      exerciseInstanceId: await pompesDeLaMaison(),
      exerciseInstancePrevuId: instDeveloppe,
      raisonSubstitution: "Developpe couche indisponible a Maison",
      contexteAdaptation: {
        type: type as "changement_lieu",
        lieuAvantId: salle, lieuAvantNom: "Salle",
        lieuApresId: maison, lieuApresNom: "Maison",
      },
      seriesCibles: 4, seriesPrevuesAvantAjustement: 4,
      fourchetteRepsMin: 8, fourchetteRepsMax: 12, rpeCible: 8,
      reposSecondes: 120, statut: "prevu",
    });
    return s!.id;
  };

  const nettoyer = async (ids: string[]) => {
    for (const id of ids) {
      await db.delete(schema.setLogs).where(eq(schema.setLogs.sessionLogId, id));
      await db.delete(schema.sessionPlanItems).where(eq(schema.sessionPlanItems.sessionLogId, id));
      await db.delete(schema.sessionLogs).where(eq(schema.sessionLogs.id, id));
    }
  };

  it("un empêchement isolé reste un incident", async () => {
    const { memoireEmpechements } = await import("@/services/memoire");
    const id = await seancePassee("2026-09-19");
    const m = await memoireEmpechements(U, "2026-09-21");
    const dev = m.classes.find((c) => c.exerciceId === developpe);
    expect(dev!.statut).toBe("ponctuel");
    // Un incident ne remet pas le programme en cause.
    expect(m.suggestions).toEqual([]);
    await nettoyer([id]);
  });

  it("trois empêchements au même endroit deviennent un changement durable", async () => {
    const { memoireEmpechements } = await import("@/services/memoire");
    const ids = [
      await seancePassee("2026-09-19"),
      await seancePassee("2026-09-17"),
      await seancePassee("2026-09-15"),
    ];
    const m = await memoireEmpechements(U, "2026-09-21");
    const dev = m.classes.find((c) => c.exerciceId === developpe);
    expect(dev!.statut).toBe("durable");
    expect(dev!.occurrences).toBe(3);

    // Le programme est mis en cause, pas la performance.
    expect(m.suggestions).toHaveLength(1);
    expect(m.suggestions[0]!.message).toMatch(/programme/);
    expect(m.suggestions[0]!.message).not.toMatch(/rattrap|dette|retard/i);
    await nettoyer(ids);
  });

  it("une substitution par préférence n'entre pas dans la mémoire", async () => {
    // La distinction posée précédemment tient : seul l'empêchement subi compte.
    const { memoireEmpechements } = await import("@/services/memoire");
    const id = await seancePassee("2026-09-19", "autre");
    const m = await memoireEmpechements(U, "2026-09-21");
    expect(m.classes.find((c) => c.exerciceId === developpe)).toBeUndefined();
    await nettoyer([id]);
  });

  it("remonte en alerte, sans rien modifier au programme", async () => {
    const { alertes } = await import("@/services/progression");
    const avant = await db.query.seanceTemplates.findMany({});

    const ids = [
      await seancePassee("2026-09-19"),
      await seancePassee("2026-09-17"),
      await seancePassee("2026-09-15"),
    ];
    const liste = await alertes(U);
    const contexte = liste.filter((a) => a.type === "contexte_durable");
    expect(contexte).toHaveLength(1);
    expect(contexte[0]!.priority).toBe("info");

    // Rien n'a été modifié automatiquement.
    expect(await db.query.seanceTemplates.findMany({})).toEqual(avant);
    await nettoyer(ids);
  });

  it("n'ajoute aucun volume pour compenser", async () => {
    // La séance du jour garde exactement les séries du gabarit, quel que soit
    // le nombre d'empêchements passés.
    const ids = [
      await seancePassee("2026-09-19"),
      await seancePassee("2026-09-17"),
      await seancePassee("2026-09-15"),
    ];
    const avant = await seanceEnBase();
    const seriesAvant = avant.reduce((n, x) => n + x.series, 0);

    await appeler({ gymId: salle });

    const apres = await seanceEnBase();
    expect(apres.reduce((n, x) => n + x.series, 0)).toBe(seriesAvant);
    expect(apres).toHaveLength(avant.length);
    await nettoyer(ids);
  });

  it("oublie ce qui est trop ancien", async () => {
    const { memoireEmpechements } = await import("@/services/memoire");
    const id = await seancePassee("2026-01-05");
    const m = await memoireEmpechements(U, "2026-09-21");
    expect(m.classes).toEqual([]);
    await nettoyer([id]);
  });
});

describe("6. changement en plein cycle", () => {
  it("repasse les trois contrôles et mesure la dérive de volume", async () => {
    const { corps } = await appeler({ gymId: maison, apercu: true });
    const v = corps.validation as unknown as {
      seance: { seriesTotales: number };
      semaine: { anomalies: unknown[] };
      cycle: { phase: string; ecartVolumePct: number; aligne: boolean };
    };
    expect(v.seance).toBeTruthy();
    expect(v.semaine).toBeTruthy();
    expect(v.cycle.phase).toBeTruthy();
    // Volume conservé : huit séries avant, huit après.
    expect(v.cycle.ecartVolumePct).toBe(0);
    expect(v.cycle.aligne).toBe(true);
  });

  it("signale la perte de stimulus quand la séance maigrit", async () => {
    await db.update(schema.exercises).set({ equipement: "barre" })
      .where(eq(schema.exercises.id, fente));

    const { corps } = await appeler({ gymId: maison, apercu: true });
    const v = corps.validation as unknown as { cycle: { ecartVolumePct: number; aligne: boolean; motifs: string[] } };
    // La moitié de la séance disparaît : le cycle doit le dire.
    expect(v.cycle.ecartVolumePct).toBe(-50);
    expect(v.cycle.aligne).toBe(false);
    expect(v.cycle.motifs.join(" ")).toMatch(/perd 50 %/);

    await db.update(schema.exercises).set({ equipement: "poids_du_corps" })
      .where(eq(schema.exercises.id, fente));
  });

  it("refuse d'adapter une séance déjà terminée", async () => {
    await db.update(schema.sessionLogs).set({ dureeMinutes: 60 })
      .where(eq(schema.sessionLogs.id, sessionLogId));
    const { status, corps } = await appeler({ gymId: maison });
    expect(status).toBe(409);
    expect(String(corps.error)).toMatch(/terminée/);
  });
});
