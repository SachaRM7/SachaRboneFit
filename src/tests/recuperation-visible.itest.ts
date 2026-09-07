import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * La récupération que le moteur calculait déjà, devenue lisible — à l'identique.
 *
 * LE DÉFAUT CORRIGÉ N'EST PAS UN CALCUL MANQUANT
 *
 * `scoreRecuperation` existait, il fonctionnait, et il DÉCIDAIT :
 * `validerSeanceComplete` refuse une séance sur `recuperation_insuffisante`.
 * L'athlète recevait donc un refus sans jamais savoir quel muscle, depuis
 * quand, ni pourquoi. Le score n'était affiché nulle part.
 *
 * Le risque, en le rendant visible, était donc l'inverse de l'habituel : non
 * pas qu'il manque un calcul, mais qu'il en apparaisse un SECOND. Une règle
 * réécrite dans un composant aurait divergé au premier ajustement de seuil, et
 * rien n'aurait dit lequel des deux fait autorité.
 *
 * Ces tests comparent donc le service au moteur sur les mêmes données, plutôt
 * que de vérifier que l'affichage « a l'air correct ».
 */

const SACHA = randomUUID();
const MARIA = randomUUID();

const { db, compterRequetes } = await import("@/db/client");
const schema = await import("@/db/schema");
const { eq } = await import("drizzle-orm");
const { recuperationMusculaire, resumeRecuperation } = await import("@/services/recuperation");
const { activiteMusculaire, courbaturesDuJour, etatMusclesDepuis } =
  await import("@/lib/coach/outils-programme");
const { scoreRecuperation, seuilDePhase } = await import("@/lib/engine/recuperation");
const { mesurerCycle } = await import("@/services/cycle");
const { SEVERITE } = await import("@/lib/engine/contraintes");

const AUJOURDHUI = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  expect(process.env.DATABASE_URL, "base de test requise").toBeTruthy();

  for (const [id, nom] of [[SACHA, "Sacha"], [MARIA, "Maria"]] as const) {
    await db.insert(schema.users).values({
      id, email: `${id}@t.test`, nom, onboardingTermineLe: new Date(),
    });
  }

  const [salle] = await db.insert(schema.gyms)
    .values({ userId: SACHA, nom: `Salle ${SACHA.slice(0, 6)}` }).returning();

  /*
   * Un exercice qui charge un muscle À PLEIN et un autre À MOITIÉ.
   *
   * C'est ce qui rend la pondération observable : dix séries de développé
   * comptent dix pour les pectoraux et cinq pour les triceps. Un service qui
   * recompterait le volume à sa façon donnerait dix des deux côtés.
   */
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

  // Aujourd'hui, dix séries à RPE 9 — donc RIR 1, sous le seuil coûteux.
  const [s] = await db.insert(schema.sessionLogs).values({
    userId: SACHA, date: AUJOURDHUI, gymId: salle!.id, dureeMinutes: 70,
  }).returning();
  await db.insert(schema.setLogs).values(
    Array.from({ length: 10 }, (_, i) => ({
      sessionLogId: s!.id, exerciseInstanceId: instance!.id,
      numeroSerie: i + 1, repsEffectuees: 8, charge: 80, rpeEffectif: 9,
    })),
  );

  // Une courbature déclarée le jour même, sur un muscle travaillé.
  await db.insert(schema.dailyStates).values({
    userId: SACHA, date: AUJOURDHUI,
    courbatures: [{ muscle: "pectoraux", intensite: 6 }],
  });

  /*
   * Une contrainte sévère sur une épaule JAMAIS travaillée.
   *
   * Deux choses à la fois : la contrainte prime sur la fatigue, et un muscle
   * que seule une contrainte désigne doit quand même se voir — sans quoi la
   * zone que l'application ménage serait la seule à ne pas s'afficher.
   */
  await db.insert(schema.contraintes).values({
    userId: SACHA, muscle: "epaules", type: "douleur",
    severite: SEVERITE.ecartement, dateDebut: AUJOURDHUI,
  });

  // Maria s'entraîne dans la même salle, sur la même machine, aujourd'hui.
  const [sm] = await db.insert(schema.sessionLogs).values({
    userId: MARIA, date: AUJOURDHUI, gymId: salle!.id, dureeMinutes: 50,
  }).returning();
  await db.insert(schema.setLogs).values(
    Array.from({ length: 20 }, (_, i) => ({
      sessionLogId: sm!.id, exerciseInstanceId: instance!.id,
      numeroSerie: i + 1, repsEffectuees: 5, charge: 45, rpeEffectif: 10,
    })),
  );
});

const trouver = async (userId: string, muscle: string) => {
  const etat = await recuperationMusculaire(userId);
  return etat.muscles.find((m) => m.muscle === muscle);
};

describe("le service dit exactement ce que le moteur calcule", () => {
  it("le score est celui de `scoreRecuperation`, pas une seconde formule", async () => {
    // On refait le chemin du VALIDATEUR, avec ses fonctions, et on compare.
    const [activite, courbatures, cycle] = await Promise.all([
      activiteMusculaire(SACHA, 21),
      courbaturesDuJour(SACHA),
      mesurerCycle(SACHA),
    ]);
    const etats = etatMusclesDepuis(activite, courbatures);

    const service = await recuperationMusculaire(SACHA);
    expect(service.muscles.length).toBeGreaterThan(0);

    for (const m of service.muscles) {
      const e = etats[m.muscle];
      if (!e) continue; // un muscle désigné par la seule contrainte
      const attendu = scoreRecuperation({
        ...e, tendancePerformance: cycle.tendancePerformance, phase: cycle.phase,
      });
      expect(m.score, `${m.muscle} : le service et le moteur divergent`).toBe(attendu.score);
      expect(m.motifs, `${m.muscle} : les motifs ont été reformulés`).toEqual(attendu.motifs);
    }
  });

  it("le seuil affiché est celui de la phase, relu du moteur", async () => {
    const service = await recuperationMusculaire(SACHA);
    const cycle = await mesurerCycle(SACHA);
    expect(service.phase).toBe(cycle.phase);
    expect(service.seuil).toBe(seuilDePhase(cycle.phase));
  });

  it("« prêt » veut dire : au-dessus du seuil, et rien d'autre", async () => {
    const service = await recuperationMusculaire(SACHA);
    for (const m of service.muscles) {
      if (m.severiteContrainte !== null && m.severiteContrainte >= SEVERITE.ecartement) continue;
      expect(m.etat === "pret", `${m.muscle} à ${m.score}/${service.seuil}`)
        .toBe(m.score >= service.seuil);
    }
  });
});

describe("ce que la dernière exposition a réellement coûté", () => {
  it("un muscle principal reçoit tout le volume", async () => {
    const pecs = await trouver(SACHA, "pectoraux");
    expect(pecs, "les pectoraux n'apparaissent pas").toBeTruthy();
    expect(pecs!.seriesDerniereExposition).toBe(10);
    expect(pecs!.joursDepuis).toBe(0);
  });

  it("un muscle secondaire garde sa fraction, il ne compte pas double", async () => {
    /*
     * La moitié, pas le tout. Compter un secondaire plein gonflerait le volume
     * hebdomadaire — et ferait apparaître comme épuisé un triceps qui n'a fait
     * qu'accompagner un développé.
     */
    const triceps = await trouver(SACHA, "triceps");
    expect(triceps, "les triceps n'apparaissent pas").toBeTruthy();
    expect(triceps!.seriesDerniereExposition).toBe(5);
  });

  it("le RIR se déduit du RPE saisi", async () => {
    // RPE 9 saisi ⇒ RIR 1. C'est la conversion du moteur, pas une nouvelle.
    const pecs = (await trouver(SACHA, "pectoraux"))!;
    expect(pecs.rirMoyen).toBe(1);
  });

  it("la courbature du jour est reprise telle qu'elle a été déclarée", async () => {
    const pecs = (await trouver(SACHA, "pectoraux"))!;
    expect(pecs.courbature).toBe(6);
    expect(pecs.motifs.join(" ")).toContain("courbatures 6/10");
  });

  it("et tout cela se relit en une phrase, sans reformuler la règle", async () => {
    const pecs = (await trouver(SACHA, "pectoraux"))!;
    const phrase = resumeRecuperation(pecs);
    expect(phrase).toContain("travaillé aujourd'hui");
    expect(phrase).toContain("10 séries");
    expect(phrase).toContain("RIR moyen 1");
    expect(phrase).toContain("courbature 6/10");
    // Un état d'entraînement, jamais un verdict sur le corps.
    expect(phrase).not.toMatch(/lésion|inflammation|blessure|repos médical/i);
  });
});

describe("une contrainte n'est pas une fatigue", () => {
  it("le muscle contraint est « à ménager », même jamais travaillé", async () => {
    const epaule = await trouver(SACHA, "epaules");
    expect(epaule, "la zone que l'application ménage ne s'affiche pas").toBeTruthy();
    expect(epaule!.etat).toBe("a_menager");
    expect(epaule!.severiteContrainte).toBe(SEVERITE.ecartement);
    // Jamais sollicitée : le temps ne lèvera pas cette contrainte.
    expect(epaule!.joursDepuis).toBeNull();
    expect(epaule!.score).toBe(100);
  });

  it("elle passe avant les muscles simplement fatigués", async () => {
    const service = await recuperationMusculaire(SACHA);
    expect(service.muscles[0]!.etat).toBe("a_menager");
  });
});

describe("un muscle jamais travaillé n'est pas un muscle épuisé", () => {
  it("il n'apparaît pas comme en récupération", async () => {
    const mollets = await trouver(SACHA, "mollets");
    // Absent, et surtout : jamais présenté comme entamé. L'inverse ferait
    // passer un débutant qui n'a encore rien fait pour un athlète cramé.
    expect(mollets).toBeUndefined();
  });

  it("aucun muscle affiché ne l'est sans raison", async () => {
    const service = await recuperationMusculaire(SACHA);
    for (const m of service.muscles) {
      const raison = m.etat !== "pret" || m.courbature > 0
        || m.severiteContrainte !== null
        || (m.joursDepuis !== null && m.joursDepuis <= 7);
      expect(raison, `${m.muscle} occupe une ligne sans rien apprendre`).toBe(true);
    }
  });

  it("les muscles masqués sont comptés, pour que l'absence se distingue", async () => {
    const service = await recuperationMusculaire(SACHA);
    expect(service.neutresMasques).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(service.neutresMasques)).toBe(true);
  });
});

describe("deux comptes dans la même salle", () => {
  it("les vingt séries de Maria ne fatiguent pas Sacha", async () => {
    const pecs = (await trouver(SACHA, "pectoraux"))!;
    expect(pecs.seriesDerniereExposition, "le volume d'un autre compte a fuité").toBe(10);
    expect(pecs.rirMoyen, "le RPE 10 de Maria a été moyenné avec celui de Sacha").toBe(1);
  });

  it("la contrainte de Sacha ne s'applique pas à Maria", async () => {
    const chezMaria = await recuperationMusculaire(MARIA);
    expect(chezMaria.muscles.find((m) => m.muscle === "epaules")).toBeUndefined();
    for (const m of chezMaria.muscles) expect(m.severiteContrainte).toBeNull();
  });

  it("et Maria voit bien SA propre séance", async () => {
    const pecs = (await trouver(MARIA, "pectoraux"))!;
    expect(pecs.seriesDerniereExposition).toBe(20);
    expect(pecs.rirMoyen).toBe(0);
  });
});

describe("ce que la carte coûte à l'écran", () => {
  it("elle lit en un nombre de requêtes fixe, pas une par muscle", async () => {
    /*
     * Le risque de forme, ici, est la boucle : un `scoreRecuperation` par
     * muscle avec sa propre lecture. Avec un pool à une connexion, quinze
     * lectures ne se recouvrent pas — elles s'additionnent.
     *
     * On borne plutôt qu'on ne fige : le nombre exact dépend de `mesurerCycle`
     * et des contraintes, qui évoluent pour leurs propres raisons. Ce qui doit
     * rester vrai, c'est qu'il ne dépend PAS du nombre de muscles.
     */
    const { resultat, requetes } = await compterRequetes(() => recuperationMusculaire(SACHA));
    expect(resultat.muscles.length).toBeGreaterThan(1);
    expect(requetes, `${requetes} requêtes pour une carte`).toBeLessThanOrEqual(8);
  });

  it("et ce coût ne bouge pas quand un muscle de plus est sollicité", async () => {
    const avant = (await compterRequetes(() => recuperationMusculaire(SACHA))).requetes;

    const [dos] = await db.insert(schema.exercises).values({
      userId: null, nom: "Tirage vertical", pilier: "P2_tirage", profilTension: "mi_range",
      type: "polyarticulaire", categorieRole: "pilier",
      musclesPrincipaux: ["dorsaux"], musclesSecondaires: ["biceps"], equipement: "poulie",
      slug: `tv-${SACHA.slice(0, 8)}`,
    }).returning();
    const salle = await db.query.gyms.findFirst({ where: eq(schema.gyms.userId, SACHA) });
    const [inst] = await db.insert(schema.exerciseInstances).values({
      userId: SACHA, exerciseId: dos!.id, gymId: salle!.id, machineNom: "Poulie haute",
      conventionCharge: "poids_total",
    }).returning();
    const seance = await db.query.sessionLogs.findFirst({
      where: eq(schema.sessionLogs.userId, SACHA),
    });
    await db.insert(schema.setLogs).values({
      sessionLogId: seance!.id, exerciseInstanceId: inst!.id,
      numeroSerie: 11, repsEffectuees: 10, charge: 60, rpeEffectif: 8,
    });

    const { resultat, requetes } = await compterRequetes(() => recuperationMusculaire(SACHA));
    expect(resultat.muscles.some((m) => m.muscle === "dorsaux")).toBe(true);
    expect(requetes, "le coût suit le nombre de muscles").toBe(avant);
  });
});
