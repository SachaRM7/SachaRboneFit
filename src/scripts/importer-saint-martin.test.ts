import { describe, expect, it } from "vitest";
import {
  APPAREILS_NON_IMPORTES,
  GYM_CIBLE,
  INVENTAIRE,
  refusHistoriqueImport,
} from "./importer-saint-martin";
import { MATRICE_COUVERTURE } from "./audit-couverture-saint-martin";
import { CATALOGUE } from "@/lib/referentiels/catalogue";
import { besoinDe } from "@/lib/referentiels/capacites";
import { porteeDeLaMesure } from "@/lib/engine/charges";
import { getTableConfig } from "drizzle-orm/pg-core";
import { exerciseInstances } from "@/db/schema";

describe("inventaire Saint-Martin", () => {
  it("cible exclusivement la salle de production existante", () => {
    expect(GYM_CIBLE).toEqual({
      id: "a29c5180-3393-48a1-94f9-25f69d29b3f8",
      nom: "St-Martin-Du-Touch",
    });
  });

  it("ne déduit aucun incrément et réserve les paliers aux mesures terrain", () => {
    expect(INVENTAIRE).toHaveLength(99);
    expect(INVENTAIRE.every((item) => !("incrementsPossibles" in item))).toBe(true);
    const avecPaliers = INVENTAIRE.filter((item) => item.paliersCharges);
    expect(new Set(avecPaliers.map((item) => item.machineNom))).toEqual(new Set([
      "Sortie de poulie réglable",
      "Station double à poulies réglables",
      "Lat Pulldown dédié",
      "Low Row dédié",
      "Pupitre preacher + barres fixes",
    ]));
  });

  it("exprime les haltères par main et les doubles poulies par côté", () => {
    expect(INVENTAIRE.filter((item) => item.machineNom.startsWith("Haltères")))
      .toHaveLength(30);
    expect(INVENTAIRE.filter((item) => item.machineNom.startsWith("Haltères"))
      .every((item) => item.conventionCharge === "poids_par_main")).toBe(true);
    expect(INVENTAIRE.filter((item) => item.typePoulie === "double")
      .every((item) => item.conventionCharge === "pile_par_cote")).toBe(true);
  });

  it("audite chaque slug du catalogue sans angle mort", () => {
    expect(MATRICE_COUVERTURE).toHaveLength(120);
    expect(new Set(MATRICE_COUVERTURE.map((item) => item.slug)).size).toBe(120);
    expect(MATRICE_COUVERTURE.filter((item) => item.raisonSiAbsente === "NON AUDITÉ"))
      .toEqual([]);
    expect(MATRICE_COUVERTURE.filter((item) => item.physiquementFaisable
      && !item.instanceExistante).map((item) => item.slug).sort())
      .toEqual(["dead-bug", "push-up"]);
  });

  it("ne traite universellement aucun bodyweight qui exige un support", () => {
    const universels = CATALOGUE
      .filter((item) => item.equipement === "poids_du_corps"
        && besoinDe(item.slug, item.equipement) === "poids_du_corps")
      .map((item) => item.slug)
      .sort();
    expect(universels).toEqual(["dead-bug", "push-up"]);
  });

  it("exclut chest-dip tant que le mode assisté ou libre n'est pas validé", () => {
    expect(INVENTAIRE.some((item) => item.slug === "chest-dip")).toBe(false);
    expect(MATRICE_COUVERTURE.find((item) => item.slug === "chest-dip"))
      .toMatchObject({ physiquementFaisable: false, instanceExistante: false });
  });

  it("garde chaque Smith comme indice local, jamais comme kilos globaux", () => {
    const smith = INVENTAIRE.filter((item) => item.machineNom === "Smith machine");
    expect(smith).toHaveLength(3);
    for (const item of smith) {
      expect(porteeDeLaMesure({
        natureCharge: item.natureCharge ?? "resistance",
        conventionCharge: item.conventionCharge,
      })).toBe("indice_local");
    }
  });

  it("fige les paliers terrain du preacher curl", () => {
    expect(INVENTAIRE.find((item) => item.slug === "preacher-curl")).toMatchObject({
      machineNom: "Pupitre preacher + barres fixes",
      conventionCharge: "poids_total",
      paliersCharges: [10, 15, 20, 25, 30],
      chargeMinimale: 10,
      chargeMax: 30,
    });
  });

  it("décrit bench-dip sans inventer de poids corporel dans charge", () => {
    expect(INVENTAIRE.find((item) => item.slug === "bench-dip")).toMatchObject({
      machineNom: "Banc plat",
      conventionCharge: "sans_charge",
    });
  });

  it("refuse de réinterpréter une instance ayant un historique actif", () => {
    const item = INVENTAIRE.find((entry) => entry.slug === "preacher-curl")!;
    const active = {
      convention_charge: "pile_affichee",
      nature_charge: "resistance",
      paliers_charges: null,
      charge_minimale: 4.5,
      historique_actif: true,
    };
    expect(refusHistoriqueImport(active, item)).toMatch(/changerait le sens/);
    expect(refusHistoriqueImport({ ...active, historique_actif: false }, item)).toBeNull();
  });

  it("impose l'unicité de l'identité logique des instances actives", () => {
    const index = getTableConfig(exerciseInstances).indexes.find(
      (candidate) => candidate.config.name === "exercise_instances_active_identity_unique",
    );
    expect(index?.config.unique).toBe(true);
    expect(index?.config.where).toBeDefined();
  });

  it("porte correctement la topologie des poulies et le sens de l'assistance", () => {
    expect(INVENTAIRE.filter((item) => item.machineNom === "Sortie de poulie réglable"))
      .toHaveLength(16);
    expect(INVENTAIRE.filter((item) => item.machineNom === "Station double à poulies réglables"))
      .toHaveLength(3);
    expect(INVENTAIRE.filter((item) => item.machineNom === "Dip/Chin Assist"
      && item.natureCharge === "assistance"))
      .toHaveLength(3);
    expect(INVENTAIRE.filter((item) => item.machineNom === "Dip/Chin Assist")
      .filter((item) => item.natureCharge === "assistance")
      .every((item) => item.chargeMax === 68)).toBe(true);
  });

  it("écarte les trous de catalogue et le faux mapping Perfect Squat", () => {
    expect(INVENTAIRE.some((item) => item.machineNom.includes("Perfect Squat"))).toBe(false);
    expect(INVENTAIRE.some((item) => item.slug === "belt-squat")).toBe(false);
    expect(APPAREILS_NON_IMPORTES.join(" ")).toContain("Perfect Squat");
  });

  it("distingue les appareils partageant un même exercice", () => {
    const chestPresses = INVENTAIRE.filter((item) => item.slug === "machine-chest-press");
    expect(chestPresses.map((item) => item.machineNom)).toEqual(["Chest Press", "Converging Chest Press"]);
    const latPulldowns = INVENTAIRE.filter((item) => item.slug === "lat-pulldown");
    expect(latPulldowns.map((item) => item.machineNom)).toEqual(["Lat Pulldown dédié", "Lat Pulldown à pile"]);
  });
});
