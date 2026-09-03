import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Le volume par pilier doit contenir les piliers.
 *
 * L'écran « Par pilier » affichait un empilement plausible — des barres, une
 * légende, des semaines — dont les quatre piliers principaux étaient absents.
 * La route rendait ses clés en minuscules (`p1_poussee`), l'écran filtrait sur
 * une liste écrite à la main (`poussee`), et l'intersection des deux ne
 * contenait que les épaules, les jambes et le gainage. Rien ne signalait la
 * perte : un graphique incomplet ressemble à un graphique.
 *
 * Ce test tient la seule chose qui les relie : les clés rendues sont celles du
 * modèle. C'est ce contrat que l'écran consomme, et c'est lui qui avait cédé.
 */

const U = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({
  getAuthenticatedUserId: async () => U,
}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { PILIERS } = await import("@/lib/schemas/exercise");
const { slotDeSerie } = await import("@/lib/chart-theme");
const { GET } = await import("@/app/api/progression/pillar-volume/route");

const AUJOURDHUI = new Date().toISOString().slice(0, 10);
const PILIERS_POSES = ["P1_poussee", "P2_tirage", "P4_hanche", "bras_biceps"] as const;

async function volume(mois = 3) {
  const res = await GET(new Request(`http://t/api/progression/pillar-volume?months=${mois}`));
  expect(res.status).toBe(200);
  return (await res.json()) as Array<Record<string, string | number>>;
}

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBeTruthy();

  await db.insert(schema.users).values({
    id: U, email: `${U}@t.test`, nom: "Testeur", onboardingTermineLe: new Date(),
  });
  const [salle] = await db.insert(schema.gyms)
    .values({ userId: U, nom: `Salle ${U.slice(0, 6)}` }).returning();
  const [seance] = await db.insert(schema.sessionLogs)
    .values({ userId: U, date: AUJOURDHUI, gymId: salle!.id, dureeMinutes: 50 }).returning();

  // Un exercice par pilier posé, avec une série chacun.
  for (const [i, pilier] of PILIERS_POSES.entries()) {
    const [ex] = await db.insert(schema.exercises).values({
      userId: null, nom: `Exercice ${pilier}`, pilier, profilTension: "mi_range",
      type: "polyarticulaire", categorieRole: "pilier",
      musclesPrincipaux: ["pectoraux"], musclesSecondaires: [], equipement: "machine",
      slug: `${pilier.toLowerCase()}-${U.slice(0, 8)}`,
    }).returning();
    const [instance] = await db.insert(schema.exerciseInstances).values({
      userId: U, exerciseId: ex!.id, gymId: salle!.id, machineNom: `Poste ${i + 1}`,
      conventionCharge: "poids_total",
    }).returning();
    await db.insert(schema.setLogs).values({
      sessionLogId: seance!.id, exerciseInstanceId: instance!.id,
      numeroSerie: 1, repsEffectuees: 10, charge: 50 + i, rpeEffectif: 8,
    });
  }
});

describe("les clés rendues sont celles du modèle", () => {
  it("les quatre piliers posés ressortent, sous leur nom exact", async () => {
    const semaines = await volume();
    const cles = new Set(semaines.flatMap((s) => Object.keys(s)));
    for (const pilier of PILIERS_POSES) {
      expect([...cles], `${pilier} absent du volume rendu`).toContain(pilier);
    }
  });

  it("aucune clé n'est passée en minuscules", async () => {
    // La transformation qui cassait tout, et qui ne se voyait qu'à l'écran.
    const semaines = await volume();
    for (const cle of semaines.flatMap((s) => Object.keys(s))) {
      if (cle === "week") continue;
      expect(cle, `${cle} n'est pas une clé du modèle`).not.toMatch(/^p[1-4]_/);
    }
  });

  it("toute clé rendue est connue de l'écran", async () => {
    // Le contrat exact que le graphique consomme : il ne trace que les séries
    // qu'il sait nommer et colorer. Une clé hors de cette liste disparaît.
    const connues = new Set<string>([...PILIERS, "autre", "week"]);
    const semaines = await volume();
    for (const cle of semaines.flatMap((s) => Object.keys(s))) {
      expect([...connues], `${cle} serait ignorée par l'écran`).toContain(cle);
    }
  });

  it("chaque pilier posé occupe son propre rang de série", () => {
    // La couleur se cherche sur la clé EXACTE : en minuscules, les quatre
    // piliers tombaient sur le même repli et l'empilement devenait monochrome.
    // C'est le rang qu'on vérifie, pas la couleur : hors navigateur, elles
    // rendent toutes le même repli et une comparaison de couleurs passerait
    // même avec le défaut en place.
    const rangs = PILIERS_POSES.map((p) => slotDeSerie(p));
    expect(new Set(rangs).size).toBe(PILIERS_POSES.length);
    // Et la forme fautive retombe bien sur le rang de repli.
    expect(slotDeSerie("p1_poussee")).toBe(8);
  });

  it("le volume vaut charge × répétitions, sans arrondi fantaisiste", async () => {
    const semaines = await volume();
    const total = semaines.reduce((somme, s) => {
      for (const [cle, valeur] of Object.entries(s)) {
        if (cle !== "week" && typeof valeur === "number") somme += valeur;
      }
      return somme;
    }, 0);
    // 10 reps × (50 + 51 + 52 + 53)
    expect(total).toBe(10 * (50 + 51 + 52 + 53));
  });
});
