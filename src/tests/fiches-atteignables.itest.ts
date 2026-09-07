import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Du catalogue jusqu'à l'écran — le chemin entier, pas le schéma JSON.
 *
 * C'est la leçon des lots 12 et 13, appliquée d'avance. Deux fois de suite, une
 * infrastructure complète et testée est restée inatteignable parce que rien ne
 * reliait ses morceaux : `instance_reglages` qu'aucune route n'écrivait,
 * `verdictSignalement` qu'aucun service n'appelait. Un test de forme aurait été
 * vert dans les deux cas.
 *
 * Ici, la même chaîne peut se rompre à trois endroits. Le seed peut ne pas
 * écrire la colonne. `contexteExecution` peut ne pas la lire. `ficheRenseignee`
 * peut la refuser. Ce fichier les traverse tous, par la ROUTE que l'écran
 * appelle, avec des données écrites comme le seed les écrit.
 */

const SACHA = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({
  getAuthenticatedUserId: async () => SACHA,
  requireAuthenticatedUserId: async () => ({ userId: SACHA, error: null }),
}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { eq, inArray } = await import("drizzle-orm");
const { FICHES_TECHNIQUES, TEMPOS_PAR_DEFAUT } = await import("@/lib/referentiels/fiches-techniques");
const { CATALOGUE_PAR_SLUG } = await import("@/lib/referentiels/catalogue");
const { ficheRenseignee } = await import("@/lib/engine/execution");
const { synchroniserFiches } = await import("@/scripts/synchroniser-fiches");
const execution = await import("@/app/api/execution/[instanceId]/route");

/** Les exercices semés pour ce scénario, par slug. */
const exerciceParSlug = new Map<string, string>();
const instanceParSlug = new Map<string, string>();
let salle = "";

/** Lit le contexte d'exécution EXACTEMENT comme `useContexteExecution` le fait. */
async function contexteDe(slug: string) {
  const instanceId = instanceParSlug.get(slug)!;
  const exerciseId = exerciceParSlug.get(slug)!;
  const res = await execution.GET(
    new Request(`http://t/api/execution/${instanceId}?exerciseId=${exerciseId}`),
    { params: Promise.resolve({ instanceId }) },
  );
  expect(res.status, slug).toBe(200);
  return res.json();
}

/** Les slugs documentés, semés tels que le seed les sème. */
const SLUGS = Object.keys(FICHES_TECHNIQUES);

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBeTruthy();

  await db.insert(schema.users).values({ id: SACHA, email: `${SACHA}@t.test`, nom: "Sacha" });
  const [g] = await db.insert(schema.gyms).values({
    userId: SACHA, nom: `St-Martin ${SACHA.slice(0, 8)}`, equipementsDisponibles: ["machine"],
  }).returning();
  salle = g!.id;

  for (const slug of SLUGS) {
    const c = CATALOGUE_PAR_SLUG.get(slug)!;
    // Semé SANS fiche ni tempo : c'est l'état d'une base en service avant ce
    // lot, et c'est le script de synchronisation qui devra les poser.
    const [ex] = await db.insert(schema.exercises).values({
      userId: null, nom: c.nom, pilier: c.pilier, profilTension: c.profilTension,
      type: c.type, categorieRole: c.categorieRole,
      musclesPrincipaux: c.musclesPrincipaux, musclesSecondaires: c.musclesSecondaires,
      equipement: c.equipement, slug,
    }).returning();
    exerciceParSlug.set(slug, ex!.id);

    const [inst] = await db.insert(schema.exerciseInstances).values({
      userId: SACHA, exerciseId: ex!.id, gymId: salle,
      machineNom: `${c.nom} ${SACHA.slice(0, 6)}`,
      conventionCharge: "pile_affichee", incrementsPossibles: [5],
    }).returning();
    instanceParSlug.set(slug, inst!.id);
  }
});

describe("l'état d'avant : la colonne existe, elle est vide", () => {
  it("aucune fiche n'atteint l'écran tant que rien ne l'a écrite", async () => {
    // Le défaut exact que ce lot corrige, reproduit ici : la plomberie marche,
    // et l'athlète ouvre « Comment faire » sur du vide.
    const contexte = await contexteDe("hack-squat");
    expect(contexte.fiche).toBeNull();
  });
});

describe("la synchronisation pose les fiches sans rien casser", () => {
  it("elle les écrit toutes", async () => {
    const bilan = await synchroniserFiches(true);
    expect(bilan.ecrites.sort()).toEqual(SLUGS.sort());
    expect(bilan.absentes).toEqual([]);
  });

  it("elle est idempotente : la relancer n'écrit plus rien", async () => {
    const bilan = await synchroniserFiches(true);
    expect(bilan.ecrites).toEqual([]);
    expect(bilan.inchangees.sort()).toEqual(SLUGS.sort());
    expect(bilan.temposEcrits).toEqual([]);
  });

  it("elle n'a créé aucun exercice", async () => {
    /*
     * Un INSERT au lieu d'un UPDATE produirait un doublon sous le même slug, et
     * l'historique resterait accroché à l'ancien : une progression coupée en
     * deux.
     *
     * Le compte est comparé AVANT et APRÈS, pas fixé à un : la base de test est
     * partagée entre les scénarios et peut déjà porter ces slugs. C'est
     * l'absence de création qui est vérifiée, pas un nombre absolu.
     */
    const compter = async () => {
      const l = await db.query.exercises.findMany({
        where: inArray(schema.exercises.slug, SLUGS),
        columns: { id: true },
      });
      return l.length;
    };
    const avant = await compter();
    await synchroniserFiches(true);
    expect(await compter()).toBe(avant);
  });

  it("elle n'a touché ni le nom, ni les muscles, ni le pilier", async () => {
    // Ces colonnes ont pu être corrigées à la main depuis ; les réécrire
    // depuis le catalogue effacerait ces corrections sans prévenir.
    for (const slug of SLUGS) {
      const c = CATALOGUE_PAR_SLUG.get(slug)!;
      const ligne = await db.query.exercises.findFirst({
        where: eq(schema.exercises.slug, slug),
      });
      expect(ligne!.nom, slug).toBe(c.nom);
      expect(ligne!.pilier, slug).toBe(c.pilier);
      expect(ligne!.musclesPrincipaux, slug).toEqual(c.musclesPrincipaux);
    }
  });

  it("et elle n'écrase jamais un tempo déjà posé", async () => {
    const slug = "hack-squat";
    await db.update(schema.exercises)
      .set({ tempoParDefaut: "4-2-1-0" })
      .where(eq(schema.exercises.slug, slug));

    const bilan = await synchroniserFiches(true);
    expect(bilan.temposConserves).toContain(slug);

    const ligne = await db.query.exercises.findFirst({
      where: eq(schema.exercises.slug, slug),
    });
    expect(ligne!.tempoParDefaut).toBe("4-2-1-0");

    // Remis dans l'état du catalogue pour la suite du scénario.
    await db.update(schema.exercises)
      .set({ tempoParDefaut: TEMPOS_PAR_DEFAUT[slug]! })
      .where(eq(schema.exercises.slug, slug));
  });
});

describe("et la fiche arrive jusqu'au contexte que l'écran lit", () => {
  it("chaque exercice documenté rend une fiche non nulle", async () => {
    for (const slug of SLUGS) {
      const contexte = await contexteDe(slug);
      expect(contexte.fiche, `${slug} : la fiche n'arrive pas à l'écran`).not.toBeNull();
      expect(ficheRenseignee(contexte.fiche), slug).toBe(true);
    }
  });

  it("avec les rubriques qui comptent devant la machine", async () => {
    const contexte = await contexteDe("seated-row");
    expect(contexte.fiche.installation).toMatch(/règle le siège/i);
    expect(contexte.fiche.execution).toMatch(/coudes/i);
    expect(contexte.fiche.amplitude).toBeTruthy();
    expect(contexte.fiche.sensation).toMatch(/tu devrais/i);
    expect(contexte.fiche.pointsCles.length).toBeGreaterThan(0);
    expect(contexte.fiche.erreursFrequentes.length).toBeGreaterThan(0);
  });

  it("et les muscles du mannequin restent servis par le même contexte", async () => {
    // La PR #13 ne doit pas régresser : la fiche s'ajoute, elle ne remplace pas.
    const contexte = await contexteDe("seated-row");
    expect(contexte.musclesPrincipaux.length).toBeGreaterThan(0);
    expect(contexte.musclesSecondaires.length).toBeGreaterThan(0);
  });
});

describe("le tempo dit d'où il vient", () => {
  it("un tempo spécifique s'annonce comme propre au mouvement", async () => {
    const contexte = await contexteDe("hack-squat");
    expect(contexte.tempo.brut).toBe(TEMPOS_PAR_DEFAUT["hack-squat"]);
    expect(contexte.tempo.origine).toBe("exercice");
  });

  it("et un exercice sans tempo propre reste marqué « défaut »", async () => {
    // C'est ce qui permet à l'écran de dire « repère général » plutôt que de
    // faire passer une convention pour une prescription. Le lot ne remplit pas
    // les cent vingt tempos, donc ce cas doit rester vivant.
    const sansTempo = SLUGS.filter((s) => !TEMPOS_PAR_DEFAUT[s]);
    expect(sansTempo.length).toBeGreaterThan(0);

    const contexte = await contexteDe(sansTempo[0]!);
    expect(contexte.tempo.origine).toBe("defaut");
  });
});

describe("la technique et les réglages restent deux choses distinctes", () => {
  it("un appareil sans réglage décrit garde quand même sa fiche", async () => {
    // La preuve que les deux portées ne se conditionnent pas : la fiche
    // appartient au MOUVEMENT, les réglages à l'APPAREIL.
    const contexte = await contexteDe("seated-row");
    expect(contexte.reglages).toEqual([]);
    expect(contexte.fiche).not.toBeNull();
  });

  it("et une valeur personnelle n'entre jamais dans la fiche commune", async () => {
    /*
     * Le scénario complet : on décrit un siège sur CETTE machine, on y met sa
     * valeur, et la fiche du mouvement ne bouge pas d'un caractère. « Siège 5 »
     * est vrai de cet appareil et de ce corps ; il n'a rien à faire dans une
     * fiche que toutes les autres machines partagent.
     */
    const slug = "seated-row";
    const instanceId = instanceParSlug.get(slug)!;
    const exerciseId = exerciceParSlug.get(slug)!;

    const declaration = await import("@/app/api/execution/[instanceId]/reglages/route");
    const res = await declaration.POST(
      new Request("http://t/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ exerciseId, libelle: "Siège", type: "cran", min: "1", max: "10" }),
      }),
      { params: Promise.resolve({ instanceId }) },
    );
    expect(res.status).toBe(201);

    const patch = await execution.PATCH(
      new Request("http://t/", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ exerciseId, reglages: { siege: "5" } }),
      }),
      { params: Promise.resolve({ instanceId }) },
    );
    expect(patch.status).toBe(200);

    const contexte = await contexteDe(slug);
    expect(contexte.resumeReglages).toBe("Siège 5");

    // La fiche n'a pas bougé, et ne contient aucun chiffre de réglage.
    const texte = JSON.stringify(contexte.fiche);
    expect(texte).not.toMatch(/[Ss]iège\s*5/);
    // `toEqual`, pas une comparaison de chaînes : PostgreSQL réordonne les
    // clés d'un `jsonb`, et c'est le CONTENU qui doit être identique.
    expect(contexte.fiche).toEqual(FICHES_TECHNIQUES[slug]);
  });

  it("la même fiche sert deux machines qui font le même mouvement", async () => {
    // Deux Seated Row de la même salle : un cran recopié de l'une à l'autre
    // serait un souvenir faux, mais la technique, elle, est la même.
    const slug = "seated-row";
    const [autre] = await db.insert(schema.exerciseInstances).values({
      userId: SACHA, exerciseId: exerciceParSlug.get(slug)!, gymId: salle,
      machineNom: `Seated Row n°2 ${SACHA.slice(0, 6)}`,
      conventionCharge: "pile_affichee", incrementsPossibles: [5],
    }).returning();

    const res = await execution.GET(
      new Request(`http://t/api/execution/${autre!.id}?exerciseId=${exerciceParSlug.get(slug)}`),
      { params: Promise.resolve({ instanceId: autre!.id }) },
    );
    const contexte = await res.json();

    expect(contexte.fiche).toEqual(FICHES_TECHNIQUES[slug]);
    // Mais aucun réglage : ils appartiennent à l'autre appareil.
    expect(contexte.reglages).toEqual([]);
  });
});
