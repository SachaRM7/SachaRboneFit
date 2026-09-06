import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * De la douleur signalée à l'exercice de nouveau proposable — par les routes.
 *
 * La chaîne existait en morceaux qui ne se touchaient pas. `verdictSignalement`
 * savait dire qu'une gêne mérite plus qu'un incident ; `creerContrainte` savait
 * écrire l'état ; le moteur savait respecter la contrainte ; l'écran
 * « Ce que tu ménages » savait la lever. Aucune ligne de code ne reliait les
 * deux premiers au reste — l'audit les a trouvés sans AUCUN appelant applicatif.
 *
 * Et sous ce trou, un second : l'écran écrivait `zones` + `niveau`, la règle
 * lisait `muscle` + `intensite`. La liste des signalements antérieurs était
 * toujours vide.
 *
 * Ce fichier ne teste rien par le service seul. Tout passe par les routes HTTP,
 * dans l'ordre du parcours réel — c'est la seule preuve qui vaille pour ce lot.
 */

const SACHA = randomUUID();
const MARIA = randomUUID();
let courant: string = SACHA;

vi.mock("@/lib/supabase/auth-helper", () => ({
  getAuthenticatedUserId: async () => courant,
  requireAuthenticatedUserId: async () => ({ userId: courant, error: null }),
}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { eq, inArray } = await import("drizzle-orm");
const { contraintesActives } = await import("@/services/contraintes");
const { validerSeanceComplete } = await import("@/services/validation");
const { SEVERITE } = await import("@/lib/engine/contraintes");
const douleur = await import("@/app/api/douleur/route");
const proteger = await import("@/app/api/douleur/proteger/route");
const contraintesRoute = await import("@/app/api/contraintes/route");
const reevaluation = await import("@/app/api/contraintes/[id]/route");

let salle = "";
let developpe = "";
let instanceDeveloppe = "";
let seanceDeSacha = "";
let seanceDeMaria = "";

const enTantQue = async <T>(qui: string, action: () => Promise<T>): Promise<T> => {
  const avant = courant;
  courant = qui;
  try {
    return await action();
  } finally {
    courant = avant;
  }
};

const poste = (corps: unknown) =>
  new Request("http://test/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corps),
  });

/** Signaler une gêne exactement comme le fait `SOSDouleur`. */
const signaler = (corps: Record<string, unknown>) =>
  douleur.POST(poste({
    session_log_id: seanceDeSacha,
    niveau: 5,
    type_douleur: "sourde",
    arret_conseille: false,
    a_retirer: [],
    a_alleger: [],
    decision: "Adapté",
    ...corps,
  }));

const incidentsDe = (sessionLogId: string) =>
  db.query.sessionIncidents.findMany({
    where: eq(schema.sessionIncidents.sessionLogId, sessionLogId),
  });

const purger = async (qui: string) => {
  await db.delete(schema.contraintes).where(eq(schema.contraintes.userId, qui));
};

/** Une séance datée, pour que la fenêtre de répétition soit vérifiable. */
async function seancePour(userId: string, date: string): Promise<string> {
  const [s] = await db.insert(schema.sessionLogs).values({ userId, gymId: salle, date }).returning();
  return s!.id;
}

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBeTruthy();

  for (const [id, nom] of [[SACHA, "Sacha"], [MARIA, "Maria"]] as const) {
    await db.insert(schema.users).values({ id, email: `${id}@t.test`, nom });
  }

  const [g] = await db.insert(schema.gyms).values({
    userId: SACHA, nom: `St-Martin ${SACHA.slice(0, 8)}`, equipementsDisponibles: ["machine"],
  }).returning();
  salle = g!.id;

  const [ex] = await db.insert(schema.exercises).values({
    userId: null, nom: "Développé épaules", pilier: "P1_poussee", profilTension: "mi_range",
    type: "polyarticulaire", categorieRole: "pilier",
    musclesPrincipaux: ["epaules"], musclesSecondaires: ["triceps"],
    equipement: "machine", slug: `de-${SACHA.slice(0, 8)}`,
  }).returning();
  developpe = ex!.id;

  const [inst] = await db.insert(schema.exerciseInstances).values({
    userId: SACHA, exerciseId: developpe, gymId: salle,
    machineNom: `Développé ${SACHA.slice(0, 6)}`,
    conventionCharge: "pile_affichee", incrementsPossibles: [5],
  }).returning();
  instanceDeveloppe = inst!.id;

  seanceDeSacha = await seancePour(SACHA, "2026-09-06");
  seanceDeMaria = await seancePour(MARIA, "2026-09-06");
});

// ---------------------------------------------------------------------------

describe("le signalement consigne un contexte canonique", () => {
  it("une gêne se signale par région, côté et face", async () => {
    await purger(SACHA);
    const res = await signaler({
      regions: ["face:epaule:gauche"],
      niveau: 4,
      moment: "concentrique",
    });
    expect(res.status).toBe(201);

    const [incident] = await incidentsDe(seanceDeSacha);
    const ctx = incident!.contexte as Record<string, unknown>;

    // Les deux vocabulaires, dans la même ligne : celui que la règle lit et
    // celui que l'historique porte.
    expect(ctx.intensite).toBe(4);
    expect(ctx.niveau).toBe(4);
    expect(ctx.zones).toEqual(["Épaule"]);
    expect(ctx.muscles).toContain("epaules");
    expect(ctx.moment).toBe("concentrique");
    expect(ctx.regions).toMatchObject([{ face: "face", cote: "gauche", zone: "Épaule" }]);
  });

  it("le côté et la face n'introduisent aucun muscle nouveau", async () => {
    const [incident] = await incidentsDe(seanceDeSacha);
    const ctx = incident!.contexte as { muscles: string[] };
    // Exactement ce que `musclesDeLaZone("Épaule")` donnait déjà.
    expect(ctx.muscles.sort()).toEqual(["deltoide_posterieur", "epaules"]);
  });

  it("le serveur ignore une région inventée plutôt que de la croire", async () => {
    const res = await signaler({ regions: ["face:cerveau:gauche"], niveau: 5 });
    expect(res.status).toBe(201);
    const incidents = await incidentsDe(seanceDeSacha);
    const dernier = incidents[incidents.length - 1]!.contexte as { zones: string[] };
    expect(dernier.zones).toEqual([]);
  });

  it("une séance qui n'est pas la sienne est refusée", async () => {
    const res = await enTantQue(MARIA, () =>
      signaler({ regions: ["face:epaule:gauche"], niveau: 5 }));
    expect(res.status).toBe(403);
  });
});

describe("une gêne légère et isolée reste un incident", () => {
  it("elle ne propose rien", async () => {
    await purger(SACHA);
    await db.delete(schema.sessionIncidents)
      .where(eq(schema.sessionIncidents.sessionLogId, seanceDeSacha));

    const res = await signaler({ regions: ["dos:mollets:droite"], niveau: 3 });
    expect(res.status).toBe(201);
    expect((await res.json()).propositions).toEqual([]);
  });

  it("et surtout, elle ne crée rien", async () => {
    expect(await contraintesActives(SACHA)).toHaveLength(0);
  });

  it("mais elle est bien consignée — c'est elle qui fera la deuxième", async () => {
    const incidents = await incidentsDe(seanceDeSacha);
    expect(incidents.length).toBeGreaterThan(0);
  });
});

describe("une douleur forte appelle une proposition, et rien de plus", () => {
  it("la règle propose", async () => {
    await purger(SACHA);
    const res = await signaler({ regions: ["face:epaule:droite"], niveau: 8 });
    const { propositions } = await res.json();

    expect(propositions).toHaveLength(1);
    expect(propositions[0]).toMatchObject({ zone: "Épaule", severite: 8 });
    // Le prix du « Oui » est annoncé : une zone, deux muscles nommés.
    expect(propositions[0].libelleMuscles).toMatch(/Épaules/);
    expect(propositions[0].effets.length).toBeGreaterThan(0);
  });

  it("AUCUNE contrainte n'existe à ce stade", async () => {
    // L'invariant central du lot : la proposition ne crée rien. Le signalement
    // et la protection sont deux routes, et seule la seconde écrit.
    expect(await contraintesActives(SACHA)).toHaveLength(0);
  });

  it("refuser ne crée rien non plus — refuser, c'est ne rien appeler", async () => {
    // « Pas maintenant » ferme la feuille sans second appel. Il n'existe aucune
    // requête « je refuse » : ne pas confirmer suffit.
    expect(await contraintesActives(SACHA)).toHaveLength(0);
  });
});

describe("confirmer crée la contrainte, et elle boucle", () => {
  it("le « Oui » écrit une contrainte par muscle de la zone", async () => {
    await purger(SACHA);
    const signalement = await signaler({ regions: ["face:epaule:droite"], niveau: 8 });
    const { propositions } = await signalement.json();

    const res = await proteger.POST(poste({
      zones: propositions.map((p: { zone: string; severite: number }) =>
        ({ zone: p.zone, severite: p.severite })),
    }));
    expect(res.status).toBe(201);

    const actives = await contraintesActives(SACHA);
    expect(actives.map((c) => c.muscle).sort()).toEqual(["deltoide_posterieur", "epaules"]);
    for (const c of actives) {
      expect(c.severite).toBe(8);
      expect(c.type).toBe("douleur");
      // Jamais durable : une gêne de séance doit être reposée en question.
      expect(c.aReevaluerLe).not.toBeNull();
    }
  });

  it("l'origine est l'athlète, et le compte vient du serveur", async () => {
    const lignes = await db.query.contraintes.findMany({
      where: eq(schema.contraintes.userId, SACHA),
    });
    expect(lignes.every((c) => c.origine === "athlete")).toBe(true);
    expect(lignes.every((c) => c.userId === SACHA)).toBe(true);
  });

  it("un chemin de planification l'utilise réellement", async () => {
    /*
     * La preuve que la boucle se referme sur le MOTEUR, pas seulement sur la
     * table. À 8/10 on dépasse le seuil d'écartement, donc le validateur lève
     * `contrainte_ignoree` sur l'exercice qui sollicite l'épaule.
     *
     * L'anomalie est cherchée par son CODE, et non par le mot « epaules »
     * quelque part dans la réponse : ce mot apparaît aussi dans la
     * comptabilité de volume, qui n'a rien à voir avec la contrainte, et une
     * recherche textuelle passerait donc au vert sans rien prouver.
     */
    const validation = await validerSeanceComplete({
      userId: SACHA, gymId: salle,
      exercices: [{
        exerciseInstanceId: instanceDeveloppe,
        series: 3, repsMin: 8, repsMax: 12, reposSecondes: 120,
      }],
    });
    expect(validation.seance.anomalies.map((a) => a.code)).toContain("contrainte_ignoree");
    expect(validation.seance.valide).toBe(false);
  });

  it("une zone inconnue est refusée plutôt que traduite au hasard", async () => {
    const res = await proteger.POST(poste({ zones: [{ zone: "Oreille", severite: 8 }] }));
    expect(res.status).toBe(422);
  });

  it("une zone déjà couverte n'est plus proposée", async () => {
    const res = await signaler({ regions: ["dos:epaule:gauche"], niveau: 9 });
    expect((await res.json()).propositions).toEqual([]);
  });
});

describe("puis la réévaluation existante la lève", () => {
  it("l'écran « Ce que tu ménages » la voit", async () => {
    const res = await contraintesRoute.GET();
    const { actives } = await res.json();
    expect(actives.length).toBeGreaterThan(0);
    expect(actives[0].effets.length).toBeGreaterThan(0);
  });

  it("« ça va mieux » la termine, et l'exercice redevient éligible", async () => {
    const actives = await contraintesActives(SACHA);
    for (const c of actives) {
      const res = await reevaluation.POST(poste({ reponse: "resolu" }), {
        params: Promise.resolve({ id: c.id }),
      });
      expect(res.status).toBe(200);
      expect((await res.json()).levee).toBe(true);
    }

    expect(await contraintesActives(SACHA)).toHaveLength(0);

    const validation = await validerSeanceComplete({
      userId: SACHA, gymId: salle,
      exercices: [{
        exerciseInstanceId: instanceDeveloppe,
        series: 3, repsMin: 8, repsMax: 12, reposSecondes: 120,
      }],
    });
    // L'anomalie a disparu : la levée a réellement libéré l'exercice, elle n'a
    // pas seulement daté une ligne.
    expect(validation.seance.anomalies.map((a) => a.code)).not.toContain("contrainte_ignoree");
    expect(validation.seance.valide).toBe(true);
  });
});

describe("compatibilité historique : un ancien incident compte encore", () => {
  it("un incident au FORMAT D'AVANT participe à la récurrence", async () => {
    await purger(SACHA);
    await db.delete(schema.sessionIncidents)
      .where(eq(schema.sessionIncidents.sessionLogId, seanceDeSacha));

    // Écrit à la main, exactement comme l'ancien écran l'écrivait : ni
    // `muscle`, ni `intensite`, ni `v`. C'est ce que la base contient.
    const seanceAncienne = await seancePour(SACHA, "2026-08-28");
    await db.insert(schema.sessionIncidents).values({
      sessionLogId: seanceAncienne,
      type: "douleur",
      contexte: { zones: ["Genou"], niveau: 5, type_douleur: "sourde" },
      decision: "Adapté",
    });

    // Une SECONDE gêne, modérée : isolée elle ne proposerait rien.
    const res = await signaler({ regions: ["face:genou:droite"], niveau: 5 });
    const { propositions } = await res.json();

    expect(propositions).toHaveLength(1);
    expect(propositions[0].zone).toBe("Genou");
    expect(propositions[0].motif).toMatch(/signalements/);
  });

  it("et sans cet antécédent, la même gêne ne proposerait rien", async () => {
    // Le contrôle négatif du test précédent, sur la même intensité.
    await purger(SACHA);
    // Toutes les séances de Sacha, pas seulement celle du jour : c'est
    // l'antécédent du 28 août qu'il faut retirer pour que le contrôle porte.
    const siennes = await db.query.sessionLogs.findMany({
      where: eq(schema.sessionLogs.userId, SACHA),
      columns: { id: true },
    });
    await db.delete(schema.sessionIncidents).where(
      inArray(schema.sessionIncidents.sessionLogId, siennes.map((s) => s.id)),
    );

    const res = await signaler({ regions: ["dos:mollets:droite"], niveau: 5 });
    expect((await res.json()).propositions).toEqual([]);
  });

  it("le signalement du jour ne compte pas pour deux", async () => {
    // Le piège de l'ordre : écrire l'incident AVANT d'évaluer ferait relire la
    // gêne du jour parmi les antérieures, et une première gêne à 5/10
    // déclencherait une récurrence qui n'a pas eu lieu.
    const incidents = await incidentsDe(seanceDeSacha);
    expect(incidents.length).toBeGreaterThan(0);
    expect(await contraintesActives(SACHA)).toHaveLength(0);
  });
});

describe("deux comptes ne se voient jamais", () => {
  it("les incidents de Maria n'entrent pas dans la récurrence de Sacha", async () => {
    await purger(SACHA);
    await purger(MARIA);

    // Maria signale deux fois le même genou : de quoi proposer, chez elle.
    const ancienneDeMaria = await seancePour(MARIA, "2026-08-30");
    await db.insert(schema.sessionIncidents).values({
      sessionLogId: ancienneDeMaria,
      type: "douleur",
      contexte: { zones: ["Cheville"], niveau: 6 },
      decision: "Adapté",
    });

    // Sacha signale la même zone, pour la première fois.
    await db.delete(schema.sessionIncidents)
      .where(eq(schema.sessionIncidents.sessionLogId, seanceDeSacha));
    const res = await signaler({ regions: ["face:cheville:droite"], niveau: 6 });
    expect((await res.json()).propositions).toEqual([]);
  });

  it("mais chez Maria, la récurrence est bien vue", async () => {
    const res = await enTantQue(MARIA, () =>
      douleur.POST(poste({
        session_log_id: seanceDeMaria,
        regions: ["face:cheville:droite"],
        niveau: 6,
        type_douleur: "sourde",
        arret_conseille: false,
        decision: "Adapté",
      })));
    const { propositions } = await res.json();
    expect(propositions).toHaveLength(1);
    expect(propositions[0].zone).toBe("Cheville");
  });

  it("et une protection ne s'écrit que sur le compte qui l'a demandée", async () => {
    await enTantQue(MARIA, async () => {
      const res = await proteger.POST(poste({
        zones: [{ zone: "Cheville", severite: SEVERITE.ecartement }],
      }));
      expect(res.status).toBe(201);
    });

    expect((await contraintesActives(MARIA)).map((c) => c.muscle)).toEqual(["mollets"]);
    expect(await contraintesActives(SACHA)).toHaveLength(0);
  });
});

describe("les comportements protecteurs ne sont pas affaiblis", () => {
  it("une douleur aiguë reste un arrêt conseillé, quelle que soit l'intensité", async () => {
    const { evaluerDouleur } = await import("@/lib/sos/douleur");
    const bilan = evaluerDouleur(["Épaule"], 2, "aiguë", []);
    expect(bilan.arretConseille).toBe(true);
  });

  it("une irradiation aussi", async () => {
    const { evaluerDouleur } = await import("@/lib/sos/douleur");
    expect(evaluerDouleur(["Épaule"], 1, "irradiation", []).arretConseille).toBe(true);
  });

  it("l'adaptation immédiate distingue toujours cible et secondaire", async () => {
    const { evaluerDouleur } = await import("@/lib/sos/douleur");
    const bilan = evaluerDouleur(["Épaule"], 5, "sourde", [
      {
        exercise_instance_id: instanceDeveloppe, nom: "Développé épaules",
        muscles_principaux: ["epaules"], muscles_secondaires: ["triceps"],
        categorie_role: "pilier", statut: "à_venir",
      },
      {
        exercise_instance_id: randomUUID(), nom: "Leg Press",
        muscles_principaux: ["quadriceps"], muscles_secondaires: [],
        categorie_role: "pilier", statut: "à_venir",
      },
    ]);
    expect(bilan.exercices[0]!.implication).toBe("cible");
    expect(bilan.exercices[1]!.implication).toBe("non_concerne");
    // Une gêne à l'épaule ne bannit pas les jambes.
    expect(bilan.exercices[1]!.proposition).toBe("poursuivre");
  });
});
