import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * La résolution du contexte d'écran, contre une vraie base.
 *
 * Le point central : le client n'envoie qu'une désignation, et c'est le
 * serveur qui la transforme en données depuis la session authentifiée. Ce qui
 * se vérifie ici est donc autant ce qui est résolu que ce qui est REFUSÉ — un
 * objet désigné qui appartient à quelqu'un d'autre ne doit rien révéler.
 */

const U = randomUUID();
const AUTRE = randomUUID();
vi.mock("@/lib/supabase/auth-helper", () => ({ getAuthenticatedUserId: async () => U }));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { eq } = await import("drizzle-orm");
const { resoudreContexte } = await import("@/services/contexte-coach");
const { createCoachTools } = await import("@/lib/coach/tools");
const { contexteValide } = await import("@/lib/coach/contexte-ecran");
const { lundiDe, decalerDe } = await import("@/lib/semaines");

let blocMien = "";
let blocAutre = "";
let gabaritMien = "";
let salle = "";
let exo = "";
let instMienne = "";

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBeTruthy();
  for (const id of [U, AUTRE]) {
    await db.insert(schema.users).values({
      id, email: `${id}@t.test`, nom: "Testeur", onboardingTermineLe: new Date(),
    });
  }

  const debut = decalerDe(lundiDe(new Date().toISOString().slice(0, 10)), -14);

  const [b] = await db.insert(schema.programmeBlocs).values({
    userId: U, nom: "Mon bloc", dateDebut: debut, typeCycle: "volume", actif: true,
  }).returning();
  blocMien = b!.id;

  const [ba] = await db.insert(schema.programmeBlocs).values({
    userId: AUTRE, nom: "Bloc secret du voisin", dateDebut: debut, typeCycle: "volume", actif: true,
  }).returning();
  blocAutre = ba!.id;

  const [t] = await db.insert(schema.seanceTemplates).values({
    blocId: blocMien, lettre: "A", nom: "Haut du corps", ordreDansSemaine: 1,
  }).returning();
  gabaritMien = t!.id;

  const [e] = await db.insert(schema.exercises).values({
    userId: null, nom: "Developpe couche", pilier: "P1_poussee", profilTension: "mi_range",
    type: "polyarticulaire", categorieRole: "pilier", musclesPrincipaux: ["pectoraux"],
    musclesSecondaires: [], equipement: "barre", slug: `dev-${U.slice(0, 8)}`,
  }).returning();
  exo = e!.id;

  const [g] = await db.insert(schema.gyms).values({ userId: U, nom: `Salle ${U.slice(0, 8)}` }).returning();
  salle = g!.id;

  const [i] = await db.insert(schema.exerciseInstances).values({
    userId: U, exerciseId: exo, gymId: salle, machineNom: "Banc",
    conventionCharge: "poids_total", incrementsPossibles: [2.5],
  }).returning();
  instMienne = i!.id;

  await db.insert(schema.exerciseInTemplate).values({
    seanceTemplateId: gabaritMien, exerciseInstanceId: instMienne, ordre: 1,
    seriesCibles: 3, fourchetteRepsMin: 8, fourchetteRepsMax: 12, reposSecondes: 120,
  });
});

afterAll(async () => {
  await db.delete(schema.exerciseInTemplate).where(eq(schema.exerciseInTemplate.seanceTemplateId, gabaritMien));
  await db.delete(schema.seanceTemplates).where(eq(schema.seanceTemplates.id, gabaritMien));
  await db.delete(schema.programmeBlocs).where(eq(schema.programmeBlocs.userId, U));
  await db.delete(schema.programmeBlocs).where(eq(schema.programmeBlocs.userId, AUTRE));
  await db.delete(schema.exerciseInstances).where(eq(schema.exerciseInstances.gymId, salle));
  await db.delete(schema.gyms).where(eq(schema.gyms.id, salle));
  await db.delete(schema.exercises).where(eq(schema.exercises.id, exo));
  await db.delete(schema.users).where(eq(schema.users.id, U));
  await db.delete(schema.users).where(eq(schema.users.id, AUTRE));
});

describe("résolution du contexte d'écran", () => {
  it("ne résout rien sans contexte", async () => {
    expect(await resoudreContexte(U, null)).toEqual({ texte: null, refs: null });
  });

  it("ne fabrique aucun contexte sportif depuis l'écran « Plus »", async () => {
    const plus = await resoudreContexte(U, { ecran: "plus" });
    expect(plus.texte).toBeNull();
    expect(plus.refs).toEqual({ ecran: "plus", blocId: null, seanceTemplateId: null, exerciseInstanceId: null });
  });

  it("résout le cycle, la semaine réelle et la semaine type depuis Programme", async () => {
    const { texte } = await resoudreContexte(U, { ecran: "programme" });
    expect(texte).toContain("Mon bloc");
    expect(texte).toContain("Dominante volume");
    // Le bloc a démarré il y a deux semaines : ni « semaine 1 », ni le compteur figé.
    expect(texte).toContain("semaine 3");
    expect(texte).toContain("Haut du corps");
  });

  it("nomme l'objet regardé quand il appartient à l'utilisateur", async () => {
    const { texte } = await resoudreContexte(U, {
      ecran: "programme", typeEntite: "bloc", entiteId: blocMien,
    });
    expect(texte).toContain("Bloc regardé : « Mon bloc »");
  });

  it("ignore un objet qui appartient à quelqu'un d'autre", async () => {
    // Le cœur de la sécurité : un identifiant valide mais étranger ne
    // révèle rien. Le contexte de l'écran reste, l'objet est simplement ignoré.
    const { texte } = await resoudreContexte(U, {
      ecran: "programme", typeEntite: "bloc", entiteId: blocAutre,
    });
    expect(texte).not.toContain("Bloc secret du voisin");
    expect(texte).not.toContain("Bloc regardé");
    expect(texte).toContain("Mon bloc");
  });

  it("vérifie le propriétaire d'un gabarit par son bloc", async () => {
    const { texte } = await resoudreContexte(U, {
      ecran: "programme", typeEntite: "seance", entiteId: gabaritMien,
    });
    expect(texte).toContain("Séance regardée : Haut du corps");
  });

  it("nomme l'exercice regardé depuis Progression", async () => {
    const { texte } = await resoudreContexte(U, {
      ecran: "progression", typeEntite: "instance", entiteId: instMienne,
    });
    expect(texte).toContain("Exercice regardé : Developpe couche — Banc");
  });

  it("transmet l'intention déclarée", async () => {
    const { texte } = await resoudreContexte(U, { ecran: "programme", sujet: "modifier_programme" });
    expect(texte).toContain("modifier_programme");
  });

  it("ne laisse pas passer un identifiant d'utilisateur envoyé par le client", async () => {
    // Le contexte est nettoyé avant d'atteindre la résolution : même en
    // essayant, le client ne peut pas désigner les données d'un autre.
    const nettoye2 = contexteValide({
      ecran: "programme",
      userId: AUTRE,
      entiteId: blocAutre,
      typeEntite: "bloc",
    });
    const { texte } = await resoudreContexte(U, nettoye2);
    expect(texte).not.toContain("Bloc secret du voisin");
    expect(texte).toContain("Mon bloc");
  });

  it("donne l'exercice courant à l'outil sans que le modèle fournisse son ID", async () => {
    // Le point de la correction : « pourquoi cet exercice ? » ne nomme rien.
    // L'outil doit savoir de quoi on parle sans que le modèle recopie un UUID.
    const { texte, refs } = await resoudreContexte(U, {
      ecran: "progression", typeEntite: "instance", entiteId: instMienne,
    });
    expect(refs!.exerciseInstanceId).toBe(instMienne);
    expect(texte).toContain("Developpe couche");

    const outils = createCoachTools();
    // Arguments VIDES : tout vient du contexte résolu côté serveur.
    const res = await outils.executors.get_exercise_history!({}, U, refs!);
    expect(res.success).toBe(true);
  });

  it("refuse l'appel quand aucun exercice n'est désigné, ni par le modèle ni par l'écran", async () => {
    const outils = createCoachTools();
    const { refs } = await resoudreContexte(U, { ecran: "programme" });
    const res = await outils.executors.suggest_next_sets!({}, U, refs!);
    expect(res.success).toBe(false);
    expect(res.output).toMatch(/aucun exercice/i);
  });

  it("ne met jamais dans les références l'objet d'un autre utilisateur", async () => {
    const { refs } = await resoudreContexte(U, {
      ecran: "programme", typeEntite: "bloc", entiteId: blocAutre,
    });
    // Le bloc actif de l'utilisateur reste, celui du voisin n'entre pas.
    expect(refs!.blocId).toBe(blocMien);
    expect(refs!.blocId).not.toBe(blocAutre);
  });

  it("remplace les références au changement d'écran", async () => {
    const surProgression = await resoudreContexte(U, {
      ecran: "progression", typeEntite: "instance", entiteId: instMienne,
    });
    expect(surProgression.refs!.exerciseInstanceId).toBe(instMienne);

    // Naviguer ailleurs ne doit pas traîner l'objet précédent.
    const surProgramme = await resoudreContexte(U, { ecran: "programme" });
    expect(surProgramme.refs!.ecran).toBe("programme");
    expect(surProgramme.refs!.exerciseInstanceId).toBeNull();
  });

  it("zéro contexte reste zéro contexte", async () => {
    const rien = await resoudreContexte(U, null);
    expect(rien.refs).toBeNull();

    const outils = createCoachTools();
    // Sans références, un outil qui en dépend refuse plutôt que d'inventer.
    const res = await outils.executors.get_exercise_history!({}, U, undefined);
    expect(res.success).toBe(false);
  });
});
