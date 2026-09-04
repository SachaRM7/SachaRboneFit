import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Ce que coûte l'accueil, compté à la source — et ce qu'il répond, comparé au
 * chemin qu'il remplace.
 *
 * L'écran attendait une trentaine de requêtes avant son premier pixel. Avec
 * une seule connexion au pool — décision assumée, le pooler Supabase sature
 * au-delà — elles ne se recouvrent pas : elles s'additionnent, chacune payant
 * sa latence vers une base qui vit sur un autre continent.
 *
 * Deux corrections successives, et ce fichier tient les deux :
 *
 *   1. l'écran est coupé en deux — ce dont dépend la décision du moment, et ce
 *      qui arrive derrière une limite de suspension ;
 *   2. le chemin critique lit en DEUX allers-retours au lieu de treize, par
 *      une requête composée.
 *
 * La seconde est la plus risquée : elle réécrit en SQL brut des lectures que
 * l'ORM produisait. Une divergence y serait silencieuse — une rotation qui
 * avance d'une lettre de trop, une séance abandonnée comptée comme faite. Le
 * deuxième bloc de ce fichier compare donc les deux chemins sur les mêmes
 * données, plutôt que de vérifier que le nouveau « a l'air correct ».
 */

const utilisateur = randomUUID();

const { db, compterRequetes } = await import("@/db/client");
const schema = await import("@/db/schema");
const { essentielTableauDeBord, complementTableauDeBord, donneesTableauDeBord } =
  await import("@/services/tableau-de-bord");
const { prochaineSeance } = await import("@/services/programmes");
const { contexteEssentiel } = await import("@/services/tableau-de-bord-lecture");

/** Les gabarits du bloc, dans l'ordre de la semaine. */
const gabarits: string[] = [];
let salle = "";

beforeAll(async () => {
  await db.insert(schema.users).values({
    id: utilisateur,
    email: `cout-${utilisateur.slice(0, 8)}@test.local`,
    nom: "Mesure",
    frequenceMaxParSemaine: 4,
  });

  const [g] = await db.insert(schema.gyms).values({
    userId: utilisateur, nom: `Lieu ${utilisateur.slice(0, 6)}`, equipementsDisponibles: [],
  }).returning();
  salle = g!.id;

  const [bloc] = await db.insert(schema.programmeBlocs).values({
    userId: utilisateur, nom: "Bloc de mesure", dateDebut: "2026-09-01",
    typeCycle: "calibration", actif: true,
  }).returning();

  for (const [index, lettre] of ["A", "B", "C"].entries()) {
    const [t] = await db.insert(schema.seanceTemplates).values({
      blocId: bloc!.id, lettre, nom: `Séance ${lettre}`, ordreDansSemaine: index + 1,
    }).returning();
    gabarits.push(t!.id);
  }

  /*
   * Deux séances, et une seule compte.
   *
   * La première est CLOSE et porte une série : c'est celle qui fait avancer la
   * rotation. La seconde est ouverte sur le gabarit suivant et ne porte aucune
   * série — exactement le cas qui faisait avancer la rotation à tort avant que
   * le prédicat « réalisée » n'existe. Si la requête composée l'oubliait, elle
   * proposerait C au lieu de B, et le test le dirait.
   */
  const [faite] = await db.insert(schema.sessionLogs).values({
    userId: utilisateur, seanceTemplateId: gabarits[0]!, gymId: salle,
    date: "2026-09-02", dureeMinutes: 60, feuBiologiqueTendance: "orange",
  }).returning();

  const [exercice] = await db.insert(schema.exercises).values({
    userId: null, nom: "Développé", pilier: "P1_poussee", profilTension: "mi_range",
    type: "polyarticulaire", categorieRole: "pilier", musclesPrincipaux: ["pectoraux"],
    musclesSecondaires: [], equipement: "machine",
    slug: `dev-${utilisateur.slice(0, 8)}`,
  }).returning();
  const [instance] = await db.insert(schema.exerciseInstances).values({
    userId: utilisateur, exerciseId: exercice!.id, gymId: salle,
    machineNom: "Développé", conventionCharge: "poids_total",
    incrementsPossibles: [2.5], etat: "disponible",
  }).returning();

  await db.insert(schema.setLogs).values({
    sessionLogId: faite!.id, exerciseInstanceId: instance!.id,
    numeroSerie: 1, repsEffectuees: 10, charge: 40,
  });

  await db.insert(schema.sessionLogs).values({
    userId: utilisateur, seanceTemplateId: gabarits[1]!, gymId: salle,
    date: "2026-09-03",
  });

  await db.insert(schema.bodyWeights).values([
    { userId: utilisateur, date: "2026-09-01", poids: 80 },
    { userId: utilisateur, date: "2026-09-02", poids: 79.5 },
  ]);
});

/*
 * Rien n'est effacé à la fin : la suite tourne sur une base jetable, chaque
 * scénario porte son propre identifiant aléatoire, et une suppression en
 * cascade sur `users` casserait les clés étrangères d'un parc partagé.
 */

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
  it("tient en deux allers-retours vers la base", () => {
    // Un pour tout ce qui ne dépend que du compte, un pour le parc du lieu.
    // Le second ne part que s'il y a un lieu ; ce compte en a un.
    expect(essentiel).toBeLessThanOrEqual(2);
  });

  it("est beaucoup plus court que ce qui attend derrière", () => {
    // Si la moitié différée n'était pas la plus lourde, la coupe n'aurait
    // servi à rien : c'est elle qui porte `vueDuProgramme` et `alertes`.
    expect(complement).toBeGreaterThan(essentiel * 3);
  });

  it("et bien plus court que l'accueil entier", () => {
    expect(essentiel).toBeLessThan(complet / 4);
  });
});

describe("la requête composée dit la même chose que l'ORM", () => {
  it("désigne la même séance suivante", async () => {
    // Le chemin d'origine, inchangé, sert de témoin : trois requêtes, la même
    // règle de rotation. Les deux doivent tomber sur le même gabarit.
    const temoin = await prochaineSeance(utilisateur);
    const via = await essentielTableauDeBord(utilisateur);

    expect(temoin?.template.id).toBe(gabarits[1]);
    expect(via.prochaineSeance.templateId).toBe(temoin?.template.id);
    expect(via.prochaineSeance.lettre).toBe("B");
  });

  it("ne compte pas une séance ouverte sans série", async () => {
    // La séance du 03/09 est ouverte et vide. Si elle comptait, la rotation
    // proposerait C, et la semaine compterait deux séances au lieu d'une.
    const via = await essentielTableauDeBord(utilisateur);
    expect(via.prochaineSeance.lettre).toBe("B");

    // Et la semaine ne compte qu'elle : la lecture composée est interrogée
    // directement, parce que le décompte ne ressort pas de l'état du jour.
    const contexte = await contexteEssentiel(utilisateur, "2026-09-04", "2026-08-31");
    expect(contexte.semaine).toEqual(["2026-09-02"]);
  });

  it("rend l'identité, le poids et le feu de tendance", async () => {
    const via = await essentielTableauDeBord(utilisateur);
    expect(via.user.nom).toBe("Mesure");
    // La pesée la plus récente, pas la première insérée.
    expect(via.user.poidsActuel).toBe(79.5);
    expect(via.poids30jours).toHaveLength(2);
    expect(via.poids30jours[0]!.date).toBe("2026-09-02");
    expect(via.feuTendance).toBe("orange");
  });

  it("reconnaît le lieu et son parc", async () => {
    const via = await essentielTableauDeBord(utilisateur);
    expect(via.etat.salle?.id).toBe(salle);
    // Le lieu porte une machine décrite : il n'est pas annoncé vide.
    expect(via.etat.etat).not.toBe("salle_vide");
  });
});

describe("le découpage n'a rien fait payer deux fois", () => {
  it("les deux moitiés réunies ne coûtent pas plus que l'accueil entier", () => {
    // Hors rendu React, `cache()` ne mémoïse rien : les deux moitiés relisent
    // chacune ce qu'elles partagent. Quelques lectures en double, pas
    // davantage — et aucune sous un vrai rendu, où la mémoïsation joue.
    expect(essentiel + complement).toBeLessThanOrEqual(complet + 4);
  });
});
