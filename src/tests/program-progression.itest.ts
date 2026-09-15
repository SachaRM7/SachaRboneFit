import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * La charge programmée, et l'autorité de l'historique.
 *
 * Trois choses se vérifient ici, qu'aucun test unitaire ne peut voir :
 *
 *   une charge déclarée au programme remonte jusqu'au premier repère affiché,
 *   SANS devenir une suggestion de progression ;
 *   dès qu'une série existe en base, c'est elle qui fait référence — la charge
 *   programmée s'efface, et le moteur décide seul ;
 *   la séquence de double progression ne change pas d'un iota, y compris le
 *   retour en bas de fourchette après un cran de charge.
 *
 * Le quatrième bloc vérifie l'ordre et la propriété : un rang ne s'écrit ni sur
 * la ligne d'un autre compte, ni en laissant deux lignes au même rang.
 */

const U = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({ getAuthenticatedUserId: async () => U }));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { eq, and, asc, isNull } = await import("drizzle-orm");
const {
  ajouterExerciceAuTemplate,
  modifierExerciceDuTemplate,
  reordonnerExerciceDuTemplate,
  retirerExerciceDuTemplate,
  PrescriptionInvalide,
  RessourceIntrouvable,
} = await import("@/services/programmes");
const { construireSeanceDuJour, lirePlan, chargeAffichable } = await import("@/services/plan-seance");
const { modifierSeanceTemplate } = await import("@/services/programme-management");
const { computeNextSets } = await import("@/lib/engine/double-progression");
const { configurationDe } = await import("@/lib/engine/charges");

let gabarit = "";
let autreGabarit = "";
let salle = "";
const instances: Record<string, string> = {};

/** Les lignes encore programmées d'une séance, dans l'ordre. */
async function programmees(templateId = gabarit) {
  return db
    .select({ id: schema.exerciseInTemplate.id, ordre: schema.exerciseInTemplate.ordre })
    .from(schema.exerciseInTemplate)
    .where(and(
      eq(schema.exerciseInTemplate.seanceTemplateId, templateId),
      isNull(schema.exerciseInTemplate.archiveLe),
    ))
    .orderBy(asc(schema.exerciseInTemplate.ordre));
}

beforeAll(async () => {
  expect(process.env.DATABASE_URL, "base de test requise").toBeTruthy();

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
      conventionCharge: "poids_total",
      // Une grille matérielle réelle : 2,5 kg de pas, et un cran au-delà.
      incrementsPossibles: [2.5],
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
  const [t2] = await db.insert(schema.seanceTemplates).values({
    blocId: bloc!.id, lettre: "B", nom: "Bas du corps", ordreDansSemaine: 2,
  }).returning();
  autreGabarit = t2!.id;
});

describe("1 — la charge programmée est le premier repère, et n'est pas une estimation", () => {
  let ligne = "";

  beforeAll(async () => {
    const creee = await ajouterExerciceAuTemplate({
      userId: U, seanceTemplateId: gabarit, exerciseInstanceId: instances.dev!,
      seriesCibles: 3, fourchetteRepsMin: 8, fourchetteRepsMax: 12, chargeCible: 60,
    });
    ligne = creee.id;
  });

  it("elle survit à la tournée en base", async () => {
    const relue = await db.query.exerciseInTemplate.findFirst({
      where: eq(schema.exerciseInTemplate.id, ligne),
    });
    expect(relue?.chargeCible).toBe(60);
  });

  it("elle devient `premiereCharge`, avec son origine propre", async () => {
    const seance = await construireSeanceDuJour({
      userId: U, seanceTemplateId: gabarit, gymId: salle, date: "2026-08-20",
    });
    const item = seance.items.find((i) => i.exerciseInstanceId === instances.dev);
    const plan = await lirePlan(U, seance.seance.id);
    const enrichi = plan!.items.find((i) => i.planItemId === item!.id)!;

    expect(enrichi.premiereCharge.charge).toBe(60);
    expect(enrichi.premiereCharge.origine).toBe("charge_programmee");
    // Le vocabulaire est le sujet : ce nombre est déclaré, pas déduit.
    expect(`${enrichi.premiereCharge.explication} ${enrichi.premiereCharge.origine}`)
      .not.toMatch(/estim/i);
    expect(enrichi.chargeCible).toBe(60);
  });

  it("elle n'est PAS une suggestion de progression", async () => {
    // Le cœur de la règle : aucun second moteur. Sans historique, la double
    // progression ne propose rien — et « rien » ne s'affiche pas comme 0 kg.
    const seance = await construireSeanceDuJour({
      userId: U, seanceTemplateId: gabarit, gymId: salle, date: "2026-08-20",
    });
    const item = seance.items.find((i) => i.exerciseInstanceId === instances.dev)!;
    expect(item.chargeSuggeree).toBeNull();
    expect(item.chargeCible).toBe(60);

    const plan = await lirePlan(U, seance.seance.id);
    const enrichi = plan!.items.find((i) => i.planItemId === item.id)!;
    expect(enrichi.chargeSuggeree).toBeNull();
    expect(enrichi.motifProgression).toBeNull();
    expect(enrichi.messageProgression).toBeNull();
  });

  it("`0` veut dire « rien à proposer », et reste vide", () => {
    expect(chargeAffichable(0)).toBeNull();
    expect(chargeAffichable(null)).toBeNull();
    expect(chargeAffichable(undefined)).toBeNull();
    expect(chargeAffichable(62.5)).toBe(62.5);
  });

  it("une charge cible absente reste NULL, jamais 0", async () => {
    const sansCharge = await ajouterExerciceAuTemplate({
      userId: U, seanceTemplateId: autreGabarit, exerciseInstanceId: instances.tirage!,
      seriesCibles: 3, fourchetteRepsMin: 8, fourchetteRepsMax: 12,
    });
    expect(sansCharge.chargeCible).toBeNull();
  });
});

describe("2 — une série réellement faite prend l'autorité, définitivement", () => {
  beforeAll(async () => {
    const [seance] = await db.insert(schema.sessionLogs).values({
      userId: U, date: "2026-08-25", gymId: salle, seanceTemplateId: gabarit, dureeMinutes: 60,
    }).returning();
    await db.insert(schema.setLogs).values([1, 2, 3].map((numero) => ({
      sessionLogId: seance!.id, exerciseInstanceId: instances.dev!,
      numeroSerie: numero, repsEffectuees: 10, charge: 55, rpeEffectif: 8,
    })));
  });

  it("la suggestion vient de la double progression, sur les séries", async () => {
    const seance = await construireSeanceDuJour({
      userId: U, seanceTemplateId: gabarit, gymId: salle, date: "2026-08-27",
    });
    const item = seance.items.find((i) => i.exerciseInstanceId === instances.dev)!;
    // 10 répétitions sur 8-12 : on ne monte pas la charge, on demande une
    // répétition de plus. Aucune trace de la charge programmée à 60.
    expect(item.chargeSuggeree).toBe(55);
    expect(item.chargeCible).toBe(60);
  });

  it("le premier repère bascule sur l'historique, origine comprise", async () => {
    const seance = await construireSeanceDuJour({
      userId: U, seanceTemplateId: gabarit, gymId: salle, date: "2026-08-27",
    });
    const plan = await lirePlan(U, seance.seance.id);
    // `id` d'une ligne de plan EST l'instance retenue pour la séance.
    const enrichi = plan!.items.find((i) => i.id === instances.dev)!;

    expect(enrichi.premiereCharge.origine).toBe("historique_instance");
    expect(enrichi.premiereCharge.charge).toBe(55);
    expect(enrichi.historique[0]!.charge).toBe(55);
  });

  it("la charge programmée reste lisible comme intention, sans écraser la référence", async () => {
    const seance = await construireSeanceDuJour({
      userId: U, seanceTemplateId: gabarit, gymId: salle, date: "2026-08-27",
    });
    const plan = await lirePlan(U, seance.seance.id);
    const enrichi = plan!.items.find((i) => i.id === instances.dev)!;
    expect(enrichi.chargeCible).toBe(60);
    expect(enrichi.chargeSuggeree).toBe(55);
  });
});

/**
 * 3 — la séquence de double progression, sur une grille matérielle réelle.
 *
 * Les deux séquences demandées, pas une de plus : 8/8 → 9/8 → 9/9, et
 * 12/12 → cran supérieur + retour à 8/8. Le moteur est appelé avec la
 * configuration RÉELLE de la machine, comme le fait la construction du plan.
 */
describe("3 — la double progression ne bouge pas", () => {
  const cible = (seriesCibles: number) => ({
    seriesCibles,
    fourchetteRepsMin: 8,
    fourchetteRepsMax: 12,
    charge: {
      natureCharge: "resistance" as const,
      paliersCharges: null,
      incrementsPossibles: [2.5],
      chargeMinimale: 2.5,
      chargeMax: null,
    },
  });

  it("8/8 → 9/8 → 9/9 : une répétition de plus, puis l'autre série", () => {
    const premiere = computeNextSets({
      sets: [
        { numero: 1, reps: 8, charge: 60, rpe: 8 },
        { numero: 2, reps: 8, charge: 60, rpe: 8 },
      ],
    }, cible(2));
    expect(premiere.charge).toBe(60);
    expect(premiere.reps).toEqual([9, 8]);
    expect(premiere.messageProgression).toBeNull();

    // La séance suivante part de ce qui a réellement été fait.
    const seconde = computeNextSets({
      sets: [
        { numero: 1, reps: 9, charge: 60, rpe: 8 },
        { numero: 2, reps: 8, charge: 60, rpe: 8 },
      ],
    }, cible(2));
    expect(seconde.charge).toBe(60);
    expect(seconde.reps).toEqual([9, 9]);
    expect(seconde.messageProgression).toBeNull();
  });

  it("12/12 → cran supérieur, et retour en bas de fourchette", () => {
    const r = computeNextSets({
      sets: [
        { numero: 1, reps: 12, charge: 60, rpe: 8 },
        { numero: 2, reps: 12, charge: 60, rpe: 8 },
      ],
    }, cible(2));

    expect(r.charge).toBe(62.5);
    expect(r.reps).toEqual([8, 8]);
    expect(r.fourchetteCompletee).toBe(true);
    expect(r.motifProgression).toBe("montee");
  });

  it("la suite est celle de la grille matérielle, pas un pourcentage", () => {
    // Une fois à 62,5, le cran suivant est 65 : la progression passe par les
    // paliers réels de l'appareil, et la charge programmée n'y entre jamais.
    const avecPaliers = {
      ...cible(2),
      charge: {
        natureCharge: "resistance" as const,
        paliersCharges: [60, 62.5, 65],
        incrementsPossibles: [2.5],
        chargeMinimale: 60,
        chargeMax: null,
      },
    };
    const r = computeNextSets({
      sets: [
        { numero: 1, reps: 12, charge: 62.5, rpe: 8 },
        { numero: 2, reps: 12, charge: 62.5, rpe: 8 },
      ],
    }, avecPaliers);
    expect(r.charge).toBe(65);
    expect(r.reps).toEqual([8, 8]);
  });

  it("c'est la configuration de la machine retenue qui décide", async () => {
    const instance = await db.query.exerciseInstances.findFirst({
      where: eq(schema.exerciseInstances.id, instances.dev!),
    });
    expect(configurationDe(instance!).incrementsPossibles).toEqual([2.5]);
  });
});

describe("4 — config complète, ordre et propriété", () => {
  let d = "";
  let e = "";

  beforeAll(async () => {
    const premier = await ajouterExerciceAuTemplate({
      userId: U, seanceTemplateId: autreGabarit, exerciseInstanceId: instances.dev!,
      seriesCibles: 3, fourchetteRepsMin: 8, fourchetteRepsMax: 12,
    });
    d = premier.id;
    const second = await ajouterExerciceAuTemplate({
      userId: U, seanceTemplateId: autreGabarit, exerciseInstanceId: instances.tirage!,
      seriesCibles: 4, fourchetteRepsMin: 6, fourchetteRepsMax: 10,
    });
    e = second.id;
  });

  it("toute la config s'édite, champ par champ", async () => {
    const miseAJour = await modifierExerciceDuTemplate(U, d, {
      seriesCibles: 5,
      fourchetteRepsMin: 5,
      fourchetteRepsMax: 9,
      rpeCible: 8,
      tempo: "3-1-1",
      reposSecondes: 150,
      chargeCible: 45,
    });
    expect(miseAJour).toMatchObject({
      seriesCibles: 5, fourchetteRepsMin: 5, fourchetteRepsMax: 9,
      rpeCible: 8, tempo: "3-1-1", reposSecondes: 150, chargeCible: 45,
    });
  });

  it("un champ envoyé à `null` se retire, un champ absent ne bouge pas", async () => {
    const apres = await modifierExerciceDuTemplate(U, d, { rpeCible: null, tempo: null });
    expect(apres.rpeCible).toBeNull();
    expect(apres.tempo).toBeNull();
    expect(apres.chargeCible).toBe(45);
    expect(apres.reposSecondes).toBe(150);
  });

  it("la liste « à confirmer » ne retient que ce que personne n'a choisi", async () => {
    // Créé sans rien : les quatre champs viennent des défauts historiques, et
    // aucun n'est présenté comme une prescription.
    const jetable = await ajouterExerciceAuTemplate({
      userId: U, seanceTemplateId: gabarit, exerciseInstanceId: instances.tirage!,
    });
    expect(jetable.seriesCibles).toBe(3);
    expect(jetable.fourchetteRepsMin).toBe(8);
    expect(jetable.fourchetteRepsMax).toBe(12);
    expect(jetable.reposSecondes).toBeNull();
    expect(jetable.prescriptionParDefaut).toEqual([
      "seriesCibles", "fourchetteRepsMin", "fourchetteRepsMax", "reposSecondes",
    ]);
    // Et la charge n'a pas ete inventee.
    expect(jetable.chargeCible).toBeNull();

    const apres = await modifierExerciceDuTemplate(U, jetable.id, { seriesCibles: 4 });
    expect(apres.prescriptionParDefaut).toEqual([
      "fourchetteRepsMin", "fourchetteRepsMax", "reposSecondes",
    ]);

    await retirerExerciceDuTemplate(U, jetable.id);
  });

  it("refuse une fourchette inversée sans toucher à la ligne", async () => {
    await expect(modifierExerciceDuTemplate(U, e, { fourchetteRepsMin: 20 }))
      .rejects.toThrow(PrescriptionInvalide);
    const relue = await db.query.exerciseInTemplate.findFirst({
      where: eq(schema.exerciseInTemplate.id, e),
    });
    expect(relue?.fourchetteRepsMin).toBe(6);
    expect(relue?.fourchetteRepsMax).toBe(10);
  });

  it("l'ordre est une position, renumérotée sans trou ni doublon", async () => {
    await reordonnerExerciceDuTemplate(U, e, 1);
    const remontes = await programmees(autreGabarit);
    expect(remontes.map((l) => l.id)).toEqual([e, d]);
    expect(remontes.map((l) => l.ordre)).toEqual([1, 2]);

    await modifierExerciceDuTemplate(U, d, { ordre: 1 });
    const redescendus = await programmees(autreGabarit);
    expect(redescendus.map((l) => l.id)).toEqual([d, e]);
    expect(redescendus.map((l) => l.ordre)).toEqual([1, 2]);
  });

  it("une position hors bornes est ramenée dans la séance", async () => {
    await reordonnerExerciceDuTemplate(U, d, 99);
    expect((await programmees(autreGabarit)).map((l) => l.id)).toEqual([e, d]);
    await reordonnerExerciceDuTemplate(U, d, 0);
    expect((await programmees(autreGabarit)).map((l) => l.id)).toEqual([d, e]);
  });

  it("refuse un compte qui n'est pas propriétaire", async () => {
    const autre = randomUUID();
    await expect(modifierExerciceDuTemplate(autre, d, { seriesCibles: 9 }))
      .rejects.toThrow(RessourceIntrouvable);
    await expect(reordonnerExerciceDuTemplate(autre, d, 1))
      .rejects.toThrow(RessourceIntrouvable);
    await expect(modifierSeanceTemplate(autre, autreGabarit, { nom: "Volée" }))
      .rejects.toThrow();

    // Et rien n'a bougé.
    const relue = await db.query.exerciseInTemplate.findFirst({
      where: eq(schema.exerciseInTemplate.id, d),
    });
    expect(relue?.seriesCibles).toBe(5);
  });

  it("renomme une séance sans lui faire perdre son identité", async () => {
    const renommee = await modifierSeanceTemplate(U, autreGabarit, { nom: "Jambes lourdes" });
    expect(renommee.nom).toBe("Jambes lourdes");
    // Même id : l'historique et la rotation continuent de la reconnaître.
    expect(renommee.id).toBe(autreGabarit);
  });

  it("réordonne les séances de la rotation, sans doublon de rang", async () => {
    const bloc = (await db.query.seanceTemplates.findFirst({
      where: eq(schema.seanceTemplates.id, autreGabarit),
    }))!.blocId;

    await modifierSeanceTemplate(U, autreGabarit, { ordre: 1 });
    const seances = await db.query.seanceTemplates.findMany({
      where: eq(schema.seanceTemplates.blocId, bloc),
      orderBy: asc(schema.seanceTemplates.ordreDansSemaine),
    });
    expect(seances.map((s) => s.id)).toEqual([autreGabarit, gabarit]);
    expect(seances.map((s) => s.ordreDansSemaine)).toEqual([1, 2]);
  });
});
