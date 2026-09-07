import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Le 6 septembre, rejoué — et tout ce qui ne doit PAS en découler.
 *
 * Pendant Calibration B, l'utilisateur a signalé un léger mal de tête.
 * L'application n'avait aucun endroit où le mettre : les trois cases
 * existantes portent un muscle (courbature), une zone anatomique (douleur) ou
 * une seule dimension (énergie). Un état global n'entrait dans aucune.
 *
 * Le risque de ce lot n'est pas de sous-réagir. C'est de SURRÉAGIR : qu'un mal
 * de tête à 2/10 crée une contrainte, retire des exercices, fasse passer des
 * muscles en récupération ou bloque la séance du lendemain. Une application qui
 * fait ça apprend à son utilisateur à ne plus rien déclarer, et on perd la
 * donnée en même temps que la confiance.
 *
 * La moitié de ce fichier vérifie donc des ABSENCES.
 */

const SACHA = randomUUID();
const MARIA = randomUUID();

// L'authentification est la porte d'entrée des deux routes : on la contrôle
// pour pouvoir vérifier qu'un compte ne lit jamais l'autre.
let connecte = SACHA;
vi.mock("@/lib/supabase/auth-helper", () => ({
  getAuthenticatedUserId: async () => connecte,
}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { eq, and } = await import("drizzle-orm");
const { NextRequest } = await import("next/server");

const incidents = await import("@/app/api/incidents/route");
const dailyState = await import("@/app/api/daily-state/route");
const { contraintesActives } = await import("@/services/contraintes");
const { recuperationMusculaire } = await import("@/services/recuperation");
const { agregerSymptomes, lireSymptomeIncident } = await import("@/lib/engine/symptome-general");

const AUJOURDHUI = new Date().toISOString().slice(0, 10);

let seanceSacha = "";
let seanceMaria = "";
let instance = "";

const poster = (corps: unknown) =>
  incidents.POST(new Request("http://t/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  }) as never);

// `nextUrl` n'existe que sur une `NextRequest` : la route lit le paramètre
// de requête par là.
const lireIncidents = (sessionId: string) =>
  incidents.GET(new NextRequest(`http://t/api/incidents?session_id=${sessionId}`));

const posterEtatDuJour = (corps: unknown) =>
  dailyState.POST(new Request("http://t/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  }));

/** Un état du jour complet, auquel on greffe ce que le test veut éprouver. */
const etatDeBase = (extra: Record<string, unknown> = {}) => ({
  date: AUJOURDHUI,
  sommeilHeures: 7,
  jeuneBool: false,
  shiftRecentBool: false,
  shiftType: "aucun",
  energieDepart: 7,
  courbatures: [],
  ...extra,
});

beforeAll(async () => {
  expect(process.env.DATABASE_URL, "base de test requise").toBeTruthy();

  for (const [id, nom] of [[SACHA, "Sacha"], [MARIA, "Maria"]] as const) {
    await db.insert(schema.users).values({
      id, email: `${id}@t.test`, nom, onboardingTermineLe: new Date(),
    });
  }

  // Une seule salle, partagée : c'est le décor où une fuite se verrait.
  const [salle] = await db.insert(schema.gyms)
    .values({ userId: SACHA, nom: `Salle ${SACHA.slice(0, 6)}` }).returning();
  const [ex] = await db.insert(schema.exercises).values({
    userId: null, nom: "Développé couché", pilier: "P1_poussee", profilTension: "mi_range",
    type: "polyarticulaire", categorieRole: "pilier",
    musclesPrincipaux: ["pectoraux"], musclesSecondaires: ["triceps"], equipement: "barre",
    slug: `dc-${SACHA.slice(0, 8)}`,
  }).returning();
  const [inst] = await db.insert(schema.exerciseInstances).values({
    userId: SACHA, exerciseId: ex!.id, gymId: salle!.id, machineNom: "Banc 1",
    conventionCharge: "poids_total",
  }).returning();
  instance = inst!.id;

  const [s] = await db.insert(schema.sessionLogs).values({
    userId: SACHA, date: AUJOURDHUI, gymId: salle!.id, dureeMinutes: 55,
    feuBiologiqueJour: "vert",
  }).returning();
  seanceSacha = s!.id;
  await db.insert(schema.setLogs).values({
    sessionLogId: seanceSacha, exerciseInstanceId: instance,
    numeroSerie: 1, repsEffectuees: 8, charge: 80, rpeEffectif: 8,
  });

  const [m] = await db.insert(schema.sessionLogs).values({
    userId: MARIA, date: AUJOURDHUI, gymId: salle!.id, dureeMinutes: 40,
  }).returning();
  seanceMaria = m!.id;
});

describe("le mal de tête du 6 septembre", () => {
  it("est enregistré comme symptôme général, pendant la séance", async () => {
    connecte = SACHA;
    const res = await poster({
      session_log_id: seanceSacha,
      type: "symptome_general",
      contexte: {
        symptome: "mal_de_tete", intensite: 2, moment: "pendant_seance",
      },
      decision: "continuer",
    });
    expect(res.status).toBe(201);

    const ligne = await db.query.sessionIncidents.findFirst({
      where: eq(schema.sessionIncidents.sessionLogId, seanceSacha),
    });
    expect(ligne!.type).toBe("symptome_general");
    expect(ligne!.decision).toBe("continuer");
  });

  it("et il se relit comme un symptôme, pas comme une douleur", async () => {
    const ligne = (await db.query.sessionIncidents.findFirst({
      where: eq(schema.sessionIncidents.sessionLogId, seanceSacha),
    }))!;
    const relu = lireSymptomeIncident(ligne.contexte);
    expect(relu).not.toBeNull();
    expect(relu!.symptome).toBe("mal_de_tete");
    expect(relu!.intensite).toBe(2);
    expect(relu!.moment).toBe("pendant_seance");
    // Aucun muscle, aucune zone : c'est ce qui le distingue d'une douleur.
    expect(ligne.contexte).not.toHaveProperty("muscle");
    expect(ligne.contexte).not.toHaveProperty("zones");
  });

  it("il n'a créé AUCUNE contrainte musculaire", async () => {
    // La chose à ne surtout pas faire : transformer un mal de tête en zone
    // ménagée, donc en exercices écartés — au hasard, puisqu'il n'y a pas de
    // muscle à désigner.
    const c = await contraintesActives(SACHA);
    expect(c, "un symptôme général a produit une contrainte").toEqual([]);
  });

  it("il n'a modifié aucune récupération musculaire", async () => {
    /*
     * Le score de récupération se nourrit des courbatures, pas des symptômes.
     * Un mal de tête qui ferait basculer les pectoraux en « à ménager »
     * bloquerait la séance du lendemain sur une donnée sans rapport.
     */
    const etat = await recuperationMusculaire(SACHA);
    for (const m of etat.muscles) {
      expect(m.severiteContrainte, `${m.muscle} porte une contrainte`).toBeNull();
      expect(m.courbature, `${m.muscle} a gagné une courbature`).toBe(0);
    }
  });

  it("il n'a retiré aucun exercice du programme", async () => {
    // Aucune ligne de programme retirée, aucune série effacée : « continuer »
    // veut dire continuer.
    const series = await db.select().from(schema.setLogs)
      .where(eq(schema.setLogs.sessionLogId, seanceSacha));
    expect(series).toHaveLength(1);
  });

  it("et le débrief sait le relire comme un symptôme général", async () => {
    const lignes = await db.select().from(schema.sessionIncidents)
      .where(eq(schema.sessionIncidents.sessionLogId, seanceSacha));
    const agrege = agregerSymptomes(
      lignes.filter((i) => i.type === "symptome_general")
        .map((i) => lireSymptomeIncident(i.contexte))
        .filter((s): s is NonNullable<typeof s> => s !== null),
    );
    expect(agrege).toHaveLength(1);
    expect(agrege[0]).toMatchObject({ libelle: "Mal de tête", fois: 1, intensiteMax: 2 });
    // Ce que le modèle recevra : un type, un compte, une intensité. Pas la note.
    expect(agrege[0]).not.toHaveProperty("note");
  });
});

describe("les décisions sont consignées telles qu'elles ont été prises", () => {
  it("« alléger » se distingue de « continuer » dans l'incident", async () => {
    connecte = SACHA;
    const res = await poster({
      session_log_id: seanceSacha,
      type: "symptome_general",
      contexte: { symptome: "nausee", intensite: 5, moment: "pendant_seance" },
      decision: "alleger",
    });
    expect(res.status).toBe(201);
    const ligne = await res.json();
    expect(ligne.decision).toBe("alleger");
  });

  it("« arrêter » aussi", async () => {
    const res = await poster({
      session_log_id: seanceSacha,
      type: "symptome_general",
      contexte: { symptome: "vertige", intensite: 8, moment: "pendant_seance" },
      decision: "arreter",
    });
    expect(res.status).toBe(201);
    expect((await res.json()).decision).toBe("arreter");
  });

  it("continuer malgré une proposition d'arrêt persiste quand même", async () => {
    /*
     * Le cas le plus facile à perdre : l'application propose de terminer, la
     * personne continue, et la modale se ferme. Si rien n'est écrit, le
     * signalement le plus sérieux de la séance est aussi le seul qui disparaît.
     */
    const avant = (await db.select().from(schema.sessionIncidents)
      .where(eq(schema.sessionIncidents.sessionLogId, seanceSacha))).length;

    const res = await poster({
      session_log_id: seanceSacha,
      type: "symptome_general",
      contexte: { symptome: "malaise", intensite: 7, moment: "pendant_seance" },
      decision: "continuer",
    });
    expect(res.status).toBe(201);

    const apres = await db.select().from(schema.sessionIncidents)
      .where(eq(schema.sessionIncidents.sessionLogId, seanceSacha));
    expect(apres).toHaveLength(avant + 1);
    expect(apres.at(-1)!.decision).toBe("continuer");
  });

  it("plusieurs symptômes s'agrègent par type, sans se dupliquer", async () => {
    const lignes = await db.select().from(schema.sessionIncidents)
      .where(eq(schema.sessionIncidents.sessionLogId, seanceSacha));
    const agrege = agregerSymptomes(
      lignes.filter((i) => i.type === "symptome_general")
        .map((i) => lireSymptomeIncident(i.contexte))
        .filter((s): s is NonNullable<typeof s> => s !== null),
    );
    const types = agrege.map((a) => a.symptome);
    expect(new Set(types).size, "un type apparaît deux fois").toBe(types.length);
    // Le plus intense d'abord : c'est celui qui mérite la phrase du débrief.
    expect(agrege[0]!.intensiteMax).toBeGreaterThanOrEqual(agrege.at(-1)!.intensiteMax);
  });

  it("et rien de tout cela n'a créé de contrainte", async () => {
    // Quatre symptômes plus tard, dont un malaise à 7/10 : toujours aucune
    // zone ménagée. C'est un état global, il ne désigne aucun muscle.
    expect(await contraintesActives(SACHA)).toEqual([]);
  });
});

describe("ce que la route refuse", () => {
  it("un type de symptôme inconnu", async () => {
    connecte = SACHA;
    const res = await poster({
      session_log_id: seanceSacha,
      type: "symptome_general",
      contexte: { symptome: "migraine_ophtalmique", intensite: 5, moment: "pendant_seance" },
      decision: "continuer",
    });
    // Un type inventé stocké tel quel réapparaîtrait plus tard dans un écran
    // qui ne sait pas l'afficher — ou dans un prompt.
    expect(res.status).toBe(400);
  });

  it("une intensité hors bornes", async () => {
    const res = await poster({
      session_log_id: seanceSacha,
      type: "symptome_general",
      contexte: { symptome: "nausee", intensite: 47, moment: "pendant_seance" },
      decision: "continuer",
    });
    expect(res.status).toBe(400);
  });

  it("une note trop longue", async () => {
    const res = await poster({
      session_log_id: seanceSacha,
      type: "symptome_general",
      contexte: {
        symptome: "nausee", intensite: 3, moment: "pendant_seance",
        note: "x".repeat(201),
      },
      decision: "continuer",
    });
    expect(res.status).toBe(400);
  });

  it("mais accepte une note vide, et ne la stocke pas", async () => {
    const res = await poster({
      session_log_id: seanceSacha,
      type: "symptome_general",
      contexte: {
        symptome: "essoufflement_inhabituel", intensite: 2, moment: "pendant_seance",
        note: "   ",
      },
      decision: "continuer",
    });
    expect(res.status).toBe(201);
    const ligne = await res.json();
    // Une chaîne blanche stockée voyagerait jusqu'au contexte du modèle comme
    // une note existante mais illisible.
    expect(ligne.contexte.note).toBeUndefined();
  });

  it("et une note courte, qu'elle conserve", async () => {
    const res = await poster({
      session_log_id: seanceSacha,
      type: "symptome_general",
      contexte: {
        symptome: "autre", intensite: 2, moment: "pendant_seance",
        note: "  depuis le réveil  ",
      },
      decision: "continuer",
    });
    expect(res.status).toBe(201);
    expect((await res.json()).contexte.note).toBe("depuis le réveil");
  });
});

describe("l'état du jour porte les symptômes du matin", () => {
  it("il les accepte et les persiste à part des courbatures", async () => {
    connecte = SACHA;
    const res = await posterEtatDuJour(etatDeBase({
      courbatures: [{ muscle: "pectoraux", intensite: 4 }],
      symptomesGeneraux: [
        { symptome: "mal_de_tete", intensite: 3, moment: "avant_seance" },
      ],
    }));
    expect(res.status).toBeLessThan(300);

    const etat = (await db.query.dailyStates.findFirst({
      where: and(eq(schema.dailyStates.userId, SACHA), eq(schema.dailyStates.date, AUJOURDHUI)),
    }))!;
    expect(etat.symptomesGeneraux).toHaveLength(1);
    expect(etat.symptomesGeneraux![0]!.symptome).toBe("mal_de_tete");
    // Les deux colonnes restent distinctes : la courbature n'a pas migré.
    expect(etat.courbatures).toHaveLength(1);
    expect(etat.courbatures![0]!.muscle).toBe("pectoraux");
  });

  it("un état du jour SANS le champ fonctionne comme « aucun »", async () => {
    /*
     * Toutes les lignes antérieures au lot 16 sont dans ce cas : la colonne est
     * `NULL`, la question n'avait jamais été posée. Aucune réécriture
     * rétroactive n'a été faite, donc le code doit le lire sans broncher.
     */
    connecte = MARIA;
    const res = await posterEtatDuJour(etatDeBase());
    expect(res.status).toBeLessThan(300);

    const etat = (await db.query.dailyStates.findFirst({
      where: and(eq(schema.dailyStates.userId, MARIA), eq(schema.dailyStates.date, AUJOURDHUI)),
    }))!;
    expect(etat.symptomesGeneraux).toBeNull();
  });

  it("le feu biologique n'est pas réécrit par un symptôme", async () => {
    /*
     * Décision de conception : le feu garde ses trois critères — sommeil,
     * énergie, courbatures. Un symptôme produit une recommandation de prudence
     * SÉPARÉE. Le brancher au feu aurait fait passer un mal de tête pour une
     * mauvaise nuit, et dénaturé une mesure que le reste du moteur consomme.
     */
    const { computeFeuJour, etatPourLeMoteur } = await import("@/lib/engine/feu-biologique");
    connecte = SACHA;
    const etat = (await db.query.dailyStates.findFirst({
      where: and(eq(schema.dailyStates.userId, SACHA), eq(schema.dailyStates.date, AUJOURDHUI)),
    }))!;

    /*
     * `etatPourLeMoteur` n'accepte même pas le champ : son type ne le connaît
     * pas, et le garde structurel interdit à `feu-biologique.ts` de le
     * mentionner. On compare donc l'état réel — qui PORTE un symptôme en base —
     * au même état privé de tout le reste, pour montrer que le feu ne dépend
     * que de ses trois critères.
     */
    expect(etat.symptomesGeneraux, "le décor doit porter un symptôme").toHaveLength(1);
    const avecSymptome = computeFeuJour(etatPourLeMoteur(etat));
    const sans = computeFeuJour(etatPourLeMoteur({
      date: etat.date,
      sommeilHeures: etat.sommeilHeures,
      jeuneBool: etat.jeuneBool,
      shiftRecentBool: etat.shiftRecentBool,
      shiftType: etat.shiftType,
      energieDepart: etat.energieDepart,
      courbatures: etat.courbatures,
    }));
    expect(avecSymptome.feu).toBe(sans.feu);
  });

  it("une intensité invalide est refusée à cette porte aussi", async () => {
    // Les deux portes partagent le même schéma : sans quoi c'est par la plus
    // permissive que passerait la donnée hors bornes.
    const res = await posterEtatDuJour(etatDeBase({
      symptomesGeneraux: [{ symptome: "nausee", intensite: 0, moment: "avant_seance" }],
    }));
    expect(res.status).toBe(400);
  });
});

describe("aucun symptôme ne franchit la frontière entre deux comptes", () => {
  it("Maria ne lit pas les incidents de Sacha, même salle partagée", async () => {
    connecte = MARIA;
    const res = await lireIncidents(seanceSacha);
    expect(res.status).toBe(403);
  });

  it("et elle ne peut pas en écrire un sur sa séance", async () => {
    const incidentsAvant = (await db.select().from(schema.sessionIncidents)
      .where(eq(schema.sessionIncidents.sessionLogId, seanceSacha))).length;

    connecte = MARIA;
    const res = await poster({
      session_log_id: seanceSacha,
      type: "symptome_general",
      contexte: { symptome: "nausee", intensite: 5, moment: "pendant_seance" },
      decision: "continuer",
    });
    expect(res.status).toBe(403);

    // Et rien n'a été écrit : le refus précède l'insertion.
    const apres = await db.select().from(schema.sessionIncidents)
      .where(eq(schema.sessionIncidents.sessionLogId, seanceSacha));
    expect(apres.length, "un incident a été écrit malgré le refus").toBe(incidentsAvant);
  });

  it("la séance de Maria ne porte aucun symptôme de Sacha", async () => {
    connecte = MARIA;
    const res = await lireIncidents(seanceMaria);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("le coach de Maria ne reçoit pas l'état du jour de Sacha", async () => {
    const { EXECUTEURS_CONTEXTE } = await import("@/lib/coach/outils-contexte");
    const lu = await EXECUTEURS_CONTEXTE.get_today_readiness!({}, MARIA);
    const contenu = JSON.parse(lu.output);
    // Maria a bien un état du jour, sans aucun symptôme : celui de Sacha ne
    // doit pas y apparaître.
    expect(contenu.renseigne).toBe(true);
    expect(contenu.symptomesGeneraux).toEqual([]);
    expect(contenu.conduiteSymptomes).toBe("continuer");
  });

  it("et celui de Sacha porte le sien, sans diagnostic", async () => {
    const { EXECUTEURS_CONTEXTE } = await import("@/lib/coach/outils-contexte");
    const lu = await EXECUTEURS_CONTEXTE.get_today_readiness!({}, SACHA);
    const contenu = JSON.parse(lu.output);
    expect(contenu.symptomesGeneraux).toEqual([{ symptome: "Mal de tête", intensite: 3 }]);
    // Une conduite calculée par le moteur, pas laissée au modèle.
    expect(contenu.conduiteSymptomes).toBe("continuer");
    // Et le symptôme ne s'est pas glissé parmi les courbatures.
    for (const c of contenu.courbatures) {
      expect(c.muscle).not.toMatch(/tête|nausée|vertige/i);
    }
  });
});
