import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Le chemin d'écriture du coach, contre une vraie base.
 *
 * Ce qui se vérifie ici ne peut pas se vérifier ailleurs : qu'une proposition
 * n'écrit rien, qu'une confirmation écrit exactement ce qui a été montré,
 * qu'une séance modifiée entre-temps fait échouer la confirmation plutôt que de
 * l'appliquer de travers, et qu'un identifiant appartenant à quelqu'un d'autre
 * ne donne accès à rien.
 */

const U = randomUUID();
const AUTRE = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({ getAuthenticatedUserId: async () => U }));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { eq, asc } = await import("drizzle-orm");
const {
  preparerProposition, appliquerProposition, refuserProposition,
  propositionsEnAttente, PropositionRefusee,
} = await import("@/services/propositions-coach");
const { createCoachTools } = await import("@/lib/coach/tools");
const { BORNES } = await import("@/lib/coach/propositions");

let gabarit = "";
let gabaritAutre = "";
let salle = "";
const instances: Record<string, string> = {};
const lignes: Record<string, string> = {};

/** Le contenu réel de la séance, tel qu'il est en base. */
async function contenu(templateId = gabarit) {
  return db
    .select({
      id: schema.exerciseInTemplate.id,
      ordre: schema.exerciseInTemplate.ordre,
      instance: schema.exerciseInTemplate.exerciseInstanceId,
      series: schema.exerciseInTemplate.seriesCibles,
      repsMin: schema.exerciseInTemplate.fourchetteRepsMin,
      repsMax: schema.exerciseInTemplate.fourchetteRepsMax,
    })
    .from(schema.exerciseInTemplate)
    .where(eq(schema.exerciseInTemplate.seanceTemplateId, templateId))
    .orderBy(asc(schema.exerciseInTemplate.ordre));
}

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBeTruthy();

  for (const id of [U, AUTRE]) {
    await db.insert(schema.users).values({
      id, email: `${id}@t.test`, nom: "Testeur", onboardingTermineLe: new Date(),
      dureeSeanceCibleMinutes: 90,
    });
  }

  const [g] = await db.insert(schema.gyms).values({ userId: U, nom: `Salle ${U.slice(0, 8)}` }).returning();
  salle = g!.id;

  // Trois piliers différents : une séance qui ne déclenche pas d'anomalie
  // bloquante pour de mauvaises raisons.
  const fiches: Array<[string, string, string, string[]]> = [
    ["dev", "Développé couché", "P1_poussee", ["pectoraux"]],
    ["tirage", "Tirage horizontal", "P2_tirage", ["dorsaux"]],
    ["elev", "Élévations latérales", "epaules", ["deltoide_lateral"]],
    ["incline", "Développé incliné", "P1_poussee", ["pectoraux"]],
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

  const contenuInitial: Array<[string, string, number, number, number]> = [
    ["dev", "dev", 4, 6, 10],
    ["tirage", "tirage", 4, 8, 12],
    ["elev", "elev", 3, 12, 15],
  ];
  for (const [cle, instance, series, min, max] of contenuInitial) {
    const [l] = await db.insert(schema.exerciseInTemplate).values({
      seanceTemplateId: gabarit, exerciseInstanceId: instances[instance]!,
      ordre: contenuInitial.findIndex((c) => c[0] === cle) + 1,
      seriesCibles: series, fourchetteRepsMin: min, fourchetteRepsMax: max, reposSecondes: 120,
    }).returning();
    lignes[cle] = l!.id;
  }

  // La séance d'un autre athlète, pour vérifier ce qui est refusé.
  const [blocAutre] = await db.insert(schema.programmeBlocs).values({
    userId: AUTRE, nom: "Bloc du voisin", dateDebut: "2026-08-01", typeCycle: "volume", actif: true,
  }).returning();
  const [ta] = await db.insert(schema.seanceTemplates).values({
    blocId: blocAutre!.id, lettre: "A", nom: "Séance du voisin", ordreDansSemaine: 1,
  }).returning();
  gabaritAutre = ta!.id;
});

describe("proposer n'écrit rien", () => {
  it("une proposition laisse la séance exactement dans son état", async () => {
    const avant = await contenu();

    const proposition = await preparerProposition({
      userId: U, seanceTemplateId: gabarit,
      operation: { type: "ajuster_volume", ligneId: lignes.dev!, seriesCibles: 6 },
    });

    expect(proposition.apercu.resume).toContain("+2 séries");
    expect(await contenu()).toEqual(avant);

    await refuserProposition(U, proposition.id);
    expect(await contenu()).toEqual(avant);
  });

  it("l'aperçu est construit par le serveur, pas transmis par le modèle", async () => {
    const proposition = await preparerProposition({
      userId: U, seanceTemplateId: gabarit,
      operation: { type: "remplacer_exercice", ligneId: lignes.dev!, versInstanceId: instances.incline! },
    });
    // L'avant vient de la base : le modèle n'a fourni que deux identifiants.
    expect(proposition.apercu.lignes).toContainEqual({
      // Le nom affiché porte la machine : c'est ce que l'athlète lit en salle.
      mouvement: "retire", nom: "Développé couché — Poste dev", avant: "4 × 6-10", apres: null,
    });
    await refuserProposition(U, proposition.id);
  });
});

describe("appliquer écrit ce qui a été montré, et rien d'autre", () => {
  it("un ajustement de volume ne touche que sa ligne", async () => {
    const avant = await contenu();
    const proposition = await preparerProposition({
      userId: U, seanceTemplateId: gabarit,
      operation: { type: "ajuster_volume", ligneId: lignes.elev!, seriesCibles: 4, repsMin: 10, repsMax: 12 },
    });

    await appliquerProposition(U, proposition.id);

    const apres = await contenu();
    expect(apres.find((l) => l.id === lignes.elev)).toMatchObject({
      series: 4, repsMin: 10, repsMax: 12,
    });
    expect(apres.filter((l) => l.id !== lignes.elev))
      .toEqual(avant.filter((l) => l.id !== lignes.elev));

    // Remise en état pour les tests suivants.
    await db.update(schema.exerciseInTemplate)
      .set({ seriesCibles: 3, fourchetteRepsMin: 12, fourchetteRepsMax: 15 })
      .where(eq(schema.exerciseInTemplate.id, lignes.elev!));
  });

  it("un remplacement garde la ligne, sa place et sa prescription", async () => {
    const proposition = await preparerProposition({
      userId: U, seanceTemplateId: gabarit,
      operation: { type: "remplacer_exercice", ligneId: lignes.dev!, versInstanceId: instances.incline! },
    });
    await appliquerProposition(U, proposition.id);

    const ligne = (await contenu()).find((l) => l.id === lignes.dev);
    expect(ligne).toMatchObject({
      ordre: 1, instance: instances.incline, series: 4, repsMin: 6, repsMax: 10,
    });

    await db.update(schema.exerciseInTemplate)
      .set({ exerciseInstanceId: instances.dev! })
      .where(eq(schema.exerciseInTemplate.id, lignes.dev!));
  });

  it("un ajout crée une ligne à la fin, et une seule", async () => {
    const avant = await contenu();
    const proposition = await preparerProposition({
      userId: U, seanceTemplateId: gabarit,
      operation: {
        type: "ajouter_exercice", exerciseInstanceId: instances.curl!,
        seriesCibles: 3, repsMin: 8, repsMax: 12,
      },
    });
    await appliquerProposition(U, proposition.id);

    const apres = await contenu();
    expect(apres).toHaveLength(avant.length + 1);
    expect(apres[apres.length - 1]).toMatchObject({
      instance: instances.curl, ordre: avant.length + 1, series: 3, repsMin: 8, repsMax: 12,
    });

    await db.delete(schema.exerciseInTemplate)
      .where(eq(schema.exerciseInTemplate.id, apres[apres.length - 1]!.id));
  });

  it("garde la trace de l'avant, de l'après et de la décision", async () => {
    const proposition = await preparerProposition({
      userId: U, seanceTemplateId: gabarit,
      operation: { type: "ajuster_volume", ligneId: lignes.tirage!, seriesCibles: 5 },
    });
    await appliquerProposition(U, proposition.id);

    const trace = await db.query.coachPropositions.findFirst({
      where: eq(schema.coachPropositions.id, proposition.id),
    });
    expect(trace?.statut).toBe("appliquee");
    expect(trace?.decideLe).toBeInstanceOf(Date);
    // L'avant est figé au moment du calcul : c'est ce qui rend la trace lisible
    // des mois plus tard, quand la séance aura encore changé.
    expect((trace?.avant as Array<{ id: string; seriesCibles: number }>)
      .find((l) => l.id === lignes.tirage)?.seriesCibles).toBe(4);
    expect((trace?.apres as Array<{ id: string; seriesCibles: number }>)
      .find((l) => l.id === lignes.tirage)?.seriesCibles).toBe(5);

    await db.update(schema.exerciseInTemplate)
      .set({ seriesCibles: 4 })
      .where(eq(schema.exerciseInTemplate.id, lignes.tirage!));
  });
});

describe("une proposition périmée ne s'applique pas", () => {
  it("refuse quand la séance a changé depuis le calcul", async () => {
    const proposition = await preparerProposition({
      userId: U, seanceTemplateId: gabarit,
      operation: { type: "ajuster_volume", ligneId: lignes.dev!, seriesCibles: 5 },
    });

    // L'athlète modifie sa séance à la main entre l'affichage et le clic.
    await db.update(schema.exerciseInTemplate)
      .set({ seriesCibles: 2 })
      .where(eq(schema.exerciseInTemplate.id, lignes.tirage!));

    await expect(appliquerProposition(U, proposition.id)).rejects.toThrow(PropositionRefusee);

    // Et la séance reste telle que l'athlète l'a laissée : le refus n'écrit rien.
    const apres = await contenu();
    expect(apres.find((l) => l.id === lignes.dev)?.series).toBe(4);
    expect(apres.find((l) => l.id === lignes.tirage)?.series).toBe(2);

    await db.update(schema.exerciseInTemplate)
      .set({ seriesCibles: 4 })
      .where(eq(schema.exerciseInTemplate.id, lignes.tirage!));
  });

  it("refuse une seconde application de la même proposition", async () => {
    const proposition = await preparerProposition({
      userId: U, seanceTemplateId: gabarit,
      operation: { type: "ajuster_volume", ligneId: lignes.dev!, seriesCibles: 5 },
    });
    await appliquerProposition(U, proposition.id);
    await expect(appliquerProposition(U, proposition.id)).rejects.toThrow(/déjà été appliquée/);

    await db.update(schema.exerciseInTemplate)
      .set({ seriesCibles: 4 })
      .where(eq(schema.exerciseInTemplate.id, lignes.dev!));
  });

  it("marque comme périmée une proposition trop ancienne, sans l'appliquer", async () => {
    const proposition = await preparerProposition({
      userId: U, seanceTemplateId: gabarit,
      operation: { type: "ajuster_volume", ligneId: lignes.dev!, seriesCibles: 6 },
    });

    await db.update(schema.coachPropositions)
      .set({ createdAt: new Date(Date.now() - (BORNES.validiteMinutes + 5) * 60_000) })
      .where(eq(schema.coachPropositions.id, proposition.id));

    await expect(appliquerProposition(U, proposition.id)).rejects.toThrow(/trop longtemps/);

    const trace = await db.query.coachPropositions.findFirst({
      where: eq(schema.coachPropositions.id, proposition.id),
    });
    expect(trace?.statut).toBe("perimee");
    expect((await contenu()).find((l) => l.id === lignes.dev)?.series).toBe(4);
  });

  it("ne liste pas les propositions périmées comme en attente", async () => {
    const proposition = await preparerProposition({
      userId: U, seanceTemplateId: gabarit,
      operation: { type: "ajuster_volume", ligneId: lignes.dev!, seriesCibles: 6 },
    });
    expect((await propositionsEnAttente(U)).map((p) => p.id)).toContain(proposition.id);

    await db.update(schema.coachPropositions)
      .set({ createdAt: new Date(Date.now() - (BORNES.validiteMinutes + 5) * 60_000) })
      .where(eq(schema.coachPropositions.id, proposition.id));

    expect((await propositionsEnAttente(U)).map((p) => p.id)).not.toContain(proposition.id);
  });
});

describe("le périmètre de l'utilisateur", () => {
  it("ne prépare rien sur la séance de quelqu'un d'autre", async () => {
    await expect(
      preparerProposition({
        userId: U, seanceTemplateId: gabaritAutre,
        operation: { type: "ajouter_exercice", exerciseInstanceId: instances.curl!, seriesCibles: 3, repsMin: 8, repsMax: 12 },
      }),
    ).rejects.toThrow(/introuvable/);
  });

  it("n'applique pas la proposition d'un autre utilisateur", async () => {
    const proposition = await preparerProposition({
      userId: U, seanceTemplateId: gabarit,
      operation: { type: "ajuster_volume", ligneId: lignes.dev!, seriesCibles: 5 },
    });
    await expect(appliquerProposition(AUTRE, proposition.id)).rejects.toThrow(/introuvable/);
    await refuserProposition(U, proposition.id);
  });
});

describe("les outils exposés au modèle", () => {
  const outils = createCoachTools();

  it("n'exposent plus d'écriture directe sur une séance en cours", async () => {
    // `log_set` insérait des séries que la clôture efface ensuite ; `end_session`
    // clôturait à moitié. Les deux écrivaient sans que rien ne le confirme.
    const noms = outils.definitions.map((d) => d.name);
    expect(noms).not.toContain("log_set");
    expect(noms).not.toContain("end_session");
    expect(outils.executors.log_set).toBeUndefined();
    expect(outils.executors.end_session).toBeUndefined();
  });

  it("ne laissent plus le modèle nommer une séance en cours", () => {
    const incident = outils.definitions.find((d) => d.name === "log_incident")!;
    const proprietes = (incident.input_schema as { properties: Record<string, unknown> }).properties;
    expect(proprietes.sessionLogId).toBeUndefined();
    expect((incident.input_schema as { required: string[] }).required).not.toContain("sessionLogId");
  });

  it("ne consignent aucun incident quand aucune séance n'est ouverte", async () => {
    const avant = await db.query.sessionIncidents.findMany();
    const resultat = await outils.executors.log_incident!(
      { type: "douleur", contexte: { muscle: "epaule" }, decision: "Exercice allégé" },
      U,
    );
    expect(resultat.success).toBe(false);
    expect(resultat.output).toMatch(/aucune séance/i);
    expect(await db.query.sessionIncidents.findMany()).toHaveLength(avant.length);
  });

  it("consignent sur la séance du jour, sans que le modèle la désigne", async () => {
    const [seance] = await db.insert(schema.sessionLogs).values({
      userId: U, date: new Date().toISOString().slice(0, 10), gymId: salle,
    }).returning();

    const resultat = await outils.executors.log_incident!(
      { type: "machine_occupee", contexte: { machine: "Tirage" }, decision: "Substitution" },
      U,
    );
    expect(resultat.success).toBe(true);

    const incidents = await db.query.sessionIncidents.findMany({
      where: eq(schema.sessionIncidents.sessionLogId, seance!.id),
    });
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.type).toBe("machine_occupee");

    await db.delete(schema.sessionIncidents).where(eq(schema.sessionIncidents.sessionLogId, seance!.id));
    await db.delete(schema.sessionLogs).where(eq(schema.sessionLogs.id, seance!.id));
  });

  it("proposent sans écrire, en passant par les outils du modèle", async () => {
    const avant = await contenu();
    const resultat = await outils.executors.propose_volume_adjustment!(
      { ligneId: lignes.dev, seriesCibles: 5, seanceTemplateId: gabarit },
      U,
    );
    expect(resultat.success).toBe(true);

    const rendu = JSON.parse(resultat.output) as { propositionId: string; etat: string };
    expect(rendu.etat).toBe("en_attente_de_confirmation");
    expect(await contenu()).toEqual(avant);

    await refuserProposition(U, rendu.propositionId);
  });

  it("refusent une ligne qui n'appartient pas à la séance désignée", async () => {
    const resultat = await outils.executors.propose_volume_adjustment!(
      { ligneId: randomUUID(), seriesCibles: 5, seanceTemplateId: gabarit },
      U,
    );
    expect(resultat.success).toBe(false);
    expect(resultat.output).toMatch(/n'existe plus/);
  });

  it("prennent la séance de l'écran quand le modèle n'en nomme aucune", async () => {
    const resultat = await outils.executors.get_session_exercises!({}, U, {
      ecran: "accueil", blocId: null, seanceTemplateId: gabarit,
      exerciseInstanceId: null, sessionLogId: null,
    });
    expect(resultat.success).toBe(true);
    const rendu = JSON.parse(resultat.output) as { exercices: Array<{ ligneId: string }> };
    expect(rendu.exercices.map((e) => e.ligneId)).toContain(lignes.dev);
  });
});
