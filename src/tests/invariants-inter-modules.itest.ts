import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Les invariants qui tiennent ENTRE les modules.
 *
 * Chaque sous-système a ses propres tests. Ceux-ci vérifient ce qu'aucun d'eux
 * ne peut voir seul : qu'une même séance n'est pas « terminée » pour un écran
 * et « en cours » pour un autre, qu'un exercice retiré du programme reste
 * lisible dans l'historique, qu'un cycle affiche la même semaine partout.
 *
 * Ils sont peu nombreux et volontairement grossiers : ce sont des contrats, pas
 * des cas limites. Un contrat rompu ici veut dire que deux parties de
 * l'application ont cessé de parler de la même chose.
 */

const U = randomUUID();
const VOISIN = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({ getAuthenticatedUserId: async () => U }));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { eq, and } = await import("drizzle-orm");
const { creerSeance, terminerSeance, seanceCourante, estTerminee } =
  await import("@/services/seances");
const { prochaineSeance, retirerExerciceDuTemplate } = await import("@/services/programmes");
const { construireSeanceDuJour, lirePlan, derniereSeriesPour } =
  await import("@/services/plan-seance");
const { bilanDeProgression } = await import("@/services/bilan");
const { vueDuProgramme, positionDuBloc, mesurerCycle } = await import("@/services/cycle");
const { resoudreContexte } = await import("@/services/contexte-coach");
const { recordsDeLExercice } = await import("@/lib/engine/records");
const { lundiDe, decalerDe } = await import("@/lib/semaines");

const AUJOURDHUI = new Date().toISOString().slice(0, 10);

let bloc = "";
let gabaritA = "";
let gabaritB = "";
let salle = "";
const instances: Record<string, string> = {};
const lignes: Record<string, string> = {};

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBeTruthy();

  for (const id of [U, VOISIN]) {
    await db.insert(schema.users).values({
      id, email: `${id}@t.test`, nom: "Testeur", onboardingTermineLe: new Date(),
      dureeSeanceCibleMinutes: 120, frequenceCibleParSemaine: 3,
    });
  }

  const [g] = await db.insert(schema.gyms).values({ userId: U, nom: `Salle ${U.slice(0, 8)}` }).returning();
  salle = g!.id;

  for (const [cle, nom, pilier, muscle] of [
    ["dev", "Développé couché", "P1_poussee", "pectoraux"],
    ["tirage", "Tirage horizontal", "P2_tirage", "dorsaux"],
  ] as const) {
    const [e] = await db.insert(schema.exercises).values({
      userId: null, nom, pilier, profilTension: "mi_range", type: "polyarticulaire",
      categorieRole: "pilier", musclesPrincipaux: [muscle], musclesSecondaires: [],
      equipement: "machine", slug: `${cle}-${U.slice(0, 8)}`,
    }).returning();
    const [i] = await db.insert(schema.exerciseInstances).values({
      userId: U, exerciseId: e!.id, gymId: salle, machineNom: `Poste ${cle}`,
      conventionCharge: "poids_total", incrementsPossibles: [2.5],
    }).returning();
    instances[cle] = i!.id;
  }

  // Un bloc démarré il y a deux semaines : la semaine courante vaut donc 3.
  const debut = decalerDe(lundiDe(AUJOURDHUI), -14);
  const [b] = await db.insert(schema.programmeBlocs).values({
    userId: U, nom: "Bloc", dateDebut: debut, typeCycle: "volume", actif: true,
  }).returning();
  bloc = b!.id;

  for (const [ordre, lettre, nom] of [[1, "A", "Haut"], [2, "B", "Bas"]] as const) {
    const [t] = await db.insert(schema.seanceTemplates).values({
      blocId: bloc, lettre, nom, ordreDansSemaine: ordre,
    }).returning();
    if (lettre === "A") gabaritA = t!.id; else gabaritB = t!.id;
  }

  for (const [ordre, cle] of ["dev", "tirage"].entries()) {
    const [l] = await db.insert(schema.exerciseInTemplate).values({
      seanceTemplateId: gabaritA, exerciseInstanceId: instances[cle]!,
      ordre: ordre + 1, seriesCibles: 3, fourchetteRepsMin: 8, fourchetteRepsMax: 12,
      reposSecondes: 120,
    }).returning();
    lignes[cle] = l!.id;
  }
});

describe("une séance ouverte n'est pas une séance faite", () => {
  it("ne fait pas avancer la rotation tant qu'elle n'est pas clôturée", async () => {
    const avant = await prochaineSeance(U);
    expect(avant?.template.id).toBe(gabaritA);

    // L'athlète ouvre la séance A, puis quitte l'application.
    const ouverte = await creerSeance({
      userId: U, date: AUJOURDHUI, seanceTemplateId: gabaritA, gymId: salle,
    });
    expect(estTerminee(ouverte)).toBe(false);

    // Elle ne s'est pas produite : l'application propose toujours A.
    const apres = await prochaineSeance(U);
    expect(apres?.template.id).toBe(gabaritA);

    // Et l'écran de séance la retrouve bien comme séance en cours.
    expect((await seanceCourante(U))?.id).toBe(ouverte.id);
  });

  it("reprend la séance ouverte au lieu d'en créer une seconde", async () => {
    const premiere = await seanceCourante(U);
    const rappel = await creerSeance({
      userId: U, date: AUJOURDHUI, seanceTemplateId: gabaritA, gymId: salle,
    });
    expect(rappel.id).toBe(premiere!.id);

    const toutes = await db.query.sessionLogs.findMany({
      where: and(eq(schema.sessionLogs.userId, U), eq(schema.sessionLogs.date, AUJOURDHUI)),
    });
    expect(toutes).toHaveLength(1);
  });
});

describe("une séance terminée l'est pour tout le monde", () => {
  it("sort de « en cours », entre dans la progression, fait avancer la rotation", async () => {
    const ouverte = (await seanceCourante(U))!;

    await terminerSeance({
      userId: U, sessionLogId: ouverte.id, dureeMinutes: 55, energieFin: 6,
      series: [
        { exerciseInstanceId: instances.dev!, numeroSerie: 1, repsEffectuees: 10, charge: 60, rpeEffectif: 8 },
        { exerciseInstanceId: instances.tirage!, numeroSerie: 1, repsEffectuees: 10, charge: 50, rpeEffectif: 8 },
      ],
    });

    // 1. Plus « en cours » nulle part.
    expect(await seanceCourante(U)).toBeNull();

    // 2. Comptée par la progression.
    const bilan = await bilanDeProgression(U);
    expect(bilan.etat).not.toBe("sans_donnees");
    expect(bilan.seancesTotal).toBe(1);

    // 3. La rotation avance : après A vient B.
    expect((await prochaineSeance(U))?.template.id).toBe(gabaritB);

    // 4. L'historique la relit avec son contenu.
    const plan = await lirePlan(U, ouverte.id);
    expect(plan?.seance.dureeMinutes).toBe(55);
  });
});

describe("une première mesure n'est jamais un record", () => {
  it("reste une référence sur tous les écrans qui la lisent", async () => {
    const records = recordsDeLExercice([
      { date: AUJOURDHUI, charge: 60, reps: 10, rir: 2 },
    ]);
    // Le moteur le dit…
    expect(records.parPlage.every((p) => p.nature === "baseline")).toBe(true);
    expect(records.parPlage.every((p) => p.progressionDepuisDebut === null)).toBe(true);

    // …et le bilan ne signale aucun record sur une séance unique.
    const bilan = await bilanDeProgression(U);
    expect(bilan.recordsRecents).toHaveLength(0);
  });
});

describe("la semaine du cycle est la même partout", () => {
  it("Accueil, Programme et coach lisent le même numéro", async () => {
    const b = (await db.query.programmeBlocs.findFirst({
      where: eq(schema.programmeBlocs.id, bloc),
    }))!;

    const referenceur = positionDuBloc(b).semaine;
    const vue = await vueDuProgramme(U);
    const mesure = await mesurerCycle(U);
    const contexte = await resoudreContexte(U, { ecran: "programme" });

    expect(vue.cycle?.position.semaine).toBe(referenceur);
    expect(mesure.bloc?.semaine).toBe(referenceur);
    expect(contexte.texte).toContain(`semaine ${referenceur}`);
    // Un bloc démarré il y a deux semaines n'est pas en semaine 1.
    expect(referenceur).toBe(3);
  });
});

describe("un exercice retiré disparaît du futur sans effacer le passé", () => {
  it("sort du prochain plan, reste dans l'historique, quitte les comptes du programme", async () => {
    const seanceFaite = (await db.query.sessionLogs.findFirst({
      where: and(eq(schema.sessionLogs.userId, U), eq(schema.sessionLogs.date, AUJOURDHUI)),
    }))!;

    const exercicesAvant = (await vueDuProgramme(U)).semaine
      .find((s) => s.nom === "Haut")?.exercices;
    const seancesAvant = (await bilanDeProgression(U)).seancesTotal;

    await retirerExerciceDuTemplate(U, lignes.tirage!);

    // 1. Absent du prochain plan construit depuis ce gabarit.
    const plan = await construireSeanceDuJour({
      userId: U, seanceTemplateId: gabaritA, gymId: salle,
      date: decalerDe(AUJOURDHUI, 1),
    });
    expect(plan.items.map((i) => i.exerciseInstanceId)).not.toContain(instances.tirage);
    expect(plan.items.map((i) => i.exerciseInstanceId)).toContain(instances.dev);

    // 2. Le compte du programme actif baisse d'un.
    const exercicesApres = (await vueDuProgramme(U)).semaine
      .find((s) => s.nom === "Haut")?.exercices;
    expect(exercicesApres).toBe(exercicesAvant! - 1);

    // 3. La séance déjà faite garde ses deux exercices, et la progression aussi.
    const historique = await lirePlan(U, seanceFaite.id);
    expect(historique?.seance.id).toBe(seanceFaite.id);
    // Retirer du programme n'efface aucune séance : le compte ne baisse pas.
    const bilan = await bilanDeProgression(U);
    expect(bilan.seancesTotal).toBeGreaterThanOrEqual(seancesAvant);
    const series = await db.query.setLogs.findMany({
      where: eq(schema.setLogs.sessionLogId, seanceFaite.id),
    });
    expect(series).toHaveLength(2);
  });
});

describe("le parc est partagé, les historiques ne le sont pas", () => {
  it("la séance d'un voisin sur la même machine ne masque pas la mienne", async () => {
    // Le voisin passe sur la même machine, plus récemment que moi.
    const [sienne] = await db.insert(schema.sessionLogs).values({
      userId: VOISIN, date: decalerDe(AUJOURDHUI, 1), gymId: salle, dureeMinutes: 40,
    }).returning();
    await db.insert(schema.setLogs).values({
      sessionLogId: sienne!.id, exerciseInstanceId: instances.dev!,
      numeroSerie: 1, repsEffectuees: 3, charge: 200,
    });

    // Ma dernière séance sur cette machine reste la mienne, avec mes charges.
    const mienne = await derniereSeriesPour(U, instances.dev!);
    expect(mienne).not.toBeNull();
    expect(mienne!.sets.map((s) => s.charge)).toEqual([60]);

    await db.delete(schema.setLogs).where(eq(schema.setLogs.sessionLogId, sienne!.id));
    await db.delete(schema.sessionLogs).where(eq(schema.sessionLogs.id, sienne!.id));
  });
});
