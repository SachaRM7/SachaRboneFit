import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Un réglage machine se décrit, puis se retient — par les ROUTES, pas par le service.
 *
 * `execution-machine.itest.ts` prouve depuis longtemps que le service sait
 * lire une définition, valider une valeur et l'isoler par compte. Il passait
 * au vert alors que la fonctionnalité était strictement inatteignable : il
 * insérait lui-même ses lignes `instance_reglages`, parce qu'aucun chemin
 * applicatif ne savait le faire. Toute l'architecture attendait des définitions
 * que rien n'écrivait — donc `contexte.reglages` restait vide sur chaque
 * appareil du parc, la section « Réglages » ne se rendait jamais, et
 * `enregistrerReglages` aurait refusé toute clé pour « cle_inconnue ».
 *
 * Ce fichier ne teste donc RIEN par le service. Il n'insère aucune ligne de
 * réglage à la main. Tout passe par les routes HTTP, dans l'ordre où l'écran
 * les appelle : c'est la seule preuve qui vaille pour ce lot.
 */

const SACHA = randomUUID();
const MARIA = randomUUID();
// `randomUUID()` a un type littéral : sans annotation, la réaffectation est refusée.
let courant: string = SACHA;

vi.mock("@/lib/supabase/auth-helper", () => ({
  getAuthenticatedUserId: async () => courant,
  requireAuthenticatedUserId: async () => ({ userId: courant, error: null }),
}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { and, eq } = await import("drizzle-orm");
const { REFUS_GESTION_SALLE } = await import("@/lib/autorisations");
const declaration = await import("@/app/api/execution/[instanceId]/reglages/route");
const execution = await import("@/app/api/execution/[instanceId]/route");

/** La salle de Sacha ; Maria s'y entraîne sans l'entretenir. */
let salleDeSacha = "";
let seatedRow = "";
let machine = "";
/** Une seconde machine, pour prouver qu'une définition ne déborde pas. */
let autreMachine = "";

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

const patche = (corps: unknown) =>
  new Request("http://test/x", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corps),
  });

/** Déclarer un réglage, comme le fait le formulaire de la fiche d'exécution. */
const declarer = (instanceId: string, corps: Record<string, unknown>) =>
  declaration.POST(poste({ exerciseId: seatedRow, ...corps }), {
    params: Promise.resolve({ instanceId }),
  });

/** Lire le contexte d'exécution, comme le fait `useContexteExecution`. */
const lireContexte = async (instanceId: string) => {
  const res = await execution.GET(
    new Request(`http://test/api/execution/${instanceId}?exerciseId=${seatedRow}`),
    { params: Promise.resolve({ instanceId }) },
  );
  expect(res.status).toBe(200);
  return res.json();
};

/** Écrire une valeur personnelle, comme le fait la sortie de champ. */
const memoriser = (instanceId: string, reglages: Record<string, string>) =>
  execution.PATCH(patche({ exerciseId: seatedRow, reglages }), {
    params: Promise.resolve({ instanceId }),
  });

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBeTruthy();

  for (const [id, nom] of [[SACHA, "Sacha"], [MARIA, "Maria"]] as const) {
    await db.insert(schema.users).values({ id, email: `${id}@t.test`, nom });
  }

  const [g] = await db.insert(schema.gyms).values({
    userId: SACHA, nom: `St-Martin ${SACHA.slice(0, 8)}`, equipementsDisponibles: ["machine"],
  }).returning();
  salleDeSacha = g!.id;

  const [ex] = await db.insert(schema.exercises).values({
    userId: null, nom: "Seated Row", pilier: "P2_tirage", profilTension: "mi_range",
    type: "polyarticulaire", categorieRole: "pilier", musclesPrincipaux: ["dorsaux"],
    musclesSecondaires: [], equipement: "machine", slug: `sr-${SACHA.slice(0, 8)}`,
  }).returning();
  seatedRow = ex!.id;

  const instances = await db.insert(schema.exerciseInstances).values([
    {
      userId: SACHA, exerciseId: seatedRow, gymId: salleDeSacha,
      machineNom: `Seated Row à pile ${SACHA.slice(0, 6)}`,
      conventionCharge: "pile_affichee", incrementsPossibles: [5],
    },
    {
      userId: SACHA, exerciseId: seatedRow, gymId: salleDeSacha,
      machineNom: `Seated Row n°2 ${SACHA.slice(0, 6)}`,
      conventionCharge: "pile_affichee", incrementsPossibles: [5],
    },
  ]).returning();
  machine = instances[0]!.id;
  autreMachine = instances[1]!.id;
});

describe("l'état de départ, celui que ce lot corrige", () => {
  it("une machine décrite jusqu'aux incréments ne porte aucun réglage", async () => {
    const contexte = await lireContexte(machine);
    expect(contexte.reglages).toEqual([]);
    expect(contexte.resumeReglages).toBeNull();
  });

  it("et la valeur qu'on voudrait y mettre est refusée, faute de définition", async () => {
    // Le défaut exact : « siège 5 » n'était refusé par aucune règle métier — il
    // n'y avait simplement rien à quoi le rattacher.
    const res = await memoriser(machine, { siege: "5" });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/ne décrit pas ce réglage/i);
  });
});

describe("le chemin applicatif de création", () => {
  it("le compte qui tient la salle peut décrire un réglage", async () => {
    const contexte = await lireContexte(machine);
    expect(contexte.peutDecrire).toBe(true);

    const res = await enTantQue(SACHA, () =>
      declarer(machine, { libelle: "Siège", type: "cran", min: "1", max: "10" }));
    expect(res.status).toBe(201);

    const { reglages } = await res.json();
    expect(reglages).toHaveLength(1);
    expect(reglages[0]).toMatchObject({
      cle: "siege", libelle: "Siège", valeur: null,
    });
    expect(reglages[0].definition).toMatchObject({ type: "cran", min: 1, max: 10 });
  });

  it("la définition devient immédiatement visible dans le contexte d'exécution", async () => {
    // Le maillon qui manquait : ce que la fiche d'exécution lit vraiment.
    const contexte = await lireContexte(machine);
    expect(contexte.reglages.map((r: { cle: string }) => r.cle)).toEqual(["siege"]);
    // Décrit mais pas encore renseigné : la carte ne montre rien, le détail si.
    expect(contexte.resumeReglages).toBeNull();
  });

  it("et la valeur personnelle s'enregistre alors sans être refusée", async () => {
    const res = await memoriser(machine, { siege: "5" });
    expect(res.status).toBe(200);
    const { reglages } = await res.json();
    expect(reglages[0]).toMatchObject({ cle: "siege", valeur: "5" });

    const contexte = await lireContexte(machine);
    expect(contexte.resumeReglages).toBe("Siège 5");
  });

  it("les quatre types passent par le même chemin", async () => {
    const cas = [
      { libelle: "Inclinaison du banc", type: "degres", min: "0", max: "45", unite: "°" },
      { libelle: "Poignée", type: "choix", options: ["verticale", "neutre"] },
      { libelle: "Placement", type: "texte" },
    ];
    for (const c of cas) {
      const res = await enTantQue(SACHA, () => declarer(machine, c));
      expect(res.status, c.libelle).toBe(201);
    }

    const contexte = await lireContexte(machine);
    const parCle = Object.fromEntries(
      contexte.reglages.map((r: { cle: string; definition: { type: string } }) => [r.cle, r.definition.type]),
    );
    expect(parCle).toMatchObject({
      siege: "cran",
      inclinaison_du_banc: "degres",
      poignee: "choix",
      placement: "texte",
    });

    // Et chacun accepte la valeur qui lui correspond, par la route de saisie.
    const res = await memoriser(machine, {
      inclinaison_du_banc: "30",
      poignee: "neutre",
      placement: "pieds contre la cale basse",
    });
    expect(res.status).toBe(200);
  });

  it("l'ordre suit celui où les réglages ont été rencontrés", async () => {
    const contexte = await lireContexte(machine);
    expect(contexte.reglages.map((r: { cle: string }) => r.cle)).toEqual([
      "siege", "inclinaison_du_banc", "poignee", "placement",
    ]);
  });

  it("une définition ne déborde jamais sur une autre machine", async () => {
    // Deux Seated Row de la même salle : le même mouvement ne fait pas le même
    // appareil, et un cran recopié serait un souvenir faux.
    const contexte = await lireContexte(autreMachine);
    expect(contexte.reglages).toEqual([]);
  });
});

describe("aucune plage n'est inventée", () => {
  it("un cran peut se déclarer sans borne du tout", async () => {
    const res = await enTantQue(SACHA, () =>
      declarer(machine, { libelle: "Cale-cuisses", type: "cran" }));
    expect(res.status).toBe(201);

    const { reglages } = await res.json();
    const cale = reglages.find((r: { cle: string }) => r.cle === "cale_cuisses");
    expect(cale.definition.min).toBeNull();
    expect(cale.definition.max).toBeNull();
  });

  it("et n'y refuse alors AUCUNE valeur entière", async () => {
    // La conséquence produite à travers les deux routes : sans plage comptée,
    // rien n'est comparé. Un « 1–10 » posé par défaut aurait rejeté ce 14.
    const res = await memoriser(machine, { cale_cuisses: "14" });
    expect(res.status).toBe(200);
    const { reglages } = await res.json();
    expect(reglages.find((r: { cle: string }) => r.cle === "cale_cuisses").valeur).toBe("14");
  });

  it("mais une borne réellement comptée est appliquée", async () => {
    const res = await memoriser(machine, { siege: "12" });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/entre 1 et 10/);
  });

  it("un choix sans positions est refusé — exiger n'est pas inventer", async () => {
    const res = await enTantQue(SACHA, () =>
      declarer(machine, { libelle: "Accessoire", type: "choix", options: [] }));
    expect(res.status).toBe(422);
    expect((await res.json()).motif).toBe("options_insuffisantes");
  });
});

describe("Sacha et Maria sur la même définition partagée", () => {
  it("chacun met le siège où il veut, sur la même machine", async () => {
    await enTantQue(MARIA, async () => {
      const res = await memoriser(machine, { siege: "3" });
      expect(res.status).toBe(200);
    });

    const chezMaria = await enTantQue(MARIA, () => lireContexte(machine));
    const chezSacha = await enTantQue(SACHA, () => lireContexte(machine));

    const siege = (c: { reglages: { cle: string; valeur: string | null }[] }) =>
      c.reglages.find((r) => r.cle === "siege")!.valeur;
    expect(siege(chezMaria)).toBe("3");
    expect(siege(chezSacha)).toBe("5");
  });

  it("et voit la même définition, avec le même libellé", async () => {
    const chezMaria = await enTantQue(MARIA, () => lireContexte(machine));
    expect(chezMaria.reglages.map((r: { libelle: string }) => r.libelle))
      .toContain("Siège");
  });

  it("la base ne porte qu'UNE définition pour les deux", async () => {
    const definitions = await db.query.instanceReglages.findMany({
      where: and(
        eq(schema.instanceReglages.exerciseInstanceId, machine),
        eq(schema.instanceReglages.cle, "siege"),
      ),
    });
    expect(definitions).toHaveLength(1);
  });
});

describe("un compte qui n'entretient pas la salle", () => {
  it("ne peut pas modifier la description commune", async () => {
    const res = await enTantQue(MARIA, () =>
      declarer(machine, { libelle: "Repose-pieds", type: "cran" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(REFUS_GESTION_SALLE);
  });

  it("et rien n'a été écrit — le refus n'est pas cosmétique", async () => {
    const definitions = await db.query.instanceReglages.findMany({
      where: and(
        eq(schema.instanceReglages.exerciseInstanceId, machine),
        eq(schema.instanceReglages.cle, "repose_pieds"),
      ),
    });
    expect(definitions).toEqual([]);
  });

  it("l'écran ne lui propose pas le geste non plus", async () => {
    // La même règle des deux côtés : le serveur refuse, et l'écran ne montre
    // pas une porte fermée. Découvrir le refus après avoir tout saisi serait
    // une politesse mal placée.
    const contexte = await enTantQue(MARIA, () => lireContexte(machine));
    expect(contexte.peutDecrire).toBe(false);
  });

  it("mais sa valeur personnelle reste privée et modifiable", async () => {
    // C'est la moitié à ne pas perdre : la définition est commune, la valeur ne
    // l'est pas. Ne pas tenir la salle n'empêche pas de s'y entraîner.
    await enTantQue(MARIA, async () => {
      const res = await memoriser(machine, { siege: "4", poignee: "verticale" });
      expect(res.status).toBe(200);
    });

    const chezMaria = await enTantQue(MARIA, () => lireContexte(machine));
    const chezSacha = await enTantQue(SACHA, () => lireContexte(machine));
    const valeur = (c: { reglages: { cle: string; valeur: string | null }[] }, cle: string) =>
      c.reglages.find((r) => r.cle === cle)!.valeur;

    expect(valeur(chezMaria, "siege")).toBe("4");
    expect(valeur(chezSacha, "siege")).toBe("5");
    expect(valeur(chezMaria, "poignee")).toBe("verticale");
    expect(valeur(chezSacha, "poignee")).toBe("neutre");
  });
});

describe("un réglage ne se décrit pas deux fois", () => {
  it("la seconde déclaration est refusée, et le dit", async () => {
    const res = await enTantQue(SACHA, () =>
      declarer(machine, { libelle: "siège", type: "cran" }));
    expect(res.status).toBe(422);
    const corps = await res.json();
    expect(corps.motif).toBe("cle_existante");
    expect(corps.error).toMatch(/déjà décrit/i);
  });

  it("et la première n'a pas été écrasée", async () => {
    // Le pire résultat serait une définition remplacée : les valeurs déjà
    // mémorisées se retrouveraient rattachées à autre chose.
    const contexte = await enTantQue(SACHA, () => lireContexte(machine));
    const siege = contexte.reglages.find((r: { cle: string }) => r.cle === "siege");
    expect(siege.definition).toMatchObject({ min: 1, max: 10 });
    expect(siege.valeur).toBe("5");
  });
});

describe("les gardes déjà en place tiennent toujours", () => {
  it("un appareil qui ne fait pas cet exercice est refusé", async () => {
    const [autre] = await db.insert(schema.exercises).values({
      userId: null, nom: "Leg Press", pilier: "P3_squat", profilTension: "mi_range",
      type: "polyarticulaire", categorieRole: "pilier", musclesPrincipaux: ["quadriceps"],
      musclesSecondaires: [], equipement: "machine", slug: `lp-${SACHA.slice(0, 8)}`,
    }).returning();

    const res = await declaration.POST(
      poste({ exerciseId: autre!.id, libelle: "Siège", type: "cran" }),
      { params: Promise.resolve({ instanceId: machine }) },
    );
    expect(res.status).toBe(409);
  });

  it("un exercice sans appareil n'a rien à décrire", async () => {
    const res = await declaration.POST(
      poste({ exerciseId: seatedRow, libelle: "Siège", type: "cran" }),
      { params: Promise.resolve({ instanceId: "sans-appareil" }) },
    );
    expect(res.status).toBe(400);
  });

  it("un appareil inconnu rend 404", async () => {
    const res = await declaration.POST(
      poste({ exerciseId: seatedRow, libelle: "Siège", type: "cran" }),
      { params: Promise.resolve({ instanceId: randomUUID() }) },
    );
    expect(res.status).toBe(404);
  });
});
