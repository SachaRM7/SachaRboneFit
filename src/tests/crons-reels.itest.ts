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

/**
 * Les quatre façons dont l'appel peut mal finir, telles qu'elles arrivent.
 *
 *   http503        le fournisseur est en panne — le repli a été tenté et a cédé
 *   nonConfigure   la clé manque : `CoachIndisponible` SANS code HTTP
 *   vide           le modèle a répondu, mais n'a rien écrit
 *
 * Elles sont distinguées parce que le bilan doit les distinguer : « HTTP 503 »
 * et « non configuré » n'appellent pas la même intervention.
 */
type Panne = null | "http503" | "nonConfigure" | "vide";
let panne: Panne = null;

/**
 * Un corps d'erreur qui RECOPIE la requête, comme le font les fournisseurs.
 *
 * `Groq 400 : {"error": …, "request": …}` reporte le corps de la réponse, et
 * rien ne garantit qu'il n'y figure pas un morceau du prompt. La doublure met
 * donc un marqueur reconnaissable dans le message : si ce marqueur ressort dans
 * `erreurs`, c'est que le contexte personnel a fuité jusqu'au journal.
 */
const MARQUEUR_FUITE = "COURBATURE-CONFIDENTIELLE-42";

vi.mock("@/lib/coach/llm-client", async (original) => {
  const vrai = await original<typeof import("@/lib/coach/llm-client")>();
  return {
    ...vrai,
    appelerLLM: async (options: { messages: { content: string }[] }) => {
      appels += 1;
      promptsVus.push(options.messages.map((m) => m.content).join("\n"));
      if (panne === "http503") {
        throw new vrai.CoachIndisponible(`Groq 503 : {"echo": "${MARQUEUR_FUITE}"}`, 503);
      }
      if (panne === "nonConfigure") {
        throw new vrai.CoachIndisponible("Clé GROQ_API_KEY non configurée");
      }
      return {
        texte: panne === "vide" ? "   " : `Texte du modèle numéro ${appels}`,
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

const { complementTableauDeBord } = await import("@/services/tableau-de-bord");

const precalc = await import("@/app/api/cron/precalc-session/route");
const weekly = await import("@/app/api/cron/weekly-debrief/route");

/**
 * Le lundi et le dimanche de la semaine en cours.
 *
 * Recalculé ici plutôt qu'importé : la route et le tableau de bord ont chacun
 * leur version privée, et un test qui appellerait l'une des deux ne prouverait
 * plus qu'elles s'accordent — il hériterait de leur éventuelle erreur commune.
 */
function semaineCourante(): { debut: string; fin: string } {
  const debut = new Date();
  debut.setDate(debut.getDate() - ((debut.getDay() + 6) % 7));
  const fin = new Date(debut);
  fin.setDate(debut.getDate() + 6);
  return { debut: debut.toISOString().slice(0, 10), fin: fin.toISOString().slice(0, 10) };
}

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
  panne = null;
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

    panne = "http503";
    const res = await autorise(precalc);
    const bilan = await res.json();
    expect(bilan.generes).toBe(0);
    expect(bilan.conserves).toBeGreaterThanOrEqual(1);
    // Conserver n'est pas se taire : la panne doit rester visible.
    expect(bilan.erreurs.length, "une panne a produit un rapport vide")
      .toBeGreaterThanOrEqual(1);
    expect(bilan.erreurs.join(" ")).toContain("HTTP 503");

    const apres = (await db.query.precalcSessions.findFirst({
      where: eq(schema.precalcSessions.id, avant.id),
    }))!;
    expect(apres.contenu, "un échec a écrasé un précalcul valide").toBe(avant.contenu);
  });

  it("un échec sans précalcul antérieur n'écrit rien du tout", async () => {
    await db.delete(schema.precalcSessions).where(eq(schema.precalcSessions.userId, SACHA));

    panne = "http503";
    const res = await autorise(precalc);
    const bilan = await res.json();
    expect(bilan.generes).toBe(0);
    expect(bilan.ignores).toBeGreaterThanOrEqual(1);
    expect(bilan.erreurs.length, "ignorer sans rien dire").toBeGreaterThanOrEqual(1);

    const lignes = await db.select().from(schema.precalcSessions)
      .where(eq(schema.precalcSessions.userId, SACHA));
    expect(lignes, "un placeholder a été écrit à la place d'un vrai brief").toHaveLength(0);
  });

  it("un compte sans bloc actif est ignoré, pas mis en erreur", async () => {
    panne = null;
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

    panne = "http503";
    const bilan = await (await autorise(weekly)).json();
    expect(bilan.generes).toBe(0);
    expect(bilan.conserves).toBeGreaterThanOrEqual(1);

    const apres = (await db.query.weeklyDebriefs.findFirst({
      where: eq(schema.weeklyDebriefs.id, avant.id),
    }))!;
    expect(apres.contenu).toBe(avant.contenu);
  });

  it("ne mélange pas deux comptes de la même salle", async () => {
    panne = null;
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

/*
 * Les textes EXACTS que les crons écrivaient avant ce lot.
 *
 * Recopiés depuis `bf05623`, pas réinventés : un décor approximatif ne
 * prouverait rien sur les lignes réellement en base.
 */
const PRECALC_HERITE =
  "[Pré-calcul pour Sacha - Séance A]\n\nCe résumé est généré automatiquement."
  + " Configurez l'intégration LLM pour générer un contenu personnalisé.";
const WEEKLY_HERITE =
  "[Debrief hebdomadaire pour Sacha]\n\n1 séances effectuées\n2 séries au total"
  + "\n\nConfigurez l'intégration LLM pour un debrief personnalisé.";

describe("les placeholders écrits avant ce lot ne survivent pas", () => {
  /*
   * Ces lignes sont TOUJOURS en base : cette PR ne supprime aucune donnée.
   * Elles ont exactement la forme d'un résultat — une date, un `contenu` non
   * vide — et l'écran affichait n'importe quelle ligne existante. Corriger les
   * crons sans les reconnaître aurait laissé le défaut visible après le merge.
   */
  const semerPrecalcHerite = async () => {
    await db.delete(schema.precalcSessions).where(eq(schema.precalcSessions.userId, SACHA));
    await db.insert(schema.precalcSessions).values({
      userId: SACHA, targetDate: AUJOURDHUI, seanceTemplateId: templates.A,
      contenu: PRECALC_HERITE,
      // Un contexte SANS `modeleUtilise` : c'est ce que l'ancien code écrivait.
      contexteUtilise: { nextLetter: "A", sessionsCount: 1 },
    });
  };

  const semerWeeklyHerite = async () => {
    await db.delete(schema.weeklyDebriefs).where(eq(schema.weeklyDebriefs.userId, SACHA));
    await db.insert(schema.weeklyDebriefs).values({
      userId: SACHA, weekStart: semaineCourante().debut, weekEnd: semaineCourante().fin,
      contenu: WEEKLY_HERITE,
      stats: { nbSeances: 1, nbSeries: 2, progressions: [], stagnations: [] },
    });
  };

  it("un précalcul hérité n'est pas affiché au tableau de bord", async () => {
    await semerPrecalcHerite();
    const data = await complementTableauDeBord(SACHA);
    expect(data.precalcSession, "un placeholder est encore à l'écran").toBeNull();
  });

  it("un débrief hebdomadaire hérité n'est pas affiché non plus", async () => {
    await semerWeeklyHerite();
    const data = await complementTableauDeBord(SACHA);
    expect(data.weeklyDebrief, "un placeholder est encore à l'écran").toBeNull();
  });

  it("un vrai contenu tracé, lui, s'affiche", async () => {
    // Le contrôle qui empêche le filtre d'être un simple « ne rien montrer ».
    await db.delete(schema.precalcSessions).where(eq(schema.precalcSessions.userId, SACHA));
    await db.insert(schema.precalcSessions).values({
      userId: SACHA, targetDate: AUJOURDHUI, seanceTemplateId: templates.B,
      contenu: "Demain : Séance B. Priorité au dos.",
      contexteUtilise: { modeleUtilise: "test:modele-doublure", genereLe: new Date().toISOString() },
    });
    const data = await complementTableauDeBord(SACHA);
    expect(data.precalcSession?.contenu).toContain("Séance B");
  });

  it("une panne ne « conserve » jamais un précalcul hérité", async () => {
    await semerPrecalcHerite();
    // Le précalcul hérité porte la date du jour ; le cron vise demain. On sème
    // donc aussi la ligne de demain, qui est celle que la panne examinera.
    await db.insert(schema.precalcSessions).values({
      userId: SACHA, targetDate: DEMAIN, seanceTemplateId: templates.A,
      contenu: PRECALC_HERITE,
      contexteUtilise: { nextLetter: "A" },
    });

    panne = "http503";
    const bilan = await (await autorise(precalc)).json();
    expect(bilan.conserves, "un placeholder a été tenu pour un résultat utile").toBe(0);
    expect(bilan.ignores).toBeGreaterThanOrEqual(1);
    expect(bilan.erreurs.length).toBeGreaterThanOrEqual(1);
  });

  it("une panne ne « conserve » jamais un débrief hérité", async () => {
    await semerWeeklyHerite();
    // Maria porte un vrai débrief tracé, écrit plus haut : le laisser en place
    // ferait compter SON `conserves` légitime et masquerait celui qu'on refuse.
    await db.delete(schema.weeklyDebriefs).where(eq(schema.weeklyDebriefs.userId, MARIA));

    panne = "http503";
    const bilan = await (await autorise(weekly)).json();
    expect(bilan.conserves, "un placeholder a été tenu pour un résultat utile").toBe(0);
    expect(bilan.erreurs.length).toBeGreaterThanOrEqual(1);

    // Et la ligne héritée est intacte : on ne supprime rien, on l'ignore.
    const ligne = (await db.query.weeklyDebriefs.findFirst({
      where: eq(schema.weeklyDebriefs.userId, SACHA),
    }))!;
    expect(ligne.contenu).toBe(WEEKLY_HERITE);
  });

  it("mais une panne conserve bien un contenu réellement tracé", async () => {
    panne = null;
    await autorise(precalc); // écrit un vrai précalcul pour demain
    const vrai = (await db.query.precalcSessions.findFirst({
      where: and(
        eq(schema.precalcSessions.userId, SACHA),
        eq(schema.precalcSessions.targetDate, DEMAIN),
      ),
    }))!;
    expect(vrai.contenu).toContain("Texte du modèle");

    panne = "http503";
    const bilan = await (await autorise(precalc)).json();
    expect(bilan.conserves, "un vrai contenu a été perdu").toBeGreaterThanOrEqual(1);

    const apres = (await db.query.precalcSessions.findFirst({
      where: eq(schema.precalcSessions.id, vrai.id),
    }))!;
    expect(apres.contenu).toBe(vrai.contenu);
  });

  it("un succès remplace la ligne héritée, sans qu'on ait rien supprimé", async () => {
    await semerPrecalcHerite();
    await db.delete(schema.precalcSessions)
      .where(and(
        eq(schema.precalcSessions.userId, SACHA),
        eq(schema.precalcSessions.targetDate, DEMAIN),
      ));
    await db.insert(schema.precalcSessions).values({
      userId: SACHA, targetDate: DEMAIN, seanceTemplateId: templates.A,
      contenu: PRECALC_HERITE, contexteUtilise: { nextLetter: "A" },
    });

    panne = null;
    const bilan = await (await autorise(precalc)).json();
    expect(bilan.generes).toBeGreaterThanOrEqual(1);

    const ligne = (await db.query.precalcSessions.findFirst({
      where: and(
        eq(schema.precalcSessions.userId, SACHA),
        eq(schema.precalcSessions.targetDate, DEMAIN),
      ),
    }))!;
    expect(ligne.contenu).toContain("Texte du modèle");
    expect(ligne.contenu).not.toContain("Configurez l'intégration LLM");
    // Et l'`upsert` a mis à jour : il n'a pas empilé une seconde ligne.
    const lignes = await db.select().from(schema.precalcSessions)
      .where(and(
        eq(schema.precalcSessions.userId, SACHA),
        eq(schema.precalcSessions.targetDate, DEMAIN),
      ));
    expect(lignes).toHaveLength(1);
  });
});

describe("une panne du modèle ne passe plus pour une semaine calme", () => {
  it("une clé absente se distingue d'un 503", async () => {
    panne = "nonConfigure";
    const bilan = await (await autorise(precalc)).json();
    expect(bilan.erreurs.length).toBeGreaterThanOrEqual(1);
    const texte = bilan.erreurs.join(" ");
    expect(texte).toContain("non configuré");
    // Le NOM de la variable d'environnement ne sort pas : recopié dans un
    // canal partagé, il renseigne sur l'infrastructure.
    expect(texte, "le nom de la variable a fuité").not.toContain("GROQ_API_KEY");
  });

  it("une réponse vide est une erreur, pas un texte", async () => {
    panne = "vide";
    const bilan = await (await autorise(precalc)).json();
    expect(bilan.generes).toBe(0);
    expect(bilan.erreurs.join(" ")).toContain("réponse vide");

    const lignes = await db.select().from(schema.precalcSessions)
      .where(and(
        eq(schema.precalcSessions.userId, SACHA),
        eq(schema.precalcSessions.targetDate, DEMAIN),
      ));
    for (const l of lignes) expect(l.contenu.trim().length).toBeGreaterThan(0);
  });

  it("l'erreur ne transporte jamais ce qui a été envoyé au modèle", async () => {
    panne = "http503";
    const p = await (await autorise(precalc)).json();
    const w = await (await autorise(weekly)).json();

    for (const erreurs of [p.erreurs, w.erreurs]) {
      expect(erreurs.length).toBeGreaterThanOrEqual(1);
      const texte = erreurs.join(" ");
      // Le message du fournisseur recopiait la requête : rien n'en ressort.
      expect(texte, "le corps de la réponse fournisseur a été relayé")
        .not.toContain(MARQUEUR_FUITE);
      expect(texte).not.toContain("pectoraux");
      expect(texte).not.toContain("Séance");
      expect(texte).not.toContain("{");
      // L'identifiant reste, lui : c'est ce qui rend l'erreur exploitable.
      expect(texte).toContain(SACHA);
    }
  });

  it("un compte sans programme reste « ignoré » sans erreur", async () => {
    panne = null;
    const bilan = await (await autorise(precalc)).json();
    // Maria n'a pas de bloc actif. Compter ça comme une panne noierait les
    // vraies sous les comptes au repos.
    expect(bilan.ignores).toBeGreaterThanOrEqual(1);
    expect(bilan.erreurs).toEqual([]);
  });
});

describe("la semaine ne s'exprime plus en kilos", () => {
  it("une série d'assistance n'ajoute aucun tonnage", async () => {
    /*
     * Une machine d'assistance : le nombre saisi est une AIDE. Additionnée au
     * reste, elle rendait la séance la plus assistée « la plus lourde ».
     *
     * On la met à 64 kg — plus que le développé de Sacha — précisément pour
     * qu'un total en kilos, s'il subsistait quelque part, saute aux yeux.
     */
    const salle = await db.query.gyms.findFirst({ where: eq(schema.gyms.userId, SACHA) });
    const [assist] = await db.insert(schema.exercises).values({
      userId: null, nom: "Chin Assist", pilier: "P2_tirage", profilTension: "mi_range",
      type: "polyarticulaire", categorieRole: "pilier",
      musclesPrincipaux: ["dorsaux"], musclesSecondaires: [], equipement: "machine",
      slug: `chin-assist-${SACHA.slice(0, 8)}`,
    }).returning();
    const [inst] = await db.insert(schema.exerciseInstances).values({
      userId: SACHA, exerciseId: assist!.id, gymId: salle!.id, machineNom: "Chin Assist",
      conventionCharge: "pile_affichee", natureCharge: "assistance",
    }).returning();
    await db.insert(schema.setLogs).values({
      sessionLogId: seanceA, exerciseInstanceId: inst!.id,
      numeroSerie: 3, repsEffectuees: 10, charge: 64, rpeEffectif: 8,
    });

    panne = null;
    promptsVus = [];
    await autorise(weekly);

    const ligne = (await db.query.weeklyDebriefs.findFirst({
      where: eq(schema.weeklyDebriefs.userId, SACHA),
    }))!;
    const stats = ligne.stats as Record<string, unknown>;

    expect(stats, "le volume global en kilos est revenu").not.toHaveProperty("volumeTotal");
    for (const p of promptsVus) {
      expect(p, "un tonnage hebdomadaire est encore envoyé au modèle")
        .not.toMatch(/volumeTotal|volume_total/);
      // 80×8×2 + 64×10 = 1920 : le total qu'un `sum(charge × reps)` produirait.
      expect(p).not.toContain("1920");
    }
  });

  it("et les statistiques qui restent sont, elles, comparables", async () => {
    const ligne = (await db.query.weeklyDebriefs.findFirst({
      where: eq(schema.weeklyDebriefs.userId, SACHA),
    }))!;
    const stats = ligne.stats as Record<string, unknown>;

    // Trois séries maintenant : les deux du développé, plus l'assistance.
    // Une série reste une série, quelle que soit la convention de charge.
    expect(stats.nbSeries).toBe(3);
    expect(stats.nbSeances).toBe(1);
    expect(stats.dureeTotaleMinutes).toBe(62);
    expect(stats.feux).toMatchObject({ vert: 1 });
  });

  it("le bilan de progression par exercice n'est pas touché", async () => {
    /*
     * Le volume garde son sens À L'ÉCHELLE D'UN EXERCICE, où la convention est
     * connue. Ce lot ne devait pas y toucher : on vérifie que la règle qui
     * écarte les assistances des records est toujours là, et toujours seule.
     */
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/lib/engine/bilan-progression.ts", "utf8");
    expect(source).toContain('s.natureCharge !== "assistance"');
  });
});
