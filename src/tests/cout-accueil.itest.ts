import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Ce que coûte l'accueil, compté à la source.
 *
 * L'écran attendait une trentaine de requêtes avant son premier pixel. Avec
 * une seule connexion au pool — décision assumée, le pooler Supabase sature
 * au-delà — elles ne se recouvrent pas : elles s'additionnent, chacune payant
 * sa latence vers une base qui vit dans une autre région.
 *
 * Il a donc été coupé en deux : ce dont dépend la décision du moment, et ce
 * qui arrive derrière une limite de suspension. Cette coupe n'a d'intérêt que
 * si la première moitié est RÉELLEMENT plus courte — sinon on a déplacé du
 * code sans rien retirer du chemin critique.
 *
 * Ce fichier le vérifie en comptant les requêtes qui partent vraiment, à
 * l'endroit où elles partent. Les seuils sont des plafonds, pas des cibles :
 * ils empêchent la dérive silencieuse, celle où l'on rajoute une lecture par
 * commit jusqu'à revenir au point de départ.
 */

const utilisateur = randomUUID();

const { db, compterRequetes } = await import("@/db/client");
const schema = await import("@/db/schema");
const { eq } = await import("drizzle-orm");
const { essentielTableauDeBord, complementTableauDeBord, donneesTableauDeBord } =
  await import("@/services/tableau-de-bord");

beforeAll(async () => {
  await db.insert(schema.users).values({
    id: utilisateur,
    email: `cout-${utilisateur.slice(0, 8)}@test.local`,
    nom: "Mesure",
  });
});

afterAll(async () => {
  await db.delete(schema.users).where(eq(schema.users.id, utilisateur));
});

/** Mesuré une fois, relu par plusieurs assertions. */
let essentiel = 0;
let complement = 0;
let complet = 0;

beforeAll(async () => {
  essentiel = (await compterRequetes(() => essentielTableauDeBord(utilisateur))).requetes;
  complement = (await compterRequetes(() => complementTableauDeBord(utilisateur))).requetes;
  complet = (await compterRequetes(() => donneesTableauDeBord(utilisateur))).requetes;
});

describe("le chemin critique de l'accueil", () => {
  it("tient en une dizaine de requêtes", () => {
    // Le compte réel sur un compte vide : identité, poids, dernière séance,
    // prochaine séance, état du jour, séances de la semaine, salles, blocs,
    // mémoire des empêchements, et l'inventaire quand une salle est choisie.
    expect(essentiel).toBeLessThanOrEqual(12);
  });

  it("est plus court que ce qui attend derrière", () => {
    // Si la moitié différée n'était pas la plus lourde, la coupe n'aurait
    // servi à rien : c'est elle qui portait `vueDuProgramme` et `alertes`.
    expect(complement).toBeGreaterThan(essentiel);
  });

  it("et bien plus court que l'accueil entier", () => {
    // La comparaison qui compte : ce qu'on attendait avant de voir quoi que
    // ce soit, et ce qu'on attend maintenant.
    expect(essentiel).toBeLessThan(complet / 2);
  });
});

describe("le découpage n'a rien fait payer deux fois", () => {
  it("les deux moitiés réunies ne coûtent pas plus que l'accueil entier", () => {
    // Hors rendu React, `cache()` ne mémoïse rien : les deux moitiés relisent
    // chacune les blocs, la mémoire et les salles. Trois lectures en double,
    // pas davantage — et aucune sous un vrai rendu, où la mémoïsation joue.
    expect(essentiel + complement).toBeLessThanOrEqual(complet + 3);
  });
});
