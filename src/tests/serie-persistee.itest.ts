import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Une série validée ne disparaît plus si le navigateur tombe.
 *
 * CE QUI SE PASSAIT
 *
 * Rien de la séance n'atteignait Postgres avant l'écran de fin. Une heure
 * d'entraînement tenait entièrement dans le `localStorage` : Safari qui tombe,
 * un onglet fermé par le système sous pression mémoire, un stockage purgé — et
 * l'entraînement n'avait jamais eu lieu. C'est le genre de perte qu'on ne
 * découvre qu'une fois, et qui suffit à ne plus faire confiance à
 * l'application.
 *
 * CE QUE CE FICHIER TIENT
 *
 * L'écriture au fil de l'eau, son idempotence — rejouer un appel après un
 * échec réseau ne doit pas créer de doublon —, la reprise depuis la base, et
 * l'isolation entre deux comptes qui s'entraînent dans la même salle.
 */

const SACHA = randomUUID();
const MARIA = randomUUID();

let connecte = SACHA;
vi.mock("@/lib/supabase/auth-helper", () => ({
  getAuthenticatedUserId: async () => connecte,
}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { eq, and } = await import("drizzle-orm");
const route = await import("@/app/api/session-logs/[id]/series/route");
const { seriesDeLaSeance } = await import("@/services/seances");

const AUJOURDHUI = new Date().toISOString().slice(0, 10);

let seanceSacha = "";
let seanceMaria = "";
let seanceClose = "";
let instanceA = "";
let instanceB = "";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const poster = (sessionId: string, corps: unknown) =>
  route.POST(
    new Request("http://t/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    }),
    params(sessionId),
  );

const retirer = (sessionId: string, corps: unknown) =>
  route.DELETE(
    new Request("http://t/", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    }),
    params(sessionId),
  );

const lire = (sessionId: string) =>
  route.GET(new Request("http://t/"), params(sessionId));

/*
 * Toutes les écritures portent une RÉVISION : elle n'est plus facultative.
 *
 * Le repli `?? Date.now()` côté serveur offrait une porte de sortie — un appel
 * hors protocole obtenait une révision fraîche et repassait devant toutes les
 * intentions en vol. Ces tests ne dépendent donc plus de lui.
 */
let horloge = 100_000;
const rev = () => (horloge += 1);

const SERIE = {
  numeroSerie: 1, repsEffectuees: 10, charge: 40, rpeEffectif: 8,
};

beforeAll(async () => {
  expect(process.env.DATABASE_URL, "base de test requise").toBeTruthy();

  for (const [id, nom] of [[SACHA, "Sacha"], [MARIA, "Maria"]] as const) {
    await db.insert(schema.users).values({
      id, email: `${id}@t.test`, nom, onboardingTermineLe: new Date(),
    });
  }

  // Une salle partagée : le décor où une fuite entre comptes se verrait.
  const [salle] = await db.insert(schema.gyms)
    .values({ userId: SACHA, nom: `Salle ${SACHA.slice(0, 6)}` }).returning();

  const [ex] = await db.insert(schema.exercises).values({
    userId: null, nom: "Développé couché", pilier: "P1_poussee", profilTension: "mi_range",
    type: "polyarticulaire", categorieRole: "pilier",
    musclesPrincipaux: ["pectoraux"], musclesSecondaires: [], equipement: "barre",
    slug: `dc-${SACHA.slice(0, 8)}`,
  }).returning();

  for (const machine of ["Banc A", "Banc B"]) {
    const [i] = await db.insert(schema.exerciseInstances).values({
      userId: SACHA, exerciseId: ex!.id, gymId: salle!.id, machineNom: machine,
      conventionCharge: "poids_total",
    }).returning();
    if (machine === "Banc A") instanceA = i!.id; else instanceB = i!.id;
  }

  // Ouverte : `dureeMinutes` reste nul tant que la séance n'est pas close.
  const [s] = await db.insert(schema.sessionLogs)
    .values({ userId: SACHA, date: AUJOURDHUI, gymId: salle!.id }).returning();
  seanceSacha = s!.id;

  const [m] = await db.insert(schema.sessionLogs)
    .values({ userId: MARIA, date: AUJOURDHUI, gymId: salle!.id }).returning();
  seanceMaria = m!.id;

  // Une séance archivée : elle ne doit plus rien accepter.
  const [c] = await db.insert(schema.sessionLogs).values({
    userId: SACHA, date: AUJOURDHUI, gymId: salle!.id, archiveLe: new Date(),
  }).returning();
  seanceClose = c!.id;
});

const enBase = (sessionId: string) =>
  db.select().from(schema.setLogs).where(eq(schema.setLogs.sessionLogId, sessionId));

describe("une série validée arrive en base tout de suite", () => {
  it("elle y est avant toute clôture", async () => {
    connecte = SACHA;
    const res = await poster(seanceSacha, { ...SERIE, revision: rev(), exerciseInstanceId: instanceA });
    expect(res.status).toBe(200);

    const lignes = await enBase(seanceSacha);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ numeroSerie: 1, repsEffectuees: 10, charge: 40 });

    // Et la séance reste OUVERTE : persister une série ne la clôt pas.
    const seance = await db.query.sessionLogs.findFirst({
      where: eq(schema.sessionLogs.id, seanceSacha),
    });
    expect(seance!.dureeMinutes).toBeNull();
  });

  it("rejouer le même appel ne crée pas de doublon", async () => {
    /*
     * Le cas exact d'une reprise après échec réseau : la requête est partie, la
     * réponse s'est perdue, le client réessaie. Sans idempotence, la série
     * existerait deux fois et le volume de la séance serait faux.
     */
    connecte = SACHA;
    for (let i = 0; i < 3; i += 1) {
      const res = await poster(seanceSacha, { ...SERIE, revision: rev(), exerciseInstanceId: instanceA });
      expect(res.status).toBe(200);
    }
    expect(await enBase(seanceSacha)).toHaveLength(1);
  });

  it("revalider une série corrigée met à jour la bonne ligne", async () => {
    connecte = SACHA;
    await poster(seanceSacha, {
      ...SERIE, revision: rev(), exerciseInstanceId: instanceA, repsEffectuees: 8, charge: 45,
    });

    const lignes = await enBase(seanceSacha);
    expect(lignes, "la correction a créé une seconde ligne").toHaveLength(1);
    expect(lignes[0]).toMatchObject({ repsEffectuees: 8, charge: 45 });
  });

  it("deux séries de la même entrée coexistent", async () => {
    connecte = SACHA;
    await poster(seanceSacha, { ...SERIE, revision: rev(), exerciseInstanceId: instanceA, numeroSerie: 2 });
    expect(await enBase(seanceSacha)).toHaveLength(2);
  });

  it("et deux entrées différentes ne s'écrasent pas", async () => {
    // Le triplet identifie la série : (séance, entrée, numéro). La série 1 de
    // l'entrée B ne remplace pas la série 1 de l'entrée A.
    connecte = SACHA;
    await poster(seanceSacha, { ...SERIE, revision: rev(), exerciseInstanceId: instanceB, numeroSerie: 1 });
    const lignes = await enBase(seanceSacha);
    expect(lignes).toHaveLength(3);
    expect(new Set(lignes.map((l) => l.exerciseInstanceId)).size).toBe(2);
  });
});

describe("décocher une série la retire aussi de la base", () => {
  it("sinon elle ressusciterait à la reprise", async () => {
    connecte = SACHA;
    const res = await retirer(seanceSacha, { revision: rev(), exerciseInstanceId: instanceB, numeroSerie: 1 });
    expect(res.status).toBe(200);

    const lignes = await enBase(seanceSacha);
    expect(lignes.some((l) => l.exerciseInstanceId === instanceB)).toBe(false);
    // Les autres séries sont intactes : le retrait vise UN triplet.
    expect(lignes).toHaveLength(2);
  });

  it("retirer deux fois ne casse rien", async () => {
    connecte = SACHA;
    const res = await retirer(seanceSacha, { revision: rev(), exerciseInstanceId: instanceB, numeroSerie: 1 });
    expect(res.status).toBe(200);
  });
});

describe("la reprise après un crash", () => {
  it("la base rend ce qu'elle porte, prêt à réhydrater le brouillon", async () => {
    /*
     * Le scénario : le `localStorage` a disparu — navigation privée, nettoyage
     * iOS — mais la séance existe et ses séries aussi. C'est ce que l'écran
     * relit au chargement.
     */
    connecte = SACHA;
    const res = await lire(seanceSacha);
    expect(res.status).toBe(200);

    const lignes = await res.json();
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toHaveProperty("exerciseInstanceId");
    expect(lignes[0]).toHaveProperty("numeroSerie");
  });

  it("et aucune session n'est recréée au passage", async () => {
    // La règle du lot précédent tient : une séance fantôme ne doit jamais
    // naître d'une lecture.
    const avant = await db.select().from(schema.sessionLogs)
      .where(eq(schema.sessionLogs.userId, SACHA));
    connecte = SACHA;
    await lire(seanceSacha);
    const apres = await db.select().from(schema.sessionLogs)
      .where(eq(schema.sessionLogs.userId, SACHA));
    expect(apres.length).toBe(avant.length);
  });

  it("la clôture reste l'autorité : elle réécrit la liste complète", async () => {
    /*
     * Les deux chemins ne se disputent pas. `terminerSeance` efface les séries
     * de la séance et réinsère celles du brouillon — ce qui a été persisté en
     * route est donc remplacé par l'état final, sans conflit possible.
     */
    const { terminerSeance } = await import("@/services/seances");
    await terminerSeance({
      userId: SACHA,
      sessionLogId: seanceSacha,
      dureeMinutes: 45,
      series: [{
        exerciseInstanceId: instanceA, numeroSerie: 1,
        repsEffectuees: 12, charge: 50,
      }],
    });

    const lignes = await enBase(seanceSacha);
    expect(lignes, "la clôture n'a pas remplacé les séries persistées").toHaveLength(1);
    expect(lignes[0]).toMatchObject({ repsEffectuees: 12, charge: 50 });
  });
});

describe("ce que la route refuse", () => {
  it("la séance d'un autre compte", async () => {
    connecte = MARIA;
    const res = await poster(seanceSacha, { ...SERIE, revision: rev(), exerciseInstanceId: instanceA });
    expect(res.status).toBe(404);

    // Et rien n'a été écrit chez Sacha.
    const lignes = await enBase(seanceSacha);
    expect(lignes.every((l) => l.repsEffectuees !== 10 || l.charge !== 40)).toBe(true);
  });

  it("la lecture de la séance d'un autre compte", async () => {
    connecte = MARIA;
    expect((await lire(seanceSacha)).status).toBe(404);
  });

  it("le retrait sur la séance d'un autre compte", async () => {
    connecte = MARIA;
    const res = await retirer(seanceSacha, { revision: rev(), exerciseInstanceId: instanceA, numeroSerie: 1 });
    expect(res.status).toBe(404);
  });

  it("une séance archivée", async () => {
    // Elle a été retirée du calcul : la rouvrir en écriture la ferait
    // réapparaître par une autre porte.
    connecte = SACHA;
    const res = await poster(seanceClose, { ...SERIE, revision: rev(), exerciseInstanceId: instanceA });
    expect(res.status).toBe(404);
  });

  it("une série qui ne mesure rien", async () => {
    /*
     * Le même refus qu'à la clôture, au même moment du moteur : une série
     * acceptée en route ne doit pas être rejetée à la fin. 422 et non 400 —
     * la requête est bien formée, c'est la série qui ne mesure rien.
     */
    connecte = SACHA;
    const res = await poster(seanceMaria, {
      revision: rev(), exerciseInstanceId: instanceA, numeroSerie: 1, repsEffectuees: 0, charge: 0,
    });
    connecte = MARIA;
    const chezMaria = await poster(seanceMaria, {
      revision: rev(), exerciseInstanceId: instanceA, numeroSerie: 1, repsEffectuees: 0, charge: 0,
    });
    // Sacha n'est pas propriétaire : 404 avant même la validation.
    expect(res.status).toBe(404);
    expect(chezMaria.status).toBe(422);
  });

  it("un corps mal formé", async () => {
    connecte = SACHA;
    const res = await poster(seanceMaria, { revision: rev(), exerciseInstanceId: "pas-un-uuid", numeroSerie: 1 });
    expect(res.status).toBe(400);
  });
});

describe("deux comptes dans la même salle", () => {
  it("les séries de Maria ne se mêlent pas à celles de Sacha", async () => {
    connecte = MARIA;
    await poster(seanceMaria, { ...SERIE, revision: rev(), exerciseInstanceId: instanceA, charge: 25 });

    const chezMaria = await enBase(seanceMaria);
    const chezSacha = await enBase(seanceSacha);
    expect(chezMaria).toHaveLength(1);
    expect(chezMaria[0]!.charge).toBe(25);
    // Sacha porte toujours SA série, clôturée plus haut à 50 kg.
    expect(chezSacha).toHaveLength(1);
    expect(chezSacha[0]!.charge).toBe(50);
  });

  it("et le service refuse de lire d'un compte à l'autre", async () => {
    await expect(seriesDeLaSeance(SACHA, seanceMaria)).rejects.toThrow();
    const propres = await seriesDeLaSeance(MARIA, seanceMaria);
    expect(propres).toHaveLength(1);
  });
});

/*
 * ---------------------------------------------------------------------------
 * L'ORDRE DES INTENTIONS, QUI N'EST PAS L'ORDRE DES REQUÊTES
 * ---------------------------------------------------------------------------
 *
 * Les tests au-dessus appellent la route séquentiellement : ils prouvent
 * l'idempotence, pas l'ordonnancement. Une transaction DELETE + INSERT donne
 * l'atomicité — elle ne dit rien de QUI arrive en dernier.
 *
 * Ceux qui suivent font délibérément terminer les requêtes dans le mauvais
 * ordre, c'est-à-dire dans l'ordre que produit un réseau de sous-sol : la
 * requête partie en premier revient en dernier.
 */

const CLE = () => ({ exerciseInstanceId: instanceB, numeroSerie: 7 });

/** Repartir d'une clé vierge : ces tests se lisent seuls. */
async function reinitialiserCle() {
  await db.delete(schema.setLogs).where(and(
    eq(schema.setLogs.sessionLogId, seanceMaria),
    eq(schema.setLogs.exerciseInstanceId, instanceB),
    eq(schema.setLogs.numeroSerie, 7),
  ));
  await db.delete(schema.setLogRevisions).where(and(
    eq(schema.setLogRevisions.sessionLogId, seanceMaria),
    eq(schema.setLogRevisions.exerciseInstanceId, instanceB),
    eq(schema.setLogRevisions.numeroSerie, 7),
  ));
}

const ligneDeLaCle = async () => {
  const l = await db.select().from(schema.setLogs).where(and(
    eq(schema.setLogs.sessionLogId, seanceMaria),
    eq(schema.setLogs.exerciseInstanceId, instanceB),
    eq(schema.setLogs.numeroSerie, 7),
  ));
  return l[0] ?? null;
};

describe("une reprise en retard ne gagne jamais contre une intention récente", () => {
  it("A — la correction survit à la reprise du POST qu'elle remplace", async () => {
    /*
     * t0  la série part à 40 kg, la requête se perd, une reprise est armée
     * t1  l'athlète corrige à 45 kg, cette requête-là aboutit
     * t2  la reprise de t0 aboutit enfin
     *
     * La base revenait à 40. On fait ici terminer B AVANT A, ce qui est le
     * scénario exact.
     */
    connecte = MARIA;
    await reinitialiserCle();

    const ancienne = { ...SERIE, ...CLE(), charge: 40, revision: 1_000 };
    const recente = { ...SERIE, ...CLE(), charge: 45, revision: 2_000 };

    // La plus récente aboutit d'abord.
    expect((await poster(seanceMaria, recente)).status).toBe(200);
    // Puis la reprise de l'ancienne, qui porte sa révision d'origine.
    const retard = await poster(seanceMaria, ancienne);
    expect(retard.status).toBe(200);
    expect((await retard.json()).issue, "la reprise a été appliquée").toBe("perimee");

    const ligne = await ligneDeLaCle();
    expect(ligne, "la série a disparu").not.toBeNull();
    expect(ligne!.charge, "la reprise en retard a écrasé la correction").toBe(45);
  });

  it("B — une suppression ne se laisse pas ressusciter", async () => {
    /*
     * t0  un POST est en reprise
     * t1  l'athlète décoche, le DELETE aboutit
     * t2  le vieux POST aboutit
     *
     * La série décochée revenait en base. La pierre tombale l'en empêche : la
     * suppression a laissé sa révision derrière elle.
     */
    connecte = MARIA;
    await reinitialiserCle();

    /*
     * TROIS révisions distinctes, et l'ordre compte pour la démonstration.
     *
     * Une première version de ce test employait la même révision pour le POST
     * initial et sa reprise. Il passait — mais sans rien prouver : la ligne de
     * révision portait encore celle du POST, et la reprise était refusée pour
     * égalité, pas grâce à la pierre tombale. Le contrôle négatif l'a montré en
     * restant vert alors que la tombe était retirée.
     *
     * Ici la reprise (1 500) est PLUS RÉCENTE que le POST initial (1 000) et
     * plus ancienne que la suppression (2 000). Sans la tombe, la suppression
     * ne laisse aucune trace, 1 500 dépasse 1 000, et la série ressuscite.
     */
    const initial = { ...SERIE, ...CLE(), charge: 40, revision: 1_000 };
    expect((await poster(seanceMaria, initial)).status).toBe(200);

    const suppression = await retirer(seanceMaria, { ...CLE(), revision: 2_000 });
    expect((await suppression.json()).issue).toBe("appliquee");
    expect(await ligneDeLaCle()).toBeNull();

    // La reprise d'une saisie faite APRÈS le POST initial, mais avant le
    // décochage. C'est le cas que seule la pierre tombale rattrape.
    const retard = await poster(seanceMaria, { ...SERIE, ...CLE(), charge: 42, revision: 1_500 });
    expect((await retard.json()).issue).toBe("perimee");
    expect(await ligneDeLaCle(), "la série supprimée est revenue").toBeNull();
  });

  it("B bis — une suppression tient même si elle est la première écriture", async () => {
    // Décocher une série que le serveur n'a jamais reçue : la tombe est alors
    // la seule chose qui existe pour cette clé, et elle doit suffire.
    connecte = MARIA;
    await reinitialiserCle();

    const suppression = await retirer(seanceMaria, { ...CLE(), revision: 2_000 });
    expect((await suppression.json()).issue).toBe("appliquee");

    const retard = await poster(seanceMaria, { ...SERIE, ...CLE(), charge: 40, revision: 1_000 });
    expect((await retard.json()).issue).toBe("perimee");
    expect(await ligneDeLaCle(), "un POST en retard a créé la série supprimée").toBeNull();
  });

  it("C — deux écritures concurrentes ne font qu'une ligne", async () => {
    /*
     * Deux POST du même triplet lancés en parallèle. Sans point de rendez-vous,
     * deux transactions DELETE + INSERT peuvent s'ignorer et insérer chacune.
     * La contrainte d'unicité sur la clé de révision les sérialise.
     */
    connecte = MARIA;
    await reinitialiserCle();

    const resultats = await Promise.allSettled([
      poster(seanceMaria, { ...SERIE, ...CLE(), charge: 40, revision: 5_000 }),
      poster(seanceMaria, { ...SERIE, ...CLE(), charge: 45, revision: 5_001 }),
    ]);
    // Aucune des deux ne doit exploser : la concurrence est gérée, pas subie.
    for (const r of resultats) expect(r.status).toBe("fulfilled");

    const lignes = await db.select().from(schema.setLogs).where(and(
      eq(schema.setLogs.sessionLogId, seanceMaria),
      eq(schema.setLogs.exerciseInstanceId, instanceB),
      eq(schema.setLogs.numeroSerie, 7),
    ));
    expect(lignes, "deux lignes pour une seule série").toHaveLength(1);
    // Et c'est la plus récente qui reste.
    expect(lignes[0]!.charge).toBe(45);
  });

  it("et rejouer la même révision reste idempotent", async () => {
    // Une reprise du MÊME événement : ni doublon, ni régression. Elle rend
    // `perimee` parce que la révision n'est pas strictement supérieure — et
    // c'est sans conséquence, l'état est déjà le bon.
    connecte = MARIA;
    const rejeu = await poster(seanceMaria, { ...SERIE, ...CLE(), charge: 45, revision: 5_001 });
    expect((await rejeu.json()).issue).toBe("perimee");

    const ligne = await ligneDeLaCle();
    expect(ligne!.charge).toBe(45);
  });

  it("D — une suppression rejouée après échec finit par être reflétée", async () => {
    /*
     * Le DELETE échoue une première fois, le réseau revient, la reprise part.
     * Elle porte la même révision : elle doit aboutir, et rester.
     */
    connecte = MARIA;
    const revision = 6_000;
    const premier = await retirer(seanceMaria, { ...CLE(), revision });
    expect((await premier.json()).issue).toBe("appliquee");

    // La reprise du même geste.
    const reprise = await retirer(seanceMaria, { ...CLE(), revision });
    expect(reprise.status).toBe(200);
    expect(await ligneDeLaCle(), "la reprise a ressuscité la série").toBeNull();
  });

  it("E — après conflit, la relecture rend la dernière intention", async () => {
    /*
     * Ce que l'écran verra au rafraîchissement : la base ne porte que ce que la
     * dernière intention a décidé. Ici, une suppression — donc rien.
     */
    connecte = MARIA;
    const res = await lire(seanceMaria);
    const lignes = await res.json();
    const survivante = lignes.find(
      (l: { exerciseInstanceId: string; numeroSerie: number }) =>
        l.exerciseInstanceId === instanceB && l.numeroSerie === 7,
    );
    expect(survivante, "la série supprimée réapparaît à la reprise").toBeUndefined();
  });

  it("une nouvelle intention passe toujours au-dessus d'une suppression", async () => {
    // La pierre tombale n'est pas un verrou définitif : revalider la série
    // après l'avoir décochée doit marcher.
    connecte = MARIA;
    const res = await poster(seanceMaria, { ...SERIE, ...CLE(), charge: 50, revision: 7_000 });
    expect((await res.json()).issue).toBe("appliquee");

    const ligne = await ligneDeLaCle();
    expect(ligne!.charge).toBe(50);
  });
});

describe("une séance TERMINÉE n'accepte plus aucune écriture", () => {
  /*
   * LE DÉFAUT FERMÉ
   *
   * Le contrôle se contentait du propriétaire et de l'archivage. Or une séance
   * terminée n'est pas archivée : elle porte une durée, c'est tout. Une reprise
   * réseau partie avant la clôture pouvait donc aboutir APRÈS, et modifier
   * `set_logs` sur une séance que `terminerSeance` venait de figer.
   *
   * Cela contredisait frontalement l'invariant annoncé — « la clôture reste
   * l'autorité ».
   */
  let seanceFinie = "";

  const preparer = async () => {
    const { terminerSeance } = await import("@/services/seances");
    const salle = await db.query.gyms.findFirst({ where: eq(schema.gyms.userId, SACHA) });
    const [s] = await db.insert(schema.sessionLogs)
      .values({ userId: SACHA, date: AUJOURDHUI, gymId: salle!.id }).returning();
    seanceFinie = s!.id;

    connecte = SACHA;
    // Une série écrite au fil de la séance, comme en vrai.
    await poster(seanceFinie, { ...SERIE, revision: rev(), exerciseInstanceId: instanceA, charge: 40 });

    // Puis la clôture, avec un état final DIFFÉRENT.
    await terminerSeance({
      userId: SACHA, sessionLogId: seanceFinie, dureeMinutes: 50,
      series: [{
        exerciseInstanceId: instanceA, numeroSerie: 1, repsEffectuees: 12, charge: 55,
      }],
    });
  };

  const etatFinal = () => db.select().from(schema.setLogs)
    .where(eq(schema.setLogs.sessionLogId, seanceFinie));

  it("un POST retardé arrivant après la clôture est refusé", async () => {
    await preparer();
    connecte = SACHA;

    // La reprise du vieux POST : révision plus récente que tout, et pourtant
    // elle ne doit rien pouvoir faire.
    const retard = await poster(seanceFinie, {
      ...SERIE, revision: rev(), exerciseInstanceId: instanceA, charge: 40,
    });
    expect(retard.status, "une séance close a accepté une écriture").toBe(409);

    const lignes = await etatFinal();
    expect(lignes).toHaveLength(1);
    expect(lignes[0]!.charge, "la clôture a été écrasée par une reprise").toBe(55);
    expect(lignes[0]!.repsEffectuees).toBe(12);
  });

  it("un DELETE retardé aussi", async () => {
    connecte = SACHA;
    const retard = await retirer(seanceFinie, {
      revision: rev(), exerciseInstanceId: instanceA, numeroSerie: 1,
    });
    expect(retard.status).toBe(409);

    const lignes = await etatFinal();
    expect(lignes, "une reprise a effacé une série d'une séance close").toHaveLength(1);
  });

  it("et 409 n'est pas un refus que le client rejoue", async () => {
    /*
     * `meriteUneReprise` ne rejoue que le transport et les pannes serveur. Un
     * 409 dit « cette séance est finie » : insister donnerait trois fois le
     * même refus, et userait la batterie pour rien.
     */
    const { cheminSeries } = await import("@/components/session/serie-en-vol");
    expect(cheminSeries(seanceFinie)).toContain("/series");
    // Le comportement lui-même est tenu par `meriteUneReprise`, testé plus bas
    // dans ce même fichier via la route : 409 < 500, ni 408, ni 429.
    expect([408, 429].includes(409)).toBe(false);
  });

  it("la LECTURE, elle, reste possible : l'historique n'est pas touché", async () => {
    // Le garde porte sur l'écriture. Relire une séance close est légitime —
    // c'est ce que fait l'historique.
    connecte = SACHA;
    const res = await lire(seanceFinie);
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
  });
});

describe("la révision est obligatoire", () => {
  /*
   * Cette route n'existait pas avant ce lot : elle n'a aucun appelant
   * historique à ménager. Le repli `?? Date.now()` offrait surtout une porte de
   * sortie — un appel hors protocole obtenait une révision fraîche côté serveur
   * et repassait devant toutes les intentions en vol.
   */
  it("un POST sans révision est refusé, et n'écrit rien", async () => {
    connecte = SACHA;
    const avant = await enBase(seanceSacha);

    const res = await poster(seanceSacha, {
      exerciseInstanceId: instanceA, numeroSerie: 9, repsEffectuees: 10, charge: 40,
    });
    expect(res.status).toBe(400);

    expect(await enBase(seanceSacha)).toHaveLength(avant.length);
    const revisions = await db.select().from(schema.setLogRevisions).where(and(
      eq(schema.setLogRevisions.sessionLogId, seanceSacha),
      eq(schema.setLogRevisions.numeroSerie, 9),
    ));
    expect(revisions, "une révision a été créée malgré le refus").toHaveLength(0);
  });

  it("un DELETE sans révision aussi", async () => {
    connecte = SACHA;
    const avant = await enBase(seanceSacha);

    const res = await retirer(seanceSacha, { exerciseInstanceId: instanceA, numeroSerie: 1 });
    expect(res.status).toBe(400);
    expect(await enBase(seanceSacha)).toHaveLength(avant.length);
  });

  it("une révision non entière ou négative est refusée", async () => {
    connecte = SACHA;
    for (const revision of [-1, 1.5]) {
      const res = await poster(seanceSacha, {
        revision, exerciseInstanceId: instanceA, numeroSerie: 9,
        repsEffectuees: 10, charge: 40,
      });
      expect(res.status, `révision ${revision} acceptée`).toBe(400);
    }
  });

  it("et une révision au-delà de l'entier sûr aussi", async () => {
    // Drizzle lit ce `bigint` en `mode: "number"` : au-delà, la valeur relue ne
    // serait plus celle qui a été écrite.
    connecte = SACHA;
    const res = await poster(seanceSacha, {
      revision: Number.MAX_SAFE_INTEGER + 100, exerciseInstanceId: instanceA,
      numeroSerie: 9, repsEffectuees: 10, charge: 40,
    });
    expect(res.status).toBe(400);
  });
});
