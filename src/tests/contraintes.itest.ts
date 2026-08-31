import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Le cycle de vie d'une contrainte, contre une vraie base.
 *
 * L'invariant qui compte est au bout du fichier : une contrainte active
 * influence le planificateur, sa résolution rend le même exercice éligible, et
 * l'historique ne bouge pas. C'est exactement ce qu'aucune intervention SQL ne
 * devrait plus être nécessaire pour obtenir.
 */

const U = randomUUID();
const VOISIN = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({ getAuthenticatedUserId: async () => U }));
// L'onboarding n'utilise pas l'assistant : il appelle Supabase directement.
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: U, email: `${U}@t.test` } } }) },
  }),
}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { eq, and } = await import("drizzle-orm");
const {
  contraintesActives, contraintesAReevaluer, contraintesPourAffichage,
  creerContrainte, repondreAReevaluation, verdictSignalement, ContrainteIntrouvable,
} = await import("@/services/contraintes");
const { construireSeanceDuJour } = await import("@/services/plan-seance");
const { validerSeanceComplete } = await import("@/services/validation");
const { preparerPropositionContrainte, appliquerPropositionCoach } = await import(
  "@/services/propositions-coach"
).then((m) => ({
  preparerPropositionContrainte: m.preparerPropositionContrainte,
  appliquerPropositionCoach: m.appliquerProposition,
}));
const { createCoachTools } = await import("@/lib/coach/tools");
const { SEVERITE, decalerDe, REEVALUATION_JOURS } = await import("@/lib/engine/contraintes");

const AUJOURDHUI = new Date().toISOString().slice(0, 10);

let salle = "";
let gabarit = "";
const instances: Record<string, string> = {};

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

  // Deux exercices d'épaules : le prévu, et un remplaçant possible. Plus un
  // exercice de dos, qu'aucune contrainte ne concerne.
  for (const [cle, nom, pilier, muscle] of [
    ["militaire", "Développé militaire", "epaules", "epaules"],
    ["elevations", "Élévations latérales", "epaules", "epaules"],
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

  const [bloc] = await db.insert(schema.programmeBlocs).values({
    userId: U, nom: "Bloc", dateDebut: decalerDe(AUJOURDHUI, -14), typeCycle: "volume", actif: true,
  }).returning();
  const [t] = await db.insert(schema.seanceTemplates).values({
    blocId: bloc!.id, lettre: "A", nom: "Haut du corps", ordreDansSemaine: 1,
  }).returning();
  gabarit = t!.id;

  for (const [ordre, cle] of ["militaire", "tirage"].entries()) {
    await db.insert(schema.exerciseInTemplate).values({
      seanceTemplateId: gabarit, exerciseInstanceId: instances[cle]!,
      ordre: ordre + 1, seriesCibles: 3, fourchetteRepsMin: 8, fourchetteRepsMax: 12,
      reposSecondes: 120,
    });
  }
});

async function purger() {
  // Les propositions citent les contraintes : rien dans l'application ne les
  // supprime — elles sont datées — mais le nettoyage entre scénarios, si.
  await db.delete(schema.coachPropositions).where(eq(schema.coachPropositions.userId, U));
  await db.delete(schema.contraintes).where(eq(schema.contraintes.userId, U));
}

describe("une gêne signalée ne crée pas de contrainte toute seule", () => {
  it("une douleur légère et isolée ne donne qu'un incident", async () => {
    await purger();
    const verdict = await verdictSignalement(U, {
      muscle: "epaules", intensite: 4, dateISO: AUJOURDHUI,
    });
    expect(verdict.suite).toBe("incident_seul");
    expect(await contraintesActives(U)).toHaveLength(0);
  });

  it("une douleur forte appelle une proposition, sans rien écrire", async () => {
    const verdict = await verdictSignalement(U, {
      muscle: "epaules", intensite: 8, dateISO: AUJOURDHUI,
    });
    expect(verdict.suite).toBe("proposer_contrainte");
    // Le verdict ne crée rien : c'est une recommandation, pas une écriture.
    expect(await contraintesActives(U)).toHaveLength(0);
  });
});

describe("une contrainte active influence le moteur", () => {
  it("écarte ce que le moteur écartait déjà, et rien de plus", async () => {
    await purger();
    await creerContrainte({ userId: U, muscle: "epaules", severite: SEVERITE.ecartement });

    const validation = await validerSeanceComplete({
      userId: U, gymId: salle,
      exercices: [
        { exerciseInstanceId: instances.militaire!, series: 3, repsMin: 8, repsMax: 12, reposSecondes: 120 },
      ],
    });
    expect(validation.seance.anomalies.some((a) => a.code === "contrainte_ignoree")).toBe(true);

    // Le dos n'est pas concerné : une gêne à l'épaule n'exclut pas le haut du
    // corps entier.
    const surLeDos = await validerSeanceComplete({
      userId: U, gymId: salle,
      exercices: [
        { exerciseInstanceId: instances.tirage!, series: 3, repsMin: 8, repsMax: 12, reposSecondes: 120 },
      ],
    });
    expect(surLeDos.seance.anomalies.some((a) => a.code === "contrainte_ignoree")).toBe(false);
  });

  it("une contrainte légère ne bloque rien", async () => {
    await purger();
    await creerContrainte({ userId: U, muscle: "epaules", severite: SEVERITE.ecartement - 2 });
    const validation = await validerSeanceComplete({
      userId: U, gymId: salle,
      exercices: [
        { exerciseInstanceId: instances.militaire!, series: 3, repsMin: 8, repsMax: 12, reposSecondes: 120 },
      ],
    });
    expect(validation.seance.anomalies.some((a) => a.code === "contrainte_ignoree")).toBe(false);
  });
});

describe("la sortie", () => {
  it("porte une échéance de réévaluation à la création", async () => {
    await purger();
    const c = await creerContrainte({ userId: U, muscle: "epaules", severite: 8 });
    expect(c.aReevaluerLe).toBe(decalerDe(AUJOURDHUI, REEVALUATION_JOURS));
    expect(c.dateFin).toBeNull();
  });

  it("n'en porte pas quand la limitation est déclarée durable", async () => {
    await purger();
    const c = await creerContrainte({
      userId: U, muscle: "epaules", severite: 8, durable: true,
    });
    expect(c.aReevaluerLe).toBeNull();
    expect(await contraintesAReevaluer(U)).toHaveLength(0);
  });

  it("se présente à la réévaluation le jour venu", async () => {
    await purger();
    const c = await creerContrainte({ userId: U, muscle: "epaules", severite: 8 });
    expect(await contraintesAReevaluer(U)).toHaveLength(0);

    const jour = decalerDe(AUJOURDHUI, REEVALUATION_JOURS);
    const dues = await contraintesAReevaluer(U, jour);
    expect(dues.map((x) => x.id)).toContain(c.id);
  });

  it("« un peu mieux » baisse la sévérité sans lever", async () => {
    await purger();
    const c = await creerContrainte({ userId: U, muscle: "epaules", severite: 9 });
    const r = await repondreAReevaluation(U, c.id, "un_peu_mieux");
    expect(r.levee).toBe(false);
    expect(r.contrainte.severite).toBeLessThan(9);
    expect((await contraintesActives(U)).map((x) => x.id)).toContain(c.id);
  });

  it("se résout par anticipation, sans attendre l'échéance", async () => {
    await purger();
    const c = await creerContrainte({ userId: U, muscle: "epaules", severite: 8 });
    const r = await repondreAReevaluation(U, c.id, "resolu");
    expect(r.levee).toBe(true);
    expect(await contraintesActives(U)).toHaveLength(0);
  });

  it("laisse la contrainte résolue dans l'historique", async () => {
    const { actives, passees } = await contraintesPourAffichage(U);
    expect(actives).toHaveLength(0);
    expect(passees).toHaveLength(1);
    expect(passees[0]!.dateFin).toBe(AUJOURDHUI);
    expect(passees[0]!.libelle).toBeTruthy();
  });

  it("refuse de répondre deux fois sur une contrainte déjà levée", async () => {
    const { passees } = await contraintesPourAffichage(U);
    await expect(
      repondreAReevaluation(U, passees[0]!.id, "toujours"),
    ).rejects.toThrow(ContrainteIntrouvable);
  });
});

describe("aucun chemin n'échappe au cycle de vie", () => {
  it("une gêne déclarée à l'inscription porte une échéance et son origine", async () => {
    await purger();
    const { POST } = await import("@/app/api/onboarding/route");

    // L'onboarding insérait directement en base, sans échéance ni origine : la
    // gêne la plus susceptible de devenir périmée — saisie une fois, jamais
    // revue — était la seule à échapper au cycle de vie.
    const res = await POST(
      new Request("http://t/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectifType: "prise_de_muscle",
          niveauExperience: "intermediaire",
          contraintes: [{ muscle: "epaules", severite: 6, notes: "vieille gêne" }],
          frequenceCibleParSemaine: 3,
          frequenceMinParSemaine: 2,
          frequenceMaxParSemaine: 4,
          dureeSeanceCibleMinutes: 60,
          dureeSeanceMaxMinutes: 90,
          salleId: salle,
        }),
      }),
    );
    expect(res.status).toBeLessThan(400);

    const [creee] = await contraintesActives(U);
    expect(creee).toBeDefined();
    expect(creee!.muscle).toBe("epaules");
    // Elle sera reposée comme n'importe quelle autre.
    expect(creee!.aReevaluerLe).toBe(decalerDe(AUJOURDHUI, REEVALUATION_JOURS));

    const ligne = await db.query.contraintes.findFirst({
      where: eq(schema.contraintes.id, creee!.id),
    });
    expect(ligne!.origine).toBe("onboarding");

    const dues = await contraintesAReevaluer(U, decalerDe(AUJOURDHUI, REEVALUATION_JOURS));
    expect(dues.map((c) => c.id)).toContain(creee!.id);
  });
});

describe("les lignes anciennes", () => {
  it("restent actives et ne sont jamais relancées", async () => {
    await purger();
    // Ce que la migration laisse : pas d'échéance, pas de date de fin.
    const [ancienne] = await db.insert(schema.contraintes).values({
      userId: U, muscle: "epaules", type: "zone_sensible", severite: 8,
      dateDebut: "2026-01-15", origine: "onboarding",
    }).returning();

    expect((await contraintesActives(U)).map((c) => c.id)).toContain(ancienne!.id);
    // Échéance nulle : aucune question surgit sans que l'athlète l'ait demandée.
    expect(await contraintesAReevaluer(U)).toHaveLength(0);

    // Et elle reste levable à la main, ce qui n'existait pas.
    const r = await repondreAReevaluation(U, ancienne!.id, "resolu");
    expect(r.levee).toBe(true);
  });
});

describe("le périmètre de l'utilisateur", () => {
  it("ne laisse pas répondre sur la contrainte d'un autre", async () => {
    const c = await creerContrainte({ userId: VOISIN, muscle: "epaules", severite: 8 });
    await expect(repondreAReevaluation(U, c.id, "resolu")).rejects.toThrow(ContrainteIntrouvable);

    // Et elle est toujours active chez lui.
    expect((await contraintesActives(VOISIN)).map((x) => x.id)).toContain(c.id);
    await db.delete(schema.contraintes).where(eq(schema.contraintes.userId, VOISIN));
  });
});

describe("le coach propose, il n'écrit pas", () => {
  it("une proposition de contrainte ne crée rien", async () => {
    await purger();
    const outils = createCoachTools();
    const res = await outils.executors.propose_constraint!(
      { muscle: "épaules", severite: 8, notes: "gêne au développé" }, U,
    );
    expect(res.success).toBe(true);
    expect(await contraintesActives(U)).toHaveLength(0);

    const { propositionId, apercu } = JSON.parse(res.output) as {
      propositionId: string; apercu: string;
    };
    // L'aperçu dit ce que l'application fera, pas ce que le corps fera.
    expect(apercu).not.toMatch(/guéri|guérison|tendinite/i);
    expect(apercu).toMatch(/est-ce toujours le cas/i);

    // Et la confirmation, elle, crée.
    await appliquerPropositionCoach(U, propositionId);
    const actives = await contraintesActives(U);
    expect(actives).toHaveLength(1);
    expect(actives[0]!.muscle).toBe("epaules");
    expect(actives[0]!.aReevaluerLe).not.toBeNull();
  });

  it("refuse d'en proposer une seconde sur la même zone", async () => {
    const outils = createCoachTools();
    const res = await outils.executors.propose_constraint!({ muscle: "epaules", severite: 9 }, U);
    expect(res.success).toBe(false);
    expect(res.output).toMatch(/déjà active/);
  });

  it("propose la sortie, et la confirmation résout", async () => {
    const outils = createCoachTools();
    const active = (await contraintesActives(U))[0]!;

    const res = await outils.executors.propose_constraint_resolution!(
      { contrainteId: active.id }, U,
    );
    expect(res.success).toBe(true);
    // Toujours active tant que rien n'est confirmé.
    expect(await contraintesActives(U)).toHaveLength(1);

    const { propositionId } = JSON.parse(res.output) as { propositionId: string };
    await appliquerPropositionCoach(U, propositionId);

    expect(await contraintesActives(U)).toHaveLength(0);
    const { passees } = await contraintesPourAffichage(U);
    expect(passees.some((c) => c.id === active.id)).toBe(true);
  });

  it("ne laisse pas le coach lever la contrainte d'un autre", async () => {
    const sienne = await creerContrainte({ userId: VOISIN, muscle: "lombaires", severite: 8 });
    await expect(
      preparerPropositionContrainte({
        userId: U, operation: { type: "resoudre_contrainte", contrainteId: sienne.id },
      }),
    ).rejects.toThrow(/pas active|n'existe pas/);
    await db.delete(schema.contraintes).where(eq(schema.contraintes.userId, VOISIN));
  });
});

describe("la disponibilité d'une machine ne contourne pas une exclusion", () => {
  /**
   * Le défaut corrigé : `resoudrePourSalle` renvoyait « identique » dès que
   * l'exercice prévu existait dans la salle du jour, avant de regarder les
   * muscles. Une contrainte sévère était donc sans effet sur la séance
   * réellement construite — seulement sur le choix d'un remplaçant.
   */
  it("retire de la séance construite l'exercice dont la zone est sous contrainte", async () => {
    await purger();
    const demain = decalerDe(AUJOURDHUI, 1);

    const avant = await construireSeanceDuJour({
      userId: U, seanceTemplateId: gabarit, gymId: salle, date: demain,
    });
    expect(avant.items.map((i) => i.exerciseInstanceId)).toContain(instances.militaire);

    await creerContrainte({ userId: U, muscle: "epaules", severite: SEVERITE.ecartement });

    const pendant = await construireSeanceDuJour({
      userId: U, seanceTemplateId: gabarit, gymId: salle, date: decalerDe(AUJOURDHUI, 2),
    });
    // La machine est pourtant bien là : c'est la contrainte qui décide.
    expect(pendant.items.map((i) => i.exerciseInstanceId)).not.toContain(instances.militaire);
    // Le dos, lui, reste programmé : une gêne à l'épaule n'efface pas la séance.
    expect(pendant.items.map((i) => i.exerciseInstanceId)).toContain(instances.tirage);
    // Et l'athlète sait pourquoi.
    expect(pendant.ecartes.map((e) => e.raison).join(" ")).toMatch(/zone que tu ménages/);
  });

  it("le laisse revenir dès la contrainte levée", async () => {
    const active = (await contraintesActives(U))[0]!;
    await repondreAReevaluation(U, active.id, "resolu");

    const apres = await construireSeanceDuJour({
      userId: U, seanceTemplateId: gabarit, gymId: salle, date: decalerDe(AUJOURDHUI, 3),
    });
    expect(apres.items.map((i) => i.exerciseInstanceId)).toContain(instances.militaire);
    expect(apres.ecartes).toHaveLength(0);
  });

  it("ne retire rien pour une gêne sous le seuil", async () => {
    await purger();
    await creerContrainte({
      userId: U, muscle: "epaules", severite: SEVERITE.ecartement - 1,
    });
    const plan = await construireSeanceDuJour({
      userId: U, seanceTemplateId: gabarit, gymId: salle, date: decalerDe(AUJOURDHUI, 4),
    });
    expect(plan.items.map((i) => i.exerciseInstanceId)).toContain(instances.militaire);
  });

  it("ne retire rien pour une gêne sur une autre zone", async () => {
    await purger();
    await creerContrainte({ userId: U, muscle: "ischios", severite: 10 });
    const plan = await construireSeanceDuJour({
      userId: U, seanceTemplateId: gabarit, gymId: salle, date: decalerDe(AUJOURDHUI, 5),
    });
    expect(plan.items.map((i) => i.exerciseInstanceId)).toContain(instances.militaire);
  });

  it("ne laisse pas la contrainte d'un voisin toucher ma séance", async () => {
    await purger();
    const sienne = await creerContrainte({ userId: VOISIN, muscle: "epaules", severite: 10 });
    const plan = await construireSeanceDuJour({
      userId: U, seanceTemplateId: gabarit, gymId: salle, date: decalerDe(AUJOURDHUI, 6),
    });
    expect(plan.items.map((i) => i.exerciseInstanceId)).toContain(instances.militaire);
    await db.delete(schema.contraintes).where(eq(schema.contraintes.id, sienne.id));
  });
});

describe("l'invariant : une gêne entre, influence, puis sort", () => {
  it("le même exercice redevient éligible une fois la contrainte levée", async () => {
    await purger();
    const demain = decalerDe(AUJOURDHUI, 1);

    // 1. Sans contrainte, la séance se construit avec le développé militaire.
    const avant = await construireSeanceDuJour({
      userId: U, seanceTemplateId: gabarit, gymId: salle, date: demain,
    });
    expect(avant.items.map((i) => i.exerciseInstanceId)).toContain(instances.militaire);

    // 2. Une contrainte sévère entre : le moteur signale la séance.
    const c = await creerContrainte({ userId: U, muscle: "epaules", severite: SEVERITE.ecartement });
    const pendant = await validerSeanceComplete({
      userId: U, gymId: salle,
      exercices: [
        { exerciseInstanceId: instances.militaire!, series: 3, repsMin: 8, repsMax: 12, reposSecondes: 120 },
      ],
    });
    expect(pendant.seance.anomalies.some((a) => a.code === "contrainte_ignoree")).toBe(true);

    // 3. L'athlète dit que ça va mieux.
    await repondreAReevaluation(U, c.id, "resolu");

    // 4. Le même exercice repasse, sans qu'on ait touché à la base.
    const apres = await validerSeanceComplete({
      userId: U, gymId: salle,
      exercices: [
        { exerciseInstanceId: instances.militaire!, series: 3, repsMin: 8, repsMax: 12, reposSecondes: 120 },
      ],
    });
    expect(apres.seance.anomalies.some((a) => a.code === "contrainte_ignoree")).toBe(false);

    const replanifiee = await construireSeanceDuJour({
      userId: U, seanceTemplateId: gabarit, gymId: salle, date: decalerDe(AUJOURDHUI, 2),
    });
    expect(replanifiee.items.map((i) => i.exerciseInstanceId)).toContain(instances.militaire);

    // 5. Et la trace demeure : l'épisode a existé.
    const { passees } = await contraintesPourAffichage(U);
    expect(passees.some((p) => p.id === c.id && p.dateFin === AUJOURDHUI)).toBe(true);
  });
});
