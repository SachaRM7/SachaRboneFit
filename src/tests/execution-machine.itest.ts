import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * La mémoire d'un appareil : à qui elle appartient, et à quoi elle se rattache.
 *
 * Trois portées se croisent ici, et tout l'enjeu est qu'elles ne se mélangent
 * jamais. La fiche appartient au MOUVEMENT, les réglages disponibles à
 * l'APPAREIL, les valeurs au COUPLE personne × appareil.
 *
 * Le pire défaut possible serait un cran de siège recopié d'une machine à
 * l'autre au motif que c'est le même exercice : deux Leg Extension de marques
 * différentes ne numérotent pas leurs crans pareil, et l'athlète se réglerait
 * sur un souvenir faux. Un cran absent est moins grave qu'un cran faux.
 */

const SACHA = randomUUID();
const MARIA = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({ getAuthenticatedUserId: async () => SACHA }));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { and, eq } = await import("drizzle-orm");
const {
  contexteExecution, ecrireNote, enregistrerReglages,
  IncoherenceExerciceAppareil, InstanceIntrouvable, ReglageRefuse,
} = await import("@/services/execution");

let salle = "";
let legExtension = "";
let pompes = "";
/** Deux Leg Extension DIFFÉRENTES, dans la même salle. */
let matrixA = "";
let matrixB = "";

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBeTruthy();

  for (const id of [SACHA, MARIA]) {
    await db.insert(schema.users).values({ id, email: `${id}@t.test`, nom: "Testeur" });
  }

  const [g] = await db.insert(schema.gyms).values({
    userId: SACHA, nom: `Salle ${SACHA.slice(0, 8)}`, equipementsDisponibles: ["machine"],
  }).returning();
  salle = g!.id;

  const [le] = await db.insert(schema.exercises).values({
    userId: null, nom: "Leg Extension", pilier: "P3_squat", profilTension: "contract",
    type: "isolation", categorieRole: "accessoire", musclesPrincipaux: ["quadriceps"],
    musclesSecondaires: [], equipement: "machine", slug: `le-${SACHA.slice(0, 8)}`,
    // La fiche appartient au mouvement : elle vaut sur les deux machines.
    ficheTechnique: {
      description: "Extension du genou contre résistance, assis.",
      amplitude: "Jusqu'à l'extension complète, sans verrouiller brutalement.",
      pointsCles: ["Dos plaqué au dossier", "Genou aligné avec l'axe de rotation"],
      erreursFrequentes: ["Décoller le bassin en fin de série"],
    },
    tempoParDefaut: "3-1-1-0",
  }).returning();
  legExtension = le!.id;

  const [po] = await db.insert(schema.exercises).values({
    userId: null, nom: "Pompes", pilier: "P1_poussee", profilTension: "mi_range",
    type: "polyarticulaire", categorieRole: "pilier", musclesPrincipaux: ["pectoraux"],
    musclesSecondaires: [], equipement: "poids_du_corps", slug: `po-${SACHA.slice(0, 8)}`,
    // Ni fiche ni tempo : le cas le plus fréquent du catalogue aujourd'hui.
  }).returning();
  pompes = po!.id;

  const instances = await db.insert(schema.exerciseInstances).values([
    {
      userId: SACHA, exerciseId: legExtension, gymId: salle,
      machineNom: `Leg Extension n°1 ${SACHA.slice(0, 6)}`,
      conventionCharge: "pile_affichee", incrementsPossibles: [5],
    },
    {
      userId: SACHA, exerciseId: legExtension, gymId: salle,
      machineNom: `Leg Extension n°2 ${SACHA.slice(0, 6)}`,
      conventionCharge: "pile_affichee", incrementsPossibles: [5],
    },
  ]).returning();
  matrixA = instances[0]!.id;
  matrixB = instances[1]!.id;

  // Les deux machines n'ont pas la même numérotation : c'est précisément la
  // raison pour laquelle un réglage ne se transpose pas.
  await db.insert(schema.instanceReglages).values([
    { exerciseInstanceId: matrixA, cle: "siege", libelle: "Siège", typeValeur: "cran", min: 1, max: 10, ordre: 1 },
    { exerciseInstanceId: matrixA, cle: "rouleau", libelle: "Rouleau", typeValeur: "cran", min: 1, max: 6, ordre: 2 },
    { exerciseInstanceId: matrixB, cle: "siege", libelle: "Siège", typeValeur: "cran", min: 1, max: 5, ordre: 1 },
  ]);
});

const lire = (userId: string, instanceId: string | null, exerciseId = legExtension) =>
  contexteExecution({ userId, exerciseId, exerciseInstanceId: instanceId });

describe("la fiche appartient au mouvement", () => {
  it("elle est la même sur les deux machines", async () => {
    const a = await lire(SACHA, matrixA);
    const b = await lire(SACHA, matrixB);
    expect(a.fiche?.amplitude).toBe(b.fiche?.amplitude);
    expect(a.fiche?.pointsCles).toHaveLength(2);
  });

  it("un exercice sans fiche reste parfaitement utilisable", async () => {
    const r = await lire(SACHA, null, pompes);
    expect(r.fiche).toBeNull();
    expect(r.tempo).toBeNull();
    // Pas d'appareil : aucune section réglages ne doit apparaître.
    expect(r.reglages).toEqual([]);
    expect(r.resumeReglages).toBeNull();
  });
});

describe("le tempo et ses priorités, contre la base", () => {
  it("descend au tempo de l'exercice faute de prescription", async () => {
    const r = await lire(SACHA, matrixA);
    expect(r.tempo?.brut).toBe("3-1-1-0");
    expect(r.tempo?.origine).toBe("exercice");
  });

  it("la prescription de la séance l'emporte sur tout", async () => {
    const r = await contexteExecution({
      userId: SACHA, exerciseId: legExtension, exerciseInstanceId: matrixA,
      tempoSeance: "4-2-1-0", tempoProgramme: "2-0-2-0",
    });
    expect(r.tempo?.brut).toBe("4-2-1-0");
    expect(r.tempo?.origine).toBe("seance");
  });

  it("aucun tempo n'est inventé sur un exercice qui n'en porte pas", async () => {
    const r = await lire(SACHA, null, pompes);
    expect(r.tempo).toBeNull();
  });
});

describe("les réglages disponibles décrivent l'appareil", () => {
  it("chaque machine annonce les siens, avec ses propres bornes", async () => {
    const a = await lire(SACHA, matrixA);
    expect(a.reglages.map((r) => r.cle)).toEqual(["siege", "rouleau"]);
    expect(a.reglages[0]!.definition.max).toBe(10);

    const b = await lire(SACHA, matrixB);
    expect(b.reglages.map((r) => r.cle)).toEqual(["siege"]);
    expect(b.reglages[0]!.definition.max).toBe(5);
  });

  it("tant que rien n'est renseigné, aucune valeur n'est affichée", async () => {
    const a = await lire(SACHA, matrixA);
    expect(a.reglages.every((r) => r.valeur === null)).toBe(true);
    expect(a.resumeReglages).toBeNull();
  });
});

describe("les valeurs appartiennent au couple personne × appareil", () => {
  beforeAll(async () => {
    await enregistrerReglages({
      userId: SACHA, exerciseInstanceId: matrixA, exerciseId: legExtension, valeurs: { siege: "6", rouleau: "3" },
    });
    await enregistrerReglages({
      userId: MARIA, exerciseInstanceId: matrixA, exerciseId: legExtension, valeurs: { siege: "3", rouleau: "2" },
    });
  });

  it("Sacha retrouve les siennes", async () => {
    const r = await lire(SACHA, matrixA);
    expect(r.resumeReglages).toBe("Siège 6 · Rouleau 3");
  });

  it("Maria retrouve les siennes, sur la même machine", async () => {
    const r = await lire(MARIA, matrixA);
    expect(r.resumeReglages).toBe("Siège 3 · Rouleau 2");
  });

  it("RIEN ne passe de la machine n°1 à la machine n°2", async () => {
    // Le défaut qu'on refuse : deux Leg Extension différentes n'ont pas les
    // mêmes crans, et un réglage transposé serait un souvenir faux.
    const r = await lire(SACHA, matrixB);
    expect(r.resumeReglages).toBeNull();
    expect(r.reglages[0]!.valeur).toBeNull();
  });

  it("et le réglage est retrouvé tel quel à la séance suivante", async () => {
    // Persisté à la modification, pas à la clôture : rien ne dépend d'une
    // séance terminée.
    const r = await lire(SACHA, matrixA);
    expect(r.reglages.find((x) => x.cle === "siege")?.valeur).toBe("6");
  });

  it("le modifier remplace, il n'empile pas", async () => {
    await enregistrerReglages({
      userId: SACHA, exerciseInstanceId: matrixA, exerciseId: legExtension, valeurs: { siege: "7" },
    });
    const lignes = await db.query.reglagesPersonnels.findMany({
      where: and(
        eq(schema.reglagesPersonnels.userId, SACHA),
        eq(schema.reglagesPersonnels.exerciseInstanceId, matrixA),
        eq(schema.reglagesPersonnels.cle, "siege"),
      ),
    });
    expect(lignes).toHaveLength(1);
    expect(lignes[0]!.valeur).toBe("7");
    // L'autre réglage n'a pas été effacé par une écriture partielle.
    const r = await lire(SACHA, matrixA);
    expect(r.reglages.find((x) => x.cle === "rouleau")?.valeur).toBe("3");
  });

  it("une valeur vide efface, et remet « non renseigné »", async () => {
    await enregistrerReglages({
      userId: SACHA, exerciseInstanceId: matrixA, exerciseId: legExtension, valeurs: { rouleau: "" },
    });
    const r = await lire(SACHA, matrixA);
    expect(r.reglages.find((x) => x.cle === "rouleau")?.valeur).toBeNull();
    await enregistrerReglages({
      userId: SACHA, exerciseInstanceId: matrixA, exerciseId: legExtension, valeurs: { rouleau: "3" },
    });
  });
});

describe("une valeur hors plage est refusée, pas corrigée", () => {
  it("le siège de la n°2 s'arrête à 5", async () => {
    await expect(
      enregistrerReglages({ userId: SACHA, exerciseInstanceId: matrixB, exerciseId: legExtension, valeurs: { siege: "8" } }),
    ).rejects.toThrow(ReglageRefuse);
  });

  it("et rien n'a été enregistré", async () => {
    const r = await lire(SACHA, matrixB);
    expect(r.reglages[0]!.valeur).toBeNull();
  });

  it("l'écriture est atomique : une valeur fautive annule tout le lot", async () => {
    // Sans transaction, le siège serait retenu et le rouleau rejeté — et en
    // rouvrant l'écran on ne saurait plus ce qui a été pris.
    await expect(
      enregistrerReglages({
        userId: MARIA, exerciseInstanceId: matrixA, exerciseId: legExtension, valeurs: { siege: "5", rouleau: "99" },
      }),
    ).rejects.toThrow(ReglageRefuse);
    const r = await lire(MARIA, matrixA);
    expect(r.reglages.find((x) => x.cle === "siege")?.valeur).toBe("3");
  });

  it("une clé que la machine ne décrit pas est refusée", async () => {
    await expect(
      enregistrerReglages({
        userId: SACHA, exerciseInstanceId: matrixA, exerciseId: legExtension, valeurs: { safety_bars: "3" },
      }),
    ).rejects.toThrow(ReglageRefuse);
  });
});

describe("la note personnelle", () => {
  it("se range sur l'appareil, et reste privée", async () => {
    await ecrireNote({ userId: SACHA, exerciseInstanceId: matrixA, exerciseId: legExtension, texte: "siège 6 parfait" });
    expect((await lire(SACHA, matrixA)).note).toBe("siège 6 parfait");
    expect((await lire(MARIA, matrixA)).note).toBeNull();
    expect((await lire(SACHA, matrixB)).note).toBeNull();
  });

  it("se range sur le mouvement quand il n'y a pas d'appareil", async () => {
    await ecrireNote({ userId: SACHA, exerciseId: pompes, texte: "mains plus larges" });
    expect((await lire(SACHA, null, pompes)).note).toBe("mains plus larges");
  });

  it("se réécrit sans s'empiler", async () => {
    await ecrireNote({ userId: SACHA, exerciseInstanceId: matrixA, exerciseId: legExtension, texte: "poignée neutre mieux" });
    const lignes = await db.query.notesExercice.findMany({
      where: and(
        eq(schema.notesExercice.userId, SACHA),
        eq(schema.notesExercice.exerciseInstanceId, matrixA),
      ),
    });
    expect(lignes).toHaveLength(1);
    expect(lignes[0]!.texte).toBe("poignée neutre mieux");
  });

  it("un texte vide l'efface", async () => {
    await ecrireNote({ userId: SACHA, exerciseInstanceId: matrixA, exerciseId: legExtension, texte: "   " });
    expect((await lire(SACHA, matrixA)).note).toBeNull();
    await ecrireNote({ userId: SACHA, exerciseInstanceId: matrixA, exerciseId: legExtension, texte: "siège 6 parfait" });
  });

  it("n'entre dans aucune donnée du moteur", async () => {
    // La note est contextuelle, pas une métrique : elle ne touche ni les
    // séries, ni la progression, ni le feu biologique. La vérification porte
    // sur NOS comptes — la base est partagée par toute la suite.
    for (const u of [SACHA, MARIA]) {
      expect(await db.$count(schema.sessionLogs, eq(schema.sessionLogs.userId, u))).toBe(0);
    }
    const nos = await db.query.exerciseInstances.findMany({
      where: eq(schema.exerciseInstances.gymId, salle),
      columns: { id: true },
    });
    for (const i of nos) {
      expect(
        await db.$count(schema.setLogs, eq(schema.setLogs.exerciseInstanceId, i.id)),
      ).toBe(0);
    }
  });
});

/**
 * Le couple exercice × appareil n'est jamais cru sur parole.
 *
 * Les deux identifiants arrivent séparément du client. Assemblés sans
 * contrôle, ils produiraient la fiche technique d'un mouvement à côté des
 * réglages d'une machine qui en fait un autre : des consignes justes,
 * appliquées au mauvais appareil. C'est le pire résultat possible pour un
 * écran dont tout l'objet est de dire comment exécuter.
 */
describe("l'appareil doit correspondre à l'exercice", () => {
  it("refuse la lecture d'un couple incohérent", async () => {
    // matrixA est une Leg Extension ; on prétend y faire des pompes.
    await expect(
      contexteExecution({ userId: SACHA, exerciseId: pompes, exerciseInstanceId: matrixA }),
    ).rejects.toThrow(IncoherenceExerciceAppareil);
  });

  it("refuse l'écriture d'un réglage sur un couple incohérent", async () => {
    await expect(
      enregistrerReglages({
        userId: SACHA, exerciseInstanceId: matrixA, exerciseId: pompes,
        valeurs: { siege: "5" },
      }),
    ).rejects.toThrow(IncoherenceExerciceAppareil);
  });

  it("refuse une note rangée sur le mauvais appareil", async () => {
    await expect(
      ecrireNote({
        userId: SACHA, exerciseInstanceId: matrixA, exerciseId: pompes, texte: "ailleurs",
      }),
    ).rejects.toThrow(IncoherenceExerciceAppareil);
  });

  it("refuse un appareil qui n'existe pas", async () => {
    await expect(
      contexteExecution({
        userId: SACHA, exerciseId: legExtension,
        exerciseInstanceId: "00000000-0000-0000-0000-000000000000",
      }),
    ).rejects.toThrow(InstanceIntrouvable);
  });

  it("refuse un appareil archivé", async () => {
    const [morte] = await db.insert(schema.exerciseInstances).values({
      userId: SACHA, exerciseId: legExtension, gymId: salle,
      machineNom: `Leg Extension retirée ${SACHA.slice(0, 6)}`,
      conventionCharge: "pile_affichee", incrementsPossibles: [5],
      archiveLe: new Date(),
    }).returning();
    await expect(
      contexteExecution({
        userId: SACHA, exerciseId: legExtension, exerciseInstanceId: morte!.id,
      }),
    ).rejects.toThrow(InstanceIntrouvable);
  });

  it("et rien n'a été écrit au passage", async () => {
    const r = await lire(SACHA, matrixA);
    // Les valeurs légitimes posées plus haut sont intactes.
    expect(r.reglages.find((x) => x.cle === "siege")?.valeur).toBe("7");
    expect(r.note).toBe("siège 6 parfait");
  });
});

/**
 * Le parc est partagé : chacun mémorise SES réglages sur la machine d'un autre.
 */
describe("les règles d'accès au parc partagé sont conservées", () => {
  it("Maria écrit sur une machine décrite par Sacha, sans y toucher", async () => {
    const avant = await db.query.instanceReglages.findMany({
      where: eq(schema.instanceReglages.exerciseInstanceId, matrixB),
    });
    await enregistrerReglages({
      userId: MARIA, exerciseInstanceId: matrixB, exerciseId: legExtension,
      valeurs: { siege: "2" },
    });
    // Sa valeur est là…
    expect((await lire(MARIA, matrixB)).reglages[0]!.valeur).toBe("2");
    // …celle de Sacha n'a pas bougé…
    expect((await lire(SACHA, matrixB)).reglages[0]!.valeur).toBeNull();
    // …et la DÉFINITION de la machine est inchangée : écrire ses réglages
    // n'est pas modifier l'inventaire du lieu.
    const apres = await db.query.instanceReglages.findMany({
      where: eq(schema.instanceReglages.exerciseInstanceId, matrixB),
    });
    expect(apres).toHaveLength(avant.length);
    expect(apres[0]!.max).toBe(5);
  });
});

describe("l'existant n'a pas bougé", () => {
  it("une instance sans aucun réglage déclaré se lit sans erreur", async () => {
    // Les 99 instances de Saint-Martin sont exactement dans ce cas : aucune
    // ligne `instance_reglages`, et tout doit continuer de fonctionner.
    const [nue] = await db.insert(schema.exerciseInstances).values({
      userId: SACHA, exerciseId: pompes, gymId: salle,
      machineNom: `Barre ${SACHA.slice(0, 6)}`,
      conventionCharge: "poids_total", incrementsPossibles: [2.5],
    }).returning();

    const r = await lire(SACHA, nue!.id, pompes);
    expect(r.reglages).toEqual([]);
    expect(r.resumeReglages).toBeNull();
    expect(r.note).toBeNull();
    expect(r.fiche).toBeNull();
  });

  it("efface ce que ce fichier a écrit", async () => {
    const instances = await db.query.exerciseInstances.findMany({
      where: eq(schema.exerciseInstances.gymId, salle),
    });
    for (const i of instances) {
      await db.delete(schema.reglagesPersonnels)
        .where(eq(schema.reglagesPersonnels.exerciseInstanceId, i.id));
      await db.delete(schema.notesExercice)
        .where(eq(schema.notesExercice.exerciseInstanceId, i.id));
      await db.delete(schema.instanceReglages)
        .where(eq(schema.instanceReglages.exerciseInstanceId, i.id));
    }
    for (const u of [SACHA, MARIA]) {
      await db.delete(schema.notesExercice).where(eq(schema.notesExercice.userId, u));
    }
    await db.delete(schema.exerciseInstances)
      .where(eq(schema.exerciseInstances.gymId, salle));
    await db.delete(schema.gyms).where(eq(schema.gyms.id, salle));
    for (const e of [legExtension, pompes]) {
      await db.delete(schema.exercises).where(eq(schema.exercises.id, e));
    }
    for (const u of [SACHA, MARIA]) {
      await db.delete(schema.users).where(eq(schema.users.id, u));
    }
    expect(true).toBe(true);
  });
});
