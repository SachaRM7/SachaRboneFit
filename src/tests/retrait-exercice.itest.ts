import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Retirer un exercice d'un programme.
 *
 * La suppression physique était impossible : `session_plan_items` référence la
 * ligne de gabarit sans cascade, donc toute ligne déjà servie dans une séance
 * levait une violation de clé étrangère — l'écran Programme échouait en 500 sur
 * un geste ordinaire, et l'écran Matériel conseillait précisément cette
 * manœuvre pour libérer une machine.
 *
 * Ce fichier fixe la sémantique retenue : retirer, c'est cesser de programmer.
 * Ce qui se vérifie ici est donc autant ce qui disparaît des séances à venir
 * que ce qui ne bouge pas dans l'historique.
 */

const U = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({ getAuthenticatedUserId: async () => U }));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { eq, and, asc, isNull } = await import("drizzle-orm");
const { retirerExerciceDuTemplate, ajouterExerciceAuTemplate, RessourceIntrouvable } =
  await import("@/services/programmes");
const { lirePlan } = await import("@/services/plan-seance");
const { preparerProposition, appliquerProposition } =
  await import("@/services/propositions-coach");
const { createCoachTools } = await import("@/lib/coach/tools");

let gabarit = "";
let salle = "";
let seancePassee = "";
const instances: Record<string, string> = {};
const lignes: Record<string, string> = {};

/** Les lignes encore programmées, dans l'ordre. */
async function programmees() {
  return db
    .select({ id: schema.exerciseInTemplate.id, ordre: schema.exerciseInTemplate.ordre })
    .from(schema.exerciseInTemplate)
    .where(and(
      eq(schema.exerciseInTemplate.seanceTemplateId, gabarit),
      isNull(schema.exerciseInTemplate.archiveLe),
    ))
    .orderBy(asc(schema.exerciseInTemplate.ordre));
}

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBeTruthy();

  await db.insert(schema.users).values({
    id: U, email: `${U}@t.test`, nom: "Testeur", onboardingTermineLe: new Date(),
    dureeSeanceCibleMinutes: 120, frequenceCibleParSemaine: 3,
  });

  const [g] = await db.insert(schema.gyms).values({ userId: U, nom: `Salle ${U.slice(0, 8)}` }).returning();
  salle = g!.id;

  const fiches: Array<[string, string, string, string[]]> = [
    ["dev", "Développé couché", "P1_poussee", ["pectoraux"]],
    ["tirage", "Tirage horizontal", "P2_tirage", ["dorsaux"]],
    ["elev", "Élévations latérales", "epaules", ["deltoide_lateral"]],
    ["curl", "Curl pupitre", "bras_biceps", ["biceps"]],
  ];
  for (const [cle, nom, pilier, muscles] of fiches) {
    const [e] = await db.insert(schema.exercises).values({
      userId: null, nom, pilier, profilTension: "mi_range", type: "polyarticulaire",
      categorieRole: "pilier", musclesPrincipaux: muscles, musclesSecondaires: [],
      equipement: "machine", slug: `${cle}-${U.slice(0, 8)}`,
    }).returning();
    const [i] = await db.insert(schema.exerciseInstances).values({
      userId: U, exerciseId: e!.id, gymId: salle, machineNom: `Poste ${cle}`,
      conventionCharge: "poids_total", incrementsPossibles: [2.5],
    }).returning();
    instances[cle] = i!.id;
  }

  const [bloc] = await db.insert(schema.programmeBlocs).values({
    userId: U, nom: "Bloc", dateDebut: "2026-08-01", typeCycle: "volume", actif: true,
  }).returning();
  const [t] = await db.insert(schema.seanceTemplates).values({
    blocId: bloc!.id, lettre: "A", nom: "Haut du corps", ordreDansSemaine: 1,
  }).returning();
  gabarit = t!.id;

  for (const [index, cle] of ["dev", "tirage", "elev", "curl"].entries()) {
    const [l] = await db.insert(schema.exerciseInTemplate).values({
      seanceTemplateId: gabarit, exerciseInstanceId: instances[cle]!,
      ordre: index + 1, seriesCibles: 4, fourchetteRepsMin: 8, fourchetteRepsMax: 12,
      reposSecondes: 120,
    }).returning();
    lignes[cle] = l!.id;
  }

  // Une séance déjà réalisée, qui cite deux lignes du gabarit : c'est elle qui
  // rendait la suppression impossible.
  const [seance] = await db.insert(schema.sessionLogs).values({
    userId: U, date: "2026-08-10", gymId: salle, seanceTemplateId: gabarit, dureeMinutes: 62,
  }).returning();
  seancePassee = seance!.id;

  for (const [index, cle] of ["dev", "elev"].entries()) {
    await db.insert(schema.sessionPlanItems).values({
      sessionLogId: seancePassee, ordre: index + 1,
      exerciseInstanceId: instances[cle]!,
      exerciseInTemplateId: lignes[cle]!,
      exerciseInstancePrevuId: instances[cle]!,
      seriesCibles: 4, fourchetteRepsMin: 8, fourchetteRepsMax: 12,
      reposSecondes: 120, statut: "fait",
    });
    await db.insert(schema.setLogs).values({
      sessionLogId: seancePassee, exerciseInstanceId: instances[cle]!,
      numeroSerie: 1, repsEffectuees: 10, charge: 60, rpeEffectif: 8,
    });
  }
});

describe("retirer un exercice jamais utilisé", () => {
  it("le sort du programme et renumérote la suite", async () => {
    await retirerExerciceDuTemplate(U, lignes.curl!);

    const restantes = await programmees();
    expect(restantes.map((l) => l.id)).toEqual([lignes.dev, lignes.tirage, lignes.elev]);
    expect(restantes.map((l) => l.ordre)).toEqual([1, 2, 3]);
  });

  it("ne détruit pas la ligne : elle est datée, pas effacée", async () => {
    const ligne = await db.query.exerciseInTemplate.findFirst({
      where: eq(schema.exerciseInTemplate.id, lignes.curl!),
    });
    expect(ligne).toBeDefined();
    expect(ligne?.archiveLe).toBeInstanceOf(Date);
  });

  it("refuse un second retrait de la même ligne", async () => {
    await expect(retirerExerciceDuTemplate(U, lignes.curl!)).rejects.toThrow(RessourceIntrouvable);
  });
});

describe("retirer un exercice déjà servi dans une séance", () => {
  it("réussit là où la suppression physique levait une clé étrangère", async () => {
    // `session_plan_items` cite cette ligne : l'ancien DELETE échouait ici.
    await expect(retirerExerciceDuTemplate(U, lignes.elev!)).resolves.toBeUndefined();

    const restantes = await programmees();
    expect(restantes.map((l) => l.id)).toEqual([lignes.dev, lignes.tirage]);
  });

  it("laisse la séance passée intacte, et son lien vers son origine", async () => {
    const item = await db.query.sessionPlanItems.findFirst({
      where: and(
        eq(schema.sessionPlanItems.sessionLogId, seancePassee),
        eq(schema.sessionPlanItems.exerciseInTemplateId, lignes.elev!),
      ),
    });
    // La provenance survit : on sait toujours de quelle ligne de programme
    // venait cet exercice-là, ce jour-là.
    expect(item).toBeDefined();
    expect(item?.seriesCibles).toBe(4);
  });

  it("garde les séries réalisées", async () => {
    const series = await db.query.setLogs.findMany({
      where: eq(schema.setLogs.sessionLogId, seancePassee),
    });
    expect(series).toHaveLength(2);
  });
});

describe("l'historique reste lisible et la séance reproductible", () => {
  it("la séance passée s'affiche encore avec ses deux exercices", async () => {
    const plan = await lirePlan(U, seancePassee);
    expect(plan).not.toBeNull();
    expect(plan!.items).toHaveLength(2);
    // Y compris celui qui n'est plus programmé : l'historique dit ce qui a été
    // fait, pas ce qui est prévu.
    expect(plan!.items.map((i) => i.nom).sort()).toEqual([
      "Développé couché", "Élévations latérales",
    ]);
  });

  it("la prescription de l'époque est conservée telle quelle", async () => {
    const plan = await lirePlan(U, seancePassee);
    const elev = plan!.items.find((i) => i.nom === "Élévations latérales")!;
    expect(elev.seriesCibles).toBe(4);
    expect(elev.fourchetteRepsMin).toBe(8);
    expect(elev.fourchetteRepsMax).toBe(12);
  });
});

describe("les séances à venir ne le proposent plus", () => {
  it("la construction de la séance du jour ignore les lignes retirées", async () => {
    const { construireSeanceDuJour } = await import("@/services/plan-seance");
    const resultat = await construireSeanceDuJour({
      userId: U, seanceTemplateId: gabarit, gymId: salle,
      date: "2026-08-31",
    });
    const noms = resultat.items.map((i) => i.exerciseInstanceId);
    expect(noms).toContain(instances.dev);
    expect(noms).not.toContain(instances.elev);
    expect(noms).not.toContain(instances.curl);
  });

  it("un ajout reprend l'ordre après les seules lignes actives", async () => {
    const ligne = await ajouterExerciceAuTemplate({
      userId: U, seanceTemplateId: gabarit, exerciseInstanceId: instances.curl!,
      seriesCibles: 3, fourchetteRepsMin: 10, fourchetteRepsMax: 15,
    });
    // Deux lignes actives avant l'ajout : la nouvelle prend le rang 3, pas 5.
    expect(ligne.ordre).toBe(3);

    await db.delete(schema.exerciseInTemplate).where(eq(schema.exerciseInTemplate.id, ligne.id));
  });
});

describe("le coach et l'édition manuelle retirent de la même façon", () => {
  it("une proposition de retrait date la ligne au lieu de la supprimer", async () => {
    const outils = createCoachTools();
    const resultat = await outils.executors.propose_exercise_removal!(
      { ligneId: lignes.tirage, seanceTemplateId: gabarit },
      U,
    );
    expect(resultat.success).toBe(true);
    const { propositionId } = JSON.parse(resultat.output) as { propositionId: string };

    await appliquerProposition(U, propositionId);

    const ligne = await db.query.exerciseInTemplate.findFirst({
      where: eq(schema.exerciseInTemplate.id, lignes.tirage!),
    });
    // Exactement ce que fait `retirerExerciceDuTemplate` : datée, pas effacée.
    expect(ligne).toBeDefined();
    expect(ligne?.archiveLe).toBeInstanceOf(Date);

    expect((await programmees()).map((l) => l.id)).toEqual([lignes.dev]);
  });

  it("refuse de vider entièrement la séance", async () => {
    await expect(
      preparerProposition({
        userId: U, seanceTemplateId: gabarit,
        operation: { type: "retirer_exercice", ligneId: lignes.dev! },
      }),
    ).rejects.toThrow(/dernier exercice/);
  });
});

describe("aucune cascade destructive", () => {
  it("rien n'a disparu : ni lignes de programme, ni plan de séance, ni séries", async () => {
    const toutesLesLignes = await db.query.exerciseInTemplate.findMany({
      where: eq(schema.exerciseInTemplate.seanceTemplateId, gabarit),
    });
    // Les quatre lignes d'origine sont toujours là, trois d'entre elles datées.
    expect(toutesLesLignes).toHaveLength(4);
    expect(toutesLesLignes.filter((l) => l.archiveLe !== null)).toHaveLength(3);

    const items = await db.query.sessionPlanItems.findMany({
      where: eq(schema.sessionPlanItems.sessionLogId, seancePassee),
    });
    expect(items).toHaveLength(2);

    const series = await db.query.setLogs.findMany({
      where: eq(schema.setLogs.sessionLogId, seancePassee),
    });
    expect(series).toHaveLength(2);
  });

  it("une machine que plus aucune séance ne programme redevient supprimable", async () => {
    // L'écran Matériel refusait la suppression tant qu'une ligne — même
    // retirée — citait l'instance. Il conseillait pourtant de la retirer.
    const citations = await db.query.exerciseInTemplate.findMany({
      where: (eit, { and, eq, isNull }) =>
        and(eq(eit.exerciseInstanceId, instances.curl!), isNull(eit.archiveLe)),
    });
    expect(citations).toHaveLength(0);
  });
});
