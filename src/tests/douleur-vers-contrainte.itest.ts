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
const { contraintesActives, creerContrainte } = await import("@/services/contraintes");
const { propositionsEnAttente } = await import("@/services/douleur");
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
let incidentDeMaria = "";

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
  it("le « Oui » écrit une contrainte par muscle PROPOSÉ", async () => {
    await purger(SACHA);
    const signalement = await signaler({ regions: ["face:epaule:droite"], niveau: 8 });
    const { incidentId, propositions } = await signalement.json();

    expect(propositions).toHaveLength(1);
    expect(propositions[0].muscles.sort()).toEqual(["deltoide_posterieur", "epaules"]);

    // Le corps ne porte QUE l'incident et le verbe : ni zone, ni muscle, ni
    // sévérité. C'est le cliché serveur qui décide de ce qui est créé.
    const res = await proteger.POST(poste({ incident_id: incidentId, decision: "appliquer" }));
    expect(res.status).toBe(200);

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

  it("un incident inventé est refusé", async () => {
    const res = await proteger.POST(poste({
      incident_id: randomUUID(), decision: "appliquer",
    }));
    expect(res.status).toBe(404);
  });

  it("un corps qui prétend désigner une zone ou une sévérité est rejeté", async () => {
    // L'ancien contrat, exactement : il n'existe plus, et il ne doit pas
    // repasser en douce parce que le schéma serait devenu permissif.
    const res = await proteger.POST(poste({ zones: [{ zone: "Oreille", severite: 8 }] }));
    expect(res.status).toBe(400);
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
    const corps = await res.json();
    expect(corps.propositions).toHaveLength(1);
    expect(corps.propositions[0].zone).toBe("Cheville");
    incidentDeMaria = corps.incidentId;
  });

  it("et une protection ne s'écrit que sur le compte qui l'a demandée", async () => {
    await enTantQue(MARIA, async () => {
      const res = await proteger.POST(poste({
        incident_id: incidentDeMaria, decision: "appliquer",
      }));
      expect(res.status).toBe(200);
    });

    expect((await contraintesActives(MARIA)).map((c) => c.muscle)).toEqual(["mollets"]);
    expect(await contraintesActives(SACHA)).toHaveLength(0);
  });

  it("et Sacha ne peut pas trancher l'incident de Maria", async () => {
    // La jointure sur `session_logs.user_id` EST le contrôle d'accès : un
    // incident ne porte pas de compte, c'est sa séance qui en porte un.
    const res = await proteger.POST(poste({
      incident_id: incidentDeMaria, decision: "appliquer",
    }));
    expect(res.status).toBe(404);
  });
});

describe("le sous-ensemble décidé par la règle fait autorité jusqu'au bout", () => {
  /*
   * LE DÉFAUT EXACT QUE CE BLOC COUVRE.
   *
   * « Épaule » vaut `epaules` + `deltoide_posterieur`. Quand l'un des deux est
   * DÉJÀ couvert par une contrainte active, `verdictSignalement` répond
   * « deja_couvert » pour lui, et la proposition ne retient que l'autre.
   *
   * La confirmation, elle, recalculait `musclesDeLaZone(zone)` à partir du nom
   * de zone envoyé par le client — et recréait donc une contrainte sur les
   * DEUX. Surprotection, et doublon sur le muscle déjà couvert.
   *
   * Le cliché persisté avec l'incident est désormais la seule autorité.
   */

  const musclesDeSacha = () =>
    db.query.contraintes.findMany({ where: eq(schema.contraintes.userId, SACHA) });

  let incidentPartiel = "";

  it("un seul muscle de la zone est proposé quand l'autre est déjà couvert", async () => {
    await purger(SACHA);
    await db.delete(schema.sessionIncidents).where(
      inArray(
        schema.sessionIncidents.sessionLogId,
        (await db.query.sessionLogs.findMany({
          where: eq(schema.sessionLogs.userId, SACHA), columns: { id: true },
        })).map((x) => x.id),
      ),
    );

    // `deltoide_posterieur` est couvert ; `epaules` ne l'est pas.
    await creerContrainte({
      userId: SACHA, muscle: "deltoide_posterieur", severite: SEVERITE.ecartement,
    });

    const res = await signaler({ regions: ["face:epaule:droite"], niveau: 8 });
    const { incidentId, propositions } = await res.json();
    incidentPartiel = incidentId;

    expect(propositions).toHaveLength(1);
    expect(propositions[0].zone).toBe("Épaule");
    // Le point : UN seul muscle, pas les deux de la zone.
    expect(propositions[0].muscles).toEqual(["epaules"]);
    expect(propositions[0].libelleMuscles).not.toMatch(/Arrière/);
  });

  it("le cliché persisté porte le même sous-ensemble, pas la zone entière", async () => {
    const [ligne] = await db.query.sessionIncidents.findMany({
      where: eq(schema.sessionIncidents.id, incidentPartiel),
    });
    const ctx = ligne!.contexte as { propositions: { muscles: string[] }[] };
    expect(ctx.propositions).toHaveLength(1);
    expect(ctx.propositions[0]!.muscles).toEqual(["epaules"]);
  });

  it("le « Oui » ne crée QUE ce muscle-là", async () => {
    const res = await proteger.POST(poste({
      incident_id: incidentPartiel, decision: "appliquer",
    }));
    expect(res.status).toBe(200);
    expect((await res.json()).muscles).toEqual(["epaules"]);
  });

  it("et le muscle déjà couvert n'a pas reçu de doublon", async () => {
    const lignes = await musclesDeSacha();
    const parMuscle = lignes.filter((c) => c.muscle === "deltoide_posterieur");
    expect(parMuscle, "une seconde contrainte est née sur un muscle déjà couvert")
      .toHaveLength(1);
    expect(lignes).toHaveLength(2);
  });

  it("un renvoi du même « Oui » ne crée pas une deuxième contrainte", async () => {
    const avant = (await musclesDeSacha()).length;

    const res = await proteger.POST(poste({
      incident_id: incidentPartiel, decision: "appliquer",
    }));
    expect(res.status).toBe(200);
    const corps = await res.json();
    expect(corps.dejaTranchee).toBe(true);
    expect(corps.muscles).toEqual([]);

    expect(await musclesDeSacha()).toHaveLength(avant);
  });

  it("un client ne peut inventer ni zone, ni muscle, ni sévérité", async () => {
    /*
     * Le corps ne porte que l'incident et le verbe. Tout le reste est ignoré
     * par le schéma — et ce qui est créé vient du cliché serveur, pas d'ici.
     */
    await purger(SACHA);
    const signalement = await signaler({ regions: ["dos:mollets:droite"], niveau: 8 });
    const { incidentId } = await signalement.json();

    const res = await proteger.POST(poste({
      incident_id: incidentId,
      decision: "appliquer",
      // Tentatives : une autre zone, une autre sévérité, d'autres muscles.
      zones: [{ zone: "Quadriceps", severite: 10 }],
      muscles: ["quadriceps", "ischios", "fessiers"],
      severite: 10,
    }));
    expect(res.status).toBe(200);

    const lignes = await musclesDeSacha();
    // Uniquement ce que la règle avait décidé pour « Mollets ».
    expect(lignes.map((c) => c.muscle)).toEqual(["mollets"]);
    expect(lignes[0]!.severite).toBe(8);
  });

  it("« Pas maintenant » n'écrit rien, et ne se repose plus", async () => {
    await purger(SACHA);
    const signalement = await signaler({ regions: ["face:quadriceps:droite"], niveau: 8 });
    const { incidentId } = await signalement.json();

    const res = await proteger.POST(poste({ incident_id: incidentId, decision: "refuser" }));
    expect(res.status).toBe(200);
    expect((await res.json()).decision).toBe("refusee");
    expect(await contraintesActives(SACHA)).toHaveLength(0);

    const enAttente = await propositionsEnAttente(SACHA);
    expect(enAttente.map((a) => a.incidentId)).not.toContain(incidentId);
  });
});

describe("une proposition survit à l'arrêt de séance", () => {
  /*
   * `onStopSeance` navigue : la feuille est démontée, l'écran de protection ne
   * peut pas lui survivre. Il n'est pas question de retarder l'arrêt pour le
   * sauver — donc la proposition doit se retrouver ailleurs, sur un écran
   * durable.
   */
  let incidentApresArret = "";

  it("un signalement avec arrêt conseillé persiste quand même sa proposition", async () => {
    await purger(SACHA);
    await db.delete(schema.sessionIncidents).where(
      inArray(
        schema.sessionIncidents.sessionLogId,
        (await db.query.sessionLogs.findMany({
          where: eq(schema.sessionLogs.userId, SACHA), columns: { id: true },
        })).map((x) => x.id),
      ),
    );

    const res = await signaler({
      regions: ["face:quadriceps:droite"],
      niveau: 9,
      type_douleur: "aiguë",
      arret_conseille: true,
      decision: "Séance arrêtée sur douleur",
    });
    const { incidentId, propositions } = await res.json();
    incidentApresArret = incidentId;
    expect(propositions).toHaveLength(1);

    // Et rien n'a été créé : l'arrêt n'emporte aucune décision de protection.
    expect(await contraintesActives(SACHA)).toHaveLength(0);
  });

  it("l'écran « Ce que tu ménages » la repose", async () => {
    const res = await contraintesRoute.GET();
    const { enAttente } = await res.json();
    expect(enAttente.map((a: { incidentId: string }) => a.incidentId))
      .toContain(incidentApresArret);
    expect(enAttente[0].propositions[0].zone).toBe("Quadriceps");
  });

  it("et depuis cet écran, le « Oui » crée bien la contrainte", async () => {
    const res = await proteger.POST(poste({
      incident_id: incidentApresArret, decision: "appliquer",
    }));
    expect(res.status).toBe(200);
    expect((await contraintesActives(SACHA)).map((c) => c.muscle)).toEqual(["quadriceps"]);
  });

  it("elle ne se repose plus une fois tranchée", async () => {
    const res = await contraintesRoute.GET();
    const { enAttente } = await res.json();
    expect(enAttente.map((a: { incidentId: string }) => a.incidentId))
      .not.toContain(incidentApresArret);
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
