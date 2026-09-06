import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Démarrer, recharger, reprendre — la même séance, pas une seconde.
 *
 * Le chemin de création vient d'être réécrit : l'écran de séance ne crée plus
 * rien au rendu, il attend un geste. C'est exactement le genre de changement
 * qui déplace un défaut au lieu de le corriger — et le scénario qui le dirait
 * est celui-ci : on démarre, la page se recharge, et il ne doit y avoir
 * qu'une seule ligne en base.
 *
 * Ce que ce fichier vérifie, et ce qu'il ne peut pas vérifier :
 *
 *   il vérifie   que la lecture par identifiant rend bien LA séance créée,
 *                sans jamais en créer une autre, et qu'elle rend le plan du
 *                jour — donc la phase du cycle, donc « Encore ? » plutôt que
 *                « RPE » ;
 *
 *   il ne peut   simuler la réhydratation du brouillon persisté dans le
 *   pas vérifier navigateur : la suite tourne sans DOM. C'est précisément
 *                pour ça que l'identifiant a été mis dans l'URL — la reprise
 *                ne dépend plus du navigateur, mais de l'adresse.
 */

const U = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({
  getAuthenticatedUserId: async () => U,
  requireAuthenticatedUserId: async () => ({ userId: U, error: null }),
}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { eq } = await import("drizzle-orm");
const seanceDuJour = await import("@/app/api/seance-du-jour/route");

let salle = "";
let gabarit = "";
let instance = "";

const seancesDuCompte = () =>
  db.query.sessionLogs.findMany({ where: eq(schema.sessionLogs.userId, U) });

beforeAll(async () => {
  await db.insert(schema.users).values({
    id: U, email: `${U}@t.test`, nom: "Reprise", onboardingTermineLe: new Date(),
  });

  const [g] = await db.insert(schema.gyms).values({
    userId: U, nom: `St-Martin ${U.slice(0, 6)}`, equipementsDisponibles: [],
  }).returning();
  salle = g!.id;

  const [bloc] = await db.insert(schema.programmeBlocs).values({
    userId: U, nom: "Reprise & calibration", dateDebut: "2026-09-01",
    typeCycle: "calibration", actif: true,
  }).returning();

  const [t] = await db.insert(schema.seanceTemplates).values({
    blocId: bloc!.id, lettre: "B", nom: "Calibration B", ordreDansSemaine: 2,
  }).returning();
  gabarit = t!.id;

  const [e] = await db.insert(schema.exercises).values({
    userId: null, nom: "Développé incliné", pilier: "P1_poussee",
    profilTension: "mi_range", type: "polyarticulaire", categorieRole: "pilier",
    musclesPrincipaux: ["pectoraux"], musclesSecondaires: [], equipement: "halteres",
    slug: `incline-${U.slice(0, 8)}`,
  }).returning();
  const [i] = await db.insert(schema.exerciseInstances).values({
    userId: U, exerciseId: e!.id, gymId: salle, machineNom: "Banc inclinable",
    conventionCharge: "poids_par_main", incrementsPossibles: [2], etat: "disponible",
  }).returning();
  instance = i!.id;

  await db.insert(schema.exerciseInTemplate).values({
    seanceTemplateId: gabarit, exerciseInstanceId: instance,
    ordre: 1, seriesCibles: 2, fourchetteRepsMin: 8, fourchetteRepsMax: 12,
    reposSecondes: 120,
  });
});

/**
 * Ce que fait le bouton « Démarrer la séance » : construire le plan du jour,
 * exactement comme `/session/start`. Pas seulement écrire une ligne.
 */
const demarrer = () =>
  seanceDuJour.POST(
    new Request("http://t/", {
      method: "POST",
      body: JSON.stringify({ date: "2026-09-08", gymId: salle, seanceTemplateId: gabarit }),
    }),
  );

const relire = (sessionLogId: string) =>
  seanceDuJour.GET(new Request(`http://t/api/seance-du-jour?sessionLogId=${sessionLogId}`));

describe("démarrer explicitement", () => {
  let creee = "";

  it("ouvre exactement une séance", async () => {
    const avant = await seancesDuCompte();
    const res = await demarrer();
    expect(res.status).toBeLessThan(300);
    creee = (await res.json()).seance.id;
    expect(creee).toBeTruthy();

    const apres = await seancesDuCompte();
    expect(apres.length).toBe(avant.length + 1);
  });

  it("et cette séance porte bien le gabarit demandé", async () => {
    const seance = await db.query.sessionLogs.findFirst({
      where: eq(schema.sessionLogs.id, creee),
    });
    expect(seance?.seanceTemplateId).toBe(gabarit);
    expect(seance?.gymId).toBe(salle);
  });

  describe("puis recharger la page", () => {
    it("relit LA même séance, par son identifiant", async () => {
      const res = await relire(creee);
      expect(res.status).toBe(200);
      const plan = await res.json();
      expect(plan.seance.id).toBe(creee);
    });

    it("sans en créer une seconde", async () => {
      // Le cœur du scénario. Relire dix fois ne doit rien écrire : c'est ce
      // que faisait l'ancien effet de rendu, et c'est ce qui a produit la
      // séance fantôme du 6 septembre.
      const avant = await seancesDuCompte();
      for (let n = 0; n < 10; n += 1) await relire(creee);
      const apres = await seancesDuCompte();
      expect(apres.length).toBe(avant.length);
    });

    it("et le rechargement rend le PLAN, pas le repli", async () => {
      // Conséquence directe de l'identifiant transmis dans l'URL : l'écran
      // lit la séance construite, avec sa phase de cycle — donc « Encore ? »
      // et non une colonne RPE.
      const plan = await (await relire(creee)).json();
      expect(plan.items.length).toBeGreaterThan(0);
      expect(plan.phaseCycle).toBe("calibration");
    });

    it("la séance reste reprenable même sans la moindre série", async () => {
      // L'invariant de la PR #3, revérifié sur ce chemin-ci : une séance
      // ouverte et vide existe, se relit, et ne compte pas pour autant.
      const series = await db.query.setLogs.findMany({
        where: eq(schema.setLogs.sessionLogId, creee),
      });
      expect(series).toEqual([]);
      expect((await relire(creee)).status).toBe(200);
    });
  });
});

describe("l'identifiant voyage dans l'adresse", () => {
  it("le démarrage explicite le pose dans l'URL", async () => {
    /*
     * La propriété qui rend le rechargement déterministe.
     *
     * Sans elle, retrouver la séance après un rechargement dépendait
     * uniquement du brouillon persisté dans le navigateur : vidé, expiré, ou
     * ouvert dans un autre onglet, l'écran aurait proposé de démarrer une
     * seconde fois ce qui existait déjà. Et l'écran serait resté sur la
     * lecture de repli, sans prescription du jour.
     */
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const source = readFileSync(
      path.resolve(import.meta.dirname, "../app/(app)/sessions/new/[templateId]/page.tsx"),
      "utf8",
    );
    // L'ouverture passe par le constructeur de séance, pas par la simple
    // écriture d'une ligne : c'est ce qui donne un plan à la séance.
    expect(source).toMatch(/"\/api\/seance-du-jour"/);
    expect(source).toMatch(/router\.replace\(`\/sessions\/new\/\$\{templateId\}\?/);
    expect(source).toMatch(/sessionId: resultat\.seance\.id/);
  });
});
