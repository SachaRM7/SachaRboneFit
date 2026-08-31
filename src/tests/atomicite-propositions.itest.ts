import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

/**
 * L'atomicité de l'application d'une proposition.
 *
 * La version précédente écrivait, commitait, validait, puis restaurait ligne à
 * ligne si la validation refusait. Entre le commit et la restauration existait
 * une fenêtre — courte, mais réelle — pendant laquelle un état que nos propres
 * validateurs rejettent était visible de tous, et pendant laquelle une panne
 * figeait cet état pour de bon.
 *
 * Ce fichier vérifie qu'elle a disparu. Il ne se contente pas de constater le
 * résultat final : il fait échouer l'application à des moments précis — après
 * la mutation, pendant la validation — et regarde depuis une SECONDE CONNEXION
 * ce que la base montre pendant que la transaction est encore ouverte.
 */

const U = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({ getAuthenticatedUserId: async () => U }));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { eq, and, asc } = await import("drizzle-orm");
const {
  preparerProposition, appliquerProposition, PANNES, PropositionRefusee,
} = await import("@/services/propositions-coach");

/**
 * Une seconde connexion, indépendante de celle qu'utilise le service.
 *
 * C'est le seul moyen d'observer ce qu'une transaction non commitée laisse
 * voir : depuis la connexion qui l'a ouverte, on verrait ses propres écritures.
 */
const espion = postgres(process.env.DATABASE_URL!, { max: 1 });

let gabarit = "";
let salle = "";
const instances: Record<string, string> = {};
const lignes: Record<string, string> = {};

/** Le contenu de la séance vu par la connexion du service. */
async function contenu() {
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
    .where(eq(schema.exerciseInTemplate.seanceTemplateId, gabarit))
    .orderBy(asc(schema.exerciseInTemplate.ordre));
}

/** Le même contenu, vu de l'extérieur de la transaction. */
async function contenuVuDeLExterieur() {
  return espion`
    select id, ordre, series_cibles as series
    from exercise_in_template
    where seance_template_id = ${gabarit}
    order by ordre
  `;
}

async function statut(id: string) {
  const p = await db.query.coachPropositions.findFirst({
    where: eq(schema.coachPropositions.id, id),
  });
  return p?.statut;
}

async function series(ligneId: string) {
  const l = await db.query.exerciseInTemplate.findFirst({
    where: eq(schema.exerciseInTemplate.id, ligneId),
  });
  return l?.seriesCibles;
}

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBeTruthy();

  await db.insert(schema.users).values({
    id: U, email: `${U}@t.test`, nom: "Testeur", onboardingTermineLe: new Date(),
    dureeSeanceCibleMinutes: 120,
  });

  const [g] = await db.insert(schema.gyms).values({ userId: U, nom: `Salle ${U.slice(0, 8)}` }).returning();
  salle = g!.id;

  const fiches: Array<[string, string, string, string[]]> = [
    ["dev", "Développé couché", "P1_poussee", ["pectoraux"]],
    ["tirage", "Tirage horizontal", "P2_tirage", ["dorsaux"]],
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

  for (const [index, cle] of ["dev", "tirage"].entries()) {
    const [l] = await db.insert(schema.exerciseInTemplate).values({
      seanceTemplateId: gabarit, exerciseInstanceId: instances[cle]!,
      ordre: index + 1, seriesCibles: 4, fourchetteRepsMin: 6, fourchetteRepsMax: 10,
      reposSecondes: 120,
    }).returning();
    lignes[cle] = l!.id;
  }
});

afterEach(() => {
  PANNES.apresMutation = null;
  PANNES.pendantValidation = null;
  PANNES.avantCommit = null;
});

afterAll(async () => {
  await espion.end();
});

/** Une proposition valide, prête à être confirmée. */
async function proposerUnAjustement(seriesCibles: number) {
  return preparerProposition({
    userId: U, seanceTemplateId: gabarit,
    operation: { type: "ajuster_volume", ligneId: lignes.dev!, seriesCibles },
  });
}

describe("le chemin nominal : la séance et la proposition changent ensemble", () => {
  it("commite la mutation et le statut dans la même transaction", async () => {
    const proposition = await proposerUnAjustement(5);
    expect(await statut(proposition.id)).toBe("en_attente");

    await appliquerProposition(U, proposition.id);

    expect(await series(lignes.dev!)).toBe(5);
    expect(await statut(proposition.id)).toBe("appliquee");

    await db.update(schema.exerciseInTemplate).set({ seriesCibles: 4 })
      .where(eq(schema.exerciseInTemplate.id, lignes.dev!));
  });
});

describe("une panne injectée annule tout", () => {
  it("après la mutation, avant la validation : rien ne subsiste", async () => {
    const proposition = await proposerUnAjustement(6);
    PANNES.apresMutation = () => {
      throw new Error("Panne simulée entre l'écriture et la validation");
    };

    await expect(appliquerProposition(U, proposition.id)).rejects.toThrow(/Panne simulée/);

    // Ni la séance, ni le statut : les deux écritures partagent le même sort.
    expect(await series(lignes.dev!)).toBe(4);
    expect(await statut(proposition.id)).toBe("echouee");
  });

  it("pendant la validation : rien ne subsiste non plus", async () => {
    const proposition = await proposerUnAjustement(7);
    PANNES.pendantValidation = () => {
      throw new Error("Panne simulée pendant la validation");
    };

    await expect(appliquerProposition(U, proposition.id)).rejects.toThrow(/Panne simulée/);

    expect(await series(lignes.dev!)).toBe(4);
    expect(await statut(proposition.id)).toBe("echouee");
  });

  it("une panne asynchrone — le cas d'un time-out — annule aussi", async () => {
    const proposition = await proposerUnAjustement(8);
    PANNES.apresMutation = async () => {
      await new Promise((r) => setTimeout(r, 5));
      throw new Error("Délai dépassé");
    };

    await expect(appliquerProposition(U, proposition.id)).rejects.toThrow(/Délai dépassé/);
    expect(await series(lignes.dev!)).toBe(4);
  });

  it("laisse la proposition « échouée » avec sa raison, jamais « appliquée »", async () => {
    const proposition = await proposerUnAjustement(9);
    PANNES.apresMutation = () => {
      throw new Error("Coupure réseau");
    };

    await expect(appliquerProposition(U, proposition.id)).rejects.toThrow();

    const trace = await db.query.coachPropositions.findFirst({
      where: eq(schema.coachPropositions.id, proposition.id),
    });
    expect(trace?.statut).toBe("echouee");
    expect(trace?.statut).not.toBe("appliquee");
    expect((trace?.resultat as { raison?: string })?.raison).toContain("Coupure réseau");
  });
});

describe("une validation qui refuse annule la mutation", () => {
  it("ne persiste rien quand la séance devient invalide après la préparation", async () => {
    // La proposition passe les contrôles au moment du calcul. Puis une
    // contrainte sévère apparaît sur les pectoraux — l'exercice est désormais
    // écarté, pas allégé. L'empreinte de la séance n'a pas changé : seule la
    // validation finale peut voir le problème, et elle le voit dans la
    // transaction.
    const proposition = await proposerUnAjustement(5);

    const [contrainte] = await db.insert(schema.contraintes).values({
      userId: U, muscle: "pectoraux", type: "blessure", severite: 9,
      dateDebut: new Date().toISOString().slice(0, 10),
    }).returning();

    try {
      // Une seule tentative : la seconde se heurterait au statut « échouée »
      // et testerait autre chose.
      const erreur = await appliquerProposition(U, proposition.id).catch((e: unknown) => e);
      expect(erreur).toBeInstanceOf(PropositionRefusee);
      expect((erreur as Error).message).toMatch(/invalide/);

      expect(await series(lignes.dev!)).toBe(4);
      expect(await statut(proposition.id)).toBe("echouee");
    } finally {
      await db.delete(schema.contraintes).where(eq(schema.contraintes.id, contrainte!.id));
    }
  });
});

describe("ce que voit une seconde connexion pendant la transaction", () => {
  it("ne montre jamais l'état intermédiaire non commité", async () => {
    const proposition = await proposerUnAjustement(6);

    let vuPendant: readonly Record<string, unknown>[] = [];
    PANNES.apresMutation = async () => {
      // La mutation est faite, la transaction est ouverte. Un lecteur
      // extérieur ne doit voir que l'état d'avant.
      vuPendant = await contenuVuDeLExterieur();
    };

    await appliquerProposition(U, proposition.id);

    const ligneVue = vuPendant.find((l) => l.id === lignes.dev);
    expect(ligneVue?.series).toBe(4);
    // Et après le commit, le nouvel état est bien visible de l'extérieur.
    const apres = await contenuVuDeLExterieur();
    expect(apres.find((l) => l.id === lignes.dev)?.series).toBe(6);

    await db.update(schema.exerciseInTemplate).set({ seriesCibles: 4 })
      .where(eq(schema.exerciseInTemplate.id, lignes.dev!));
  });

  it("ne montre pas non plus le statut « appliquée » avant le commit", async () => {
    const proposition = await proposerUnAjustement(7);

    let statutPendant: string | undefined;
    let seriesPendant: unknown;
    // Le crochet le plus tardif : la séance est modifiée ET le statut est
    // passé à « appliquée », mais le COMMIT n'a pas eu lieu. C'est l'instant
    // exact où l'ancienne version laissait fuir un état intermédiaire.
    PANNES.avantCommit = async () => {
      const [p] = await espion`
        select statut from coach_propositions where id = ${proposition.id}
      `;
      statutPendant = p?.statut as string | undefined;
      const lignesVues = await contenuVuDeLExterieur();
      seriesPendant = lignesVues.find((l) => l.id === lignes.dev)?.series;
    };

    await appliquerProposition(U, proposition.id);

    // Les deux écritures sont invisibles ensemble, puis visibles ensemble.
    expect(statutPendant).toBe("en_attente");
    expect(seriesPendant).toBe(4);
    expect(await statut(proposition.id)).toBe("appliquee");
    expect(await series(lignes.dev!)).toBe(7);

    await db.update(schema.exerciseInTemplate).set({ seriesCibles: 4 })
      .where(eq(schema.exerciseInTemplate.id, lignes.dev!));
  });
});

describe("tout ou rien sur plusieurs écritures", () => {
  it("un ajout d'exercice annulé ne laisse aucune ligne orpheline", async () => {
    const avant = await contenu();

    const proposition = await preparerProposition({
      userId: U, seanceTemplateId: gabarit,
      operation: {
        type: "ajouter_exercice", exerciseInstanceId: instances.curl!,
        seriesCibles: 3, repsMin: 8, repsMax: 12,
      },
    });

    PANNES.apresMutation = () => {
      throw new Error("Panne après insertion");
    };
    await expect(appliquerProposition(U, proposition.id)).rejects.toThrow();

    // L'insertion et le changement de statut sont annulés ensemble : ni ligne
    // en trop, ni proposition appliquée.
    expect(await contenu()).toEqual(avant);
    expect(await statut(proposition.id)).toBe("echouee");
    expect(await contenuVuDeLExterieur()).toHaveLength(avant.length);
  });

  it("les deux tables changent ensemble quand tout se passe bien", async () => {
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
    expect(await statut(proposition.id)).toBe("appliquee");

    await db.delete(schema.exerciseInTemplate)
      .where(and(
        eq(schema.exerciseInTemplate.seanceTemplateId, gabarit),
        eq(schema.exerciseInTemplate.exerciseInstanceId, instances.curl!),
      ));
  });
});
