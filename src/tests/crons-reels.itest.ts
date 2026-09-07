import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Les deux crons écrivaient un texte fixe. On vérifie qu'ils n'en écrivent plus.
 *
 * CE QUE CES TESTS SURVEILLENT VRAIMENT
 *
 * Un cron qui « marche » est un cron qui rend 200 et incrémente un compteur.
 * Les deux crons rendaient 200 et incrémentaient un compteur depuis le premier
 * jour — en écrivant « Configurez l'intégration LLM pour un debrief
 * personnalisé » dans la colonne `contenu`. Le succès apparent était le défaut.
 *
 * Donc on ne teste pas le statut HTTP. On teste CE QUI EST ÉCRIT :
 *
 *   — la lettre de séance vient de la rotation réelle, pas d'un `"A"` forcé ;
 *   — le texte stocké est celui du modèle, pas un gabarit ;
 *   — un échec du modèle n'écrit RIEN, et n'écrase pas ce qui existait ;
 *   — le prompt d'un compte ne contient pas les données d'un autre.
 *
 * Le modèle est remplacé par une doublure qui ENREGISTRE ce qu'on lui envoie :
 * c'est le seul moyen de vérifier l'isolation, un prompt ne se relit pas depuis
 * la base. Elle peut aussi être mise en panne, parce que le comportement en
 * échec est précisément ce qui a été corrigé.
 */

const SACHA = randomUUID();
const MARIA = randomUUID();

/** Ce que la doublure a reçu, appel par appel. Vidé entre les scénarios. */
let promptsVus: string[] = [];
let appels = 0;
let llmEnPanne = false;

vi.mock("@/lib/coach/llm-client", async (original) => {
  const vrai = await original<typeof import("@/lib/coach/llm-client")>();
  return {
    ...vrai,
    appelerLLM: async (options: { messages: { content: string }[] }) => {
      appels += 1;
      promptsVus.push(options.messages.map((m) => m.content).join("\n"));
      if (llmEnPanne) throw new vrai.CoachIndisponible("modèle indisponible", 503);
      return {
        texte: `Texte du modèle numéro ${appels}`,
        appelsOutils: [],
        modeleUtilise: "test:modele-doublure",
      };
    },
  };
});

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { eq, and } = await import("drizzle-orm");
const { prochaineSeance } = await import("@/services/programmes");

const precalc = await import("@/app/api/cron/precalc-session/route");
const weekly = await import("@/app/api/cron/weekly-debrief/route");

const SECRET = process.env.CRON_SECRET;

const AUJOURDHUI = new Date().toISOString().slice(0, 10);
const HIER = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const DEMAIN = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

/**
 * Un cron s'appelle par HTTP, avec un en-tête. On l'appelle donc comme ça.
 *
 * La route est typée `NextRequest` ; une `Request` standard en porte tout ce
 * dont l'authentification se sert. Le transtypage est local au test.
 */
type Cron = { GET: (r: never) => Promise<Response> };

const appeler = (route: Cron, entete?: string) => route.GET(
  new Request("http://t/", {
    headers: entete !== undefined ? { Authorization: entete } : {},
  }) as never,
);

const autorise = (route: Cron) => appeler(route, `Bearer ${SECRET}`);

/** Les identifiants des templates de Sacha, par lettre. */
const templates: Record<string, string> = {};
let seanceA = "";

beforeAll(async () => {
  expect(process.env.DATABASE_URL, "base de test requise").toBeTruthy();
  // Le secret est lu au chargement du module : le poser après l'import ne
  // servirait à rien. On exige donc qu'il soit dans l'environnement du test.
  expect(SECRET, "CRON_SECRET doit être défini pour cette suite").toBeTruthy();

  for (const [id, nom] of [[SACHA, "Sacha"], [MARIA, "Maria"]] as const) {
    await db.insert(schema.users).values({
      id, email: `${id}@t.test`, nom, onboardingTermineLe: new Date(),
    });
  }

  const [salle] = await db.insert(schema.gyms)
    .values({ userId: SACHA, nom: `Salle ${SACHA.slice(0, 6)}` }).returning();
  const [ex] = await db.insert(schema.exercises).values({
    userId: null, nom: "Développé couché", pilier: "P1_poussee", profilTension: "mi_range",
    type: "polyarticulaire", categorieRole: "pilier",
    musclesPrincipaux: ["pectoraux"], musclesSecondaires: ["triceps"], equipement: "barre",
    slug: `dc-${SACHA.slice(0, 8)}`,
  }).returning();
  const [instance] = await db.insert(schema.exerciseInstances).values({
    userId: SACHA, exerciseId: ex!.id, gymId: salle!.id, machineNom: "Banc 1",
    conventionCharge: "poids_total",
  }).returning();

  /*
   * Le bloc de Sacha : trois séances, A déjà réalisée hier.
   *
   * C'est la configuration qui démasquait le défaut. `prochaineSeance` répond
   * B ; `getNextSeanceLetter()` répondait `"A"` — « for now, simple cycle ».
   * Le tableau de bord annonçait donc B et le cron précalculait A.
   */
  const [bloc] = await db.insert(schema.programmeBlocs).values({
    userId: SACHA, nom: "Bloc 1", dateDebut: HIER, typeCycle: "hypertrophie", actif: true,
  }).returning();

  for (const [i, lettre] of ["A", "B", "C"].entries()) {
    const [t] = await db.insert(schema.seanceTemplates).values({
      blocId: bloc!.id, lettre, nom: `Séance ${lettre}`, ordreDansSemaine: i + 1,
    }).returning();
    templates[lettre] = t!.id;
  }

  /*
   * A, aujourd'hui, CLÔTURÉE (`dureeMinutes` renseigné).
   *
   * C'est ce qui fait avancer la rotation, ce qui rend Sacha « actif », et ce
   * que le débrief hebdomadaire compte. Aujourd'hui plutôt qu'hier parce que
   * « hier » tombe dans la semaine précédente un lundi sur sept : le décor
   * serait juste six jours sur sept, ce qui est la pire des fréquences.
   */
  const [s] = await db.insert(schema.sessionLogs).values({
    userId: SACHA, date: AUJOURDHUI, gymId: salle!.id, seanceTemplateId: templates.A,
    dureeMinutes: 62, feuBiologiqueJour: "vert",
  }).returning();
  seanceA = s!.id;
  await db.insert(schema.setLogs).values([
    { sessionLogId: seanceA, exerciseInstanceId: instance!.id, numeroSerie: 1, repsEffectuees: 8, charge: 80, rpeEffectif: 8 },
    { sessionLogId: seanceA, exerciseInstanceId: instance!.id, numeroSerie: 2, repsEffectuees: 8, charge: 80, rpeEffectif: 9 },
  ]);

  // Maria s'entraîne dans la même salle, aujourd'hui. Elle n'a pas de bloc :
  // son précalcul doit être « ignoré », jamais celui de Sacha.
  const [sm] = await db.insert(schema.sessionLogs).values({
    userId: MARIA, date: AUJOURDHUI, gymId: salle!.id, dureeMinutes: 45,
    feuBiologiqueJour: "orange",
  }).returning();
  await db.insert(schema.setLogs).values({
    sessionLogId: sm!.id, exerciseInstanceId: instance!.id,
    numeroSerie: 1, repsEffectuees: 12, charge: 40, rpeEffectif: 7,
  });
});

beforeEach(() => {
  promptsVus = [];
  llmEnPanne = false;
});

describe("l'authentification du cron", () => {
  it("refuse une requête sans en-tête", async () => {
    expect((await appeler(precalc)).status).toBe(401);
    expect((await appeler(weekly)).status).toBe(401);
  });

  it("refuse un secret erroné, sur les deux routes", async () => {
    expect((await appeler(precalc, "Bearer pas-le-bon")).status).toBe(401);
    expect((await appeler(weekly, "Bearer pas-le-bon")).status).toBe(401);
  });

  it("refuse avant tout appel au modèle", async () => {
    const avant = appels;
    await appeler(precalc, "Bearer pas-le-bon");
    await appeler(weekly, "");
    expect(appels, "le refus doit précéder la dépense").toBe(avant);
  });
});

describe("le précalcul de la séance de demain", () => {
  it("annonce la séance de la rotation, jamais un A forcé", async () => {
    const res = await autorise(precalc);
    expect(res.status).toBe(200);

    const attendue = (await prochaineSeance(SACHA))!;
    expect(attendue.template.lettre, "le décor doit exposer le défaut").toBe("B");

    const ligne = await db.query.precalcSessions.findFirst({
      where: and(
        eq(schema.precalcSessions.userId, SACHA),
        eq(schema.precalcSessions.targetDate, DEMAIN),
      ),
    });
    expect(ligne, "aucun précalcul écrit").toBeTruthy();
    expect(
      ligne!.seanceTemplateId,
      "le cron a précalculé une autre séance que celle annoncée par le tableau de bord",
    ).toBe(attendue.template.id);
    expect(ligne!.seanceTemplateId).not.toBe(templates.A);
  });

  it("écrit le texte du modèle, pas un gabarit", async () => {
    const ligne = await db.query.precalcSessions.findFirst({
      where: and(
        eq(schema.precalcSessions.userId, SACHA),
        eq(schema.precalcSessions.targetDate, DEMAIN),
      ),
    });
    expect(ligne!.contenu).toContain("Texte du modèle");
    // La phrase exacte que la version précédente écrivait, à chaque nuit.
    expect(ligne!.contenu).not.toContain("Configurez l'intégration LLM");
  });

  it("garde la trace du modèle qui a répondu", async () => {
    const ligne = await db.query.precalcSessions.findFirst({
      where: and(
        eq(schema.precalcSessions.userId, SACHA),
        eq(schema.precalcSessions.targetDate, DEMAIN),
      ),
    });
    const contexte = ligne!.contexteUtilise as Record<string, unknown>;
    expect(contexte.modeleUtilise).toBe("test:modele-doublure");
    expect(typeof contexte.genereLe).toBe("string");
  });

  it("ne relance pas la nuit suivante ce qu'il a déjà écrit ailleurs", async () => {
    // Idempotence : deux passages, une seule ligne. La contrainte d'unicité
    // (user, date) ferait échouer un second INSERT — le cron doit mettre à jour.
    const res = await autorise(precalc);
    expect(res.status).toBe(200);

    const lignes = await db.select().from(schema.precalcSessions)
      .where(and(
        eq(schema.precalcSessions.userId, SACHA),
        eq(schema.precalcSessions.targetDate, DEMAIN),
      ));
    expect(lignes, "un précalcul par jour et par compte").toHaveLength(1);
  });

  it("ne met dans le prompt que les données du compte concerné", async () => {
    promptsVus = [];
    await autorise(precalc);
    expect(promptsVus.length).toBeGreaterThan(0);
    for (const p of promptsVus) {
      // Un identifiant d'un autre compte dans un prompt, c'est une fuite qui
      // ne se voit pas : le texte produit reste plausible.
      expect(p, "un prompt porte l'identifiant d'un autre compte").not.toContain(MARIA);
      expect(p).not.toContain(SACHA);
    }
  });

  it("un échec du modèle conserve le précalcul existant", async () => {
    const avant = (await db.query.precalcSessions.findFirst({
      where: and(
        eq(schema.precalcSessions.userId, SACHA),
        eq(schema.precalcSessions.targetDate, DEMAIN),
      ),
    }))!;

    llmEnPanne = true;
    const res = await autorise(precalc);
    const bilan = await res.json();
    expect(bilan.generes).toBe(0);
    expect(bilan.conserves).toBeGreaterThanOrEqual(1);

    const apres = (await db.query.precalcSessions.findFirst({
      where: eq(schema.precalcSessions.id, avant.id),
    }))!;
    expect(apres.contenu, "un échec a écrasé un précalcul valide").toBe(avant.contenu);
  });

  it("un échec sans précalcul antérieur n'écrit rien du tout", async () => {
    await db.delete(schema.precalcSessions).where(eq(schema.precalcSessions.userId, SACHA));

    llmEnPanne = true;
    const res = await autorise(precalc);
    const bilan = await res.json();
    expect(bilan.generes).toBe(0);
    expect(bilan.ignores).toBeGreaterThanOrEqual(1);

    const lignes = await db.select().from(schema.precalcSessions)
      .where(eq(schema.precalcSessions.userId, SACHA));
    expect(lignes, "un placeholder a été écrit à la place d'un vrai brief").toHaveLength(0);
  });

  it("un compte sans bloc actif est ignoré, pas mis en erreur", async () => {
    llmEnPanne = false;
    const res = await autorise(precalc);
    const bilan = await res.json();
    expect(bilan.erreurs, "Maria n'a pas de programme : ce n'est pas une panne").toEqual([]);

    const chezMaria = await db.select().from(schema.precalcSessions)
      .where(eq(schema.precalcSessions.userId, MARIA));
    expect(chezMaria).toHaveLength(0);
  });
});

describe("le débrief de la semaine", () => {
  it("écrit un texte du modèle pour la semaine en cours", async () => {
    const res = await autorise(weekly);
    expect(res.status).toBe(200);
    const bilan = await res.json();
    expect(bilan.generes).toBeGreaterThanOrEqual(1);

    const ligne = await db.query.weeklyDebriefs.findFirst({
      where: eq(schema.weeklyDebriefs.userId, SACHA),
    });
    expect(ligne!.contenu).toContain("Texte du modèle");
    expect(ligne!.contenu).not.toContain("Configurez l'intégration LLM");
  });

  it("porte des statistiques comptées, pas estimées", async () => {
    const ligne = (await db.query.weeklyDebriefs.findFirst({
      where: eq(schema.weeklyDebriefs.userId, SACHA),
    }))!;
    const stats = ligne.stats as Record<string, unknown>;

    expect(stats.nbSeances).toBe(1);
    expect(stats.nbSeries, "deux séries ont été enregistrées").toBe(2);
    // 80 × 8 × 2 : le volume se recompte à la main, sinon il ne se vérifie pas.
    expect(stats.volumeTotal).toBe(1280);
    expect(stats.dureeTotaleMinutes).toBe(62);
    expect(stats.feux).toMatchObject({ vert: 1, orange: 0, rouge: 0 });
  });

  it("n'invente ni progressions ni stagnations", async () => {
    // Le passage a lieu DANS ce test : `promptsVus` est vidé avant chacun, et
    // c'est justement ce que le modèle reçoit qu'on veut relire ici.
    await autorise(weekly);

    const ligne = (await db.query.weeklyDebriefs.findFirst({
      where: eq(schema.weeklyDebriefs.userId, SACHA),
    }))!;
    const stats = ligne.stats as Record<string, unknown>;
    // Supprimées, pas vidées : un tableau vide invite le modèle à le remplir.
    expect(stats).not.toHaveProperty("progressions");
    expect(stats).not.toHaveProperty("stagnations");

    expect(promptsVus.length).toBeGreaterThan(0);
    for (const p of promptsVus) {
      expect(p).not.toContain("progressions");
      expect(p).not.toContain("stagnations");
    }
  });

  it("garde la trace du modèle qui a répondu", async () => {
    const ligne = (await db.query.weeklyDebriefs.findFirst({
      where: eq(schema.weeklyDebriefs.userId, SACHA),
    }))!;
    const stats = ligne.stats as Record<string, unknown>;
    expect(stats.modeleUtilise).toBe("test:modele-doublure");
    expect(typeof stats.genereLe).toBe("string");
  });

  it("ne réécrit pas une ligne par passage", async () => {
    await autorise(weekly);
    const lignes = await db.select().from(schema.weeklyDebriefs)
      .where(eq(schema.weeklyDebriefs.userId, SACHA));
    expect(lignes, "un débrief par semaine et par compte").toHaveLength(1);
  });

  it("un échec du modèle conserve le débrief précédent", async () => {
    const avant = (await db.query.weeklyDebriefs.findFirst({
      where: eq(schema.weeklyDebriefs.userId, SACHA),
    }))!;

    llmEnPanne = true;
    const bilan = await (await autorise(weekly)).json();
    expect(bilan.generes).toBe(0);
    expect(bilan.conserves).toBeGreaterThanOrEqual(1);

    const apres = (await db.query.weeklyDebriefs.findFirst({
      where: eq(schema.weeklyDebriefs.id, avant.id),
    }))!;
    expect(apres.contenu).toBe(avant.contenu);
  });

  it("ne mélange pas deux comptes de la même salle", async () => {
    llmEnPanne = false;
    promptsVus = [];
    await autorise(weekly);

    for (const p of promptsVus) {
      expect(p).not.toContain(SACHA);
      expect(p).not.toContain(MARIA);
    }

    // Maria a bien sa propre ligne, distincte de celle de Sacha.
    const chezMaria = await db.select().from(schema.weeklyDebriefs)
      .where(eq(schema.weeklyDebriefs.userId, MARIA));
    const chezSacha = await db.select().from(schema.weeklyDebriefs)
      .where(eq(schema.weeklyDebriefs.userId, SACHA));
    expect(chezMaria).toHaveLength(1);
    expect(chezSacha).toHaveLength(1);
    expect(chezMaria[0]!.contenu).not.toBe(chezSacha[0]!.contenu);
  });
});
