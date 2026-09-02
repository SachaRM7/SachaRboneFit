import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Une cible d'effort peut ne pas exister — de bout en bout.
 *
 * Trois choses se vérifient ici, qu'aucun test unitaire ne peut voir :
 *
 *   ce qui part en base quand personne ne prescrit d'effort ;
 *   qu'une cible se corrige sans retirer l'exercice — c'était impossible, et
 *   le contournement (retirer puis recréer) coûtait le rang de la ligne et le
 *   lien de l'historique vers son origine ;
 *   que la progression décide exactement comme avant, avec ou sans cible.
 */

const U = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({ getAuthenticatedUserId: async () => U }));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { eq } = await import("drizzle-orm");
const {
  ajouterExerciceAuTemplate,
  modifierExerciceDuTemplate,
  retirerExerciceDuTemplate,
  RessourceIntrouvable,
} = await import("@/services/programmes");
const { construireSeanceDuJour } = await import("@/services/plan-seance");
const { computeNextSets } = await import("@/lib/engine/double-progression");
const { cibleDepuisChoix, NON_PRESCRIT } = await import("@/components/programme/cible-effort");

let gabarit = "";
let salle = "";
const instances: Record<string, string> = {};

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBeTruthy();

  await db.insert(schema.users).values({
    id: U, email: `${U}@t.test`, nom: "Testeur", onboardingTermineLe: new Date(),
    dureeSeanceCibleMinutes: 120, frequenceCibleParSemaine: 3,
  });

  const [g] = await db.insert(schema.gyms).values({ userId: U, nom: `Salle ${U.slice(0, 8)}` }).returning();
  salle = g!.id;

  for (const [cle, nom, pilier, muscles] of [
    ["dev", "Développé couché", "P1_poussee", ["pectoraux"]],
    ["tirage", "Tirage horizontal", "P2_tirage", ["dorsaux"]],
  ] as Array<[string, string, string, string[]]>) {
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
});

describe("13 — un exercice ajouté sans effort prescrit reste sans effort prescrit", () => {
  it("la colonne vaut NULL, pas 8", async () => {
    const ligne = await ajouterExerciceAuTemplate({
      userId: U, seanceTemplateId: gabarit, exerciseInstanceId: instances.dev!,
      seriesCibles: 3, fourchetteRepsMin: 8, fourchetteRepsMax: 12,
      // Exactement ce que l'éditeur envoie sur son choix par défaut.
      rpeCible: cibleDepuisChoix(NON_PRESCRIT),
    });
    const relue = await db.query.exerciseInTemplate.findFirst({
      where: eq(schema.exerciseInTemplate.id, ligne.id),
    });
    expect(relue?.rpeCible).toBeNull();
  });

  it("et la séance du jour la transmet telle quelle", async () => {
    const seance = await construireSeanceDuJour({
      userId: U, seanceTemplateId: gabarit, gymId: salle, date: "2026-08-20",
    });
    const item = seance.items.find((i) => i.exerciseInstanceId === instances.dev);
    expect(item).toBeDefined();
    // Le tableau de séries lit ce champ pour pré-remplir la colonne RPE.
    expect(item!.rpeCible).toBeNull();
  });
});

describe("14 — une cible se corrige sans retirer l'exercice", () => {
  let ligneId = "";

  beforeAll(async () => {
    const ligne = await ajouterExerciceAuTemplate({
      userId: U, seanceTemplateId: gabarit, exerciseInstanceId: instances.tirage!,
      seriesCibles: 4, fourchetteRepsMin: 8, fourchetteRepsMax: 12,
    });
    ligneId = ligne.id;
  });

  it("de rien vers une cible", async () => {
    const misAJour = await modifierExerciceDuTemplate(U, ligneId, { rpeCible: cibleDepuisChoix("2") });
    expect(misAJour.rpeCible).toBe(8);
  });

  it("d'une cible vers une autre", async () => {
    const misAJour = await modifierExerciceDuTemplate(U, ligneId, { rpeCible: cibleDepuisChoix("1") });
    expect(misAJour.rpeCible).toBe(9);
  });

  it("et retour à « non prescrit » — le geste qui n'existait pas", async () => {
    const misAJour = await modifierExerciceDuTemplate(U, ligneId, {
      rpeCible: cibleDepuisChoix(NON_PRESCRIT),
    });
    expect(misAJour.rpeCible).toBeNull();
  });

  it("sans jamais toucher au rang ni archiver la ligne", async () => {
    const relue = await db.query.exerciseInTemplate.findFirst({
      where: eq(schema.exerciseInTemplate.id, ligneId),
    });
    expect(relue?.ordre).toBe(2);
    expect(relue?.archiveLe).toBeNull();
  });

  it("une modification sans champ ne change rien", async () => {
    await modifierExerciceDuTemplate(U, ligneId, { rpeCible: 8 });
    const inchangee = await modifierExerciceDuTemplate(U, ligneId, {});
    expect(inchangee.rpeCible).toBe(8);
  });

  it("refuse une ligne inconnue, et une ligne retirée", async () => {
    await expect(modifierExerciceDuTemplate(U, randomUUID(), { rpeCible: null }))
      .rejects.toThrow(RessourceIntrouvable);

    const jetable = await ajouterExerciceAuTemplate({
      userId: U, seanceTemplateId: gabarit, exerciseInstanceId: instances.dev!,
      seriesCibles: 3, fourchetteRepsMin: 8, fourchetteRepsMax: 12,
    });
    await retirerExerciceDuTemplate(U, jetable.id);
    await expect(modifierExerciceDuTemplate(U, jetable.id, { rpeCible: 8 }))
      .rejects.toThrow(RessourceIntrouvable);
  });

  it("refuse un utilisateur qui n'est pas le propriétaire", async () => {
    await expect(modifierExerciceDuTemplate(randomUUID(), ligneId, { rpeCible: null }))
      .rejects.toThrow(RessourceIntrouvable);
    // Et la ligne n'a pas bougé.
    const relue = await db.query.exerciseInTemplate.findFirst({
      where: eq(schema.exerciseInTemplate.id, ligneId),
    });
    expect(relue?.rpeCible).toBe(8);
  });
});

describe("15 — une série sans effort saisi est persistée sans effort", () => {
  it("`rpe_effectif` reste NULL en base", async () => {
    const [seance] = await db.insert(schema.sessionLogs).values({
      userId: U, date: "2026-08-21", gymId: salle, seanceTemplateId: gabarit, dureeMinutes: 55,
    }).returning();

    await db.insert(schema.setLogs).values({
      sessionLogId: seance!.id, exerciseInstanceId: instances.dev!,
      numeroSerie: 1, repsEffectuees: 10, charge: 60, rpeEffectif: null,
    });

    const serie = await db.query.setLogs.findFirst({
      where: eq(schema.setLogs.sessionLogId, seance!.id),
    });
    expect(serie?.rpeEffectif).toBeNull();
    // Le défaut d'origine : un 8 que personne n'avait ressenti.
    expect(serie?.rpeEffectif).not.toBe(8);
  });
});

/**
 * 16 à 21 — aucune règle de progression ne change.
 *
 * La double progression ne lit pas `rpeCible` : elle décide sur les répétitions
 * réalisées et sur la complétude de la référence. Ces cas le prouvent en
 * comparant les mêmes séries avec et sans cible.
 */
describe("la progression décide exactement comme avant", () => {
  /** La prescription, sans cible d'effort — le cas que ce chantier généralise. */
  const cible = {
    seriesCibles: 3, fourchetteRepsMin: 8, fourchetteRepsMax: 12,
    charge: {
      natureCharge: "resistance" as const, paliersCharges: null,
      incrementsPossibles: [2.5], chargeMinimale: 2.5, chargeMax: null,
    },
  };

  const troisSeries = (reps: number, rpe: number | null) => ({
    sets: [1, 2, 3].map((n) => ({ numero: n, charge: 60, reps, rpe })),
    seriesAttendues: 3,
  });

  it("16 — fourchette haute atteinte : la charge monte, avec ou sans RPE réel", () => {
    const sans = computeNextSets(troisSeries(12, null), cible);
    const avec = computeNextSets(troisSeries(12, 8), cible);
    expect(sans.charge).toBe(62.5);
    expect(avec.charge).toBe(sans.charge);
    expect(avec.motifProgression).toBe(sans.motifProgression);
  });

  it("17 — fourchette non atteinte : la charge tient, avec ou sans RPE réel", () => {
    const sans = computeNextSets(troisSeries(9, null), cible);
    const avec = computeNextSets(troisSeries(9, 8), cible);
    expect(sans.charge).toBe(60);
    expect(avec.charge).toBe(sans.charge);
    expect(avec.motifProgression).toBe(sans.motifProgression);
  });

  it("18 — la présence d'une cible d'effort ne change pas la décision", () => {
    // `rpeCible` n'est lu par aucune règle de ce module, et ce chantier ne le
    // lui injecte pas.
    const sans = computeNextSets(troisSeries(12, null), cible);
    const avec = computeNextSets(troisSeries(12, null), { ...cible, rpeCible: 8 });
    expect(avec.charge).toBe(sans.charge);
    expect(avec.messageProgression).toBe(sans.messageProgression);
    expect(avec.motifProgression).toBe(sans.motifProgression);
  });

  it("19 — la référence tronquée reste tronquée, sans effort prescrit", () => {
    const tronquee = computeNextSets(
      { sets: [{ numero: 1, charge: 60, reps: 12, rpe: null }], seriesAttendues: 3 },
      cible,
    );
    expect(tronquee.charge).toBe(60);
    expect(tronquee.motifProgression).toBe("reference_tronquee");
  });

  it("20 — sans historique, rien n'est proposé de plus qu'avant", () => {
    const vide = computeNextSets(null, cible);
    expect(vide.motifProgression).toBeNull();
    expect(vide.charge).toBe(0);
  });

  it("21 — le message affiché ne mentionne aucun RPE fabriqué", () => {
    const sans = computeNextSets(troisSeries(12, null), cible);
    expect(sans.messageProgression ?? "").not.toMatch(/RPE\s*8/i);
  });
});
