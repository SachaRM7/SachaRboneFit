/**
 * Un compte représentatif, pour mesurer sur autre chose qu'une base vide.
 *
 * Les proportions viennent de la production : une salle de 123 appareils dont
 * 122 disponibles, un catalogue de 120 exercices, un bloc de quatre séances de
 * six exercices, et une dizaine de séances réalisées avec leurs séries. Une
 * base à trois lignes ne révèle aucun N+1.
 */
import { config } from "dotenv";
import path from "node:path";
import { randomUUID } from "node:crypto";

config({ path: path.resolve(process.cwd(), ".env.local") });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL requis");

const PILIERS = ["P1_poussee", "P2_tirage", "P3_squat", "P4_hanche", "epaules", "bras_biceps", "bras_triceps", "core"];
const MUSCLES = ["pectoraux", "dorsaux", "quadriceps", "ischios", "epaules", "biceps", "triceps", "fessiers"];

async function main() {
  const { db } = await import("../db/client");
  const schema = await import("../db/schema");

  const userId = randomUUID();
  await db.insert(schema.users).values({
    id: userId, email: `mesure-${userId.slice(0, 8)}@t.test`, nom: "Mesure",
    onboardingTermineLe: new Date(), dureeSeanceCibleMinutes: 60, dureeSeanceMaxMinutes: 90,
    frequenceCibleParSemaine: 3, frequenceMinParSemaine: 2, frequenceMaxParSemaine: 4,
  });

  const [salle] = await db.insert(schema.gyms).values({
    userId, nom: "St-Martin-Du-Touch (mesure)", inventaireStatut: "complet",
    equipementsDisponibles: ["machine", "poulie", "halteres", "barre"],
  }).returning();

  // 120 exercices au catalogue, comme en production.
  const exercices = [];
  for (let i = 0; i < 120; i++) {
    const [e] = await db.insert(schema.exercises).values({
      userId: null, nom: `Exercice ${i}`, pilier: PILIERS[i % PILIERS.length]!,
      profilTension: ["stretch", "mi_range", "contract"][i % 3]!,
      type: i % 3 === 0 ? "polyarticulaire" : "isolation",
      categorieRole: i % 5 === 0 ? "pilier" : i % 3 === 0 ? "substitut" : "accessoire",
      musclesPrincipaux: [MUSCLES[i % MUSCLES.length]!],
      musclesSecondaires: [MUSCLES[(i + 1) % MUSCLES.length]!],
      equipement: ["machine", "poulie", "halteres", "barre"][i % 4]!,
      slug: `mesure-${i}-${userId.slice(0, 6)}`,
    }).returning();
    exercices.push(e!);
  }

  // 123 instances dans la salle, dont une hors service.
  const instances = [];
  for (let i = 0; i < 123; i++) {
    const [inst] = await db.insert(schema.exerciseInstances).values({
      userId, exerciseId: exercices[i % exercices.length]!.id, gymId: salle!.id,
      machineNom: `Poste ${i}`, conventionCharge: "pile_affichee", natureCharge: "resistance",
      incrementsPossibles: [2.5, 5], chargeMinimale: 5, chargeMax: 120,
      etat: i === 122 ? "temporairement_indisponible" : "disponible",
    }).returning();
    instances.push(inst!);
  }

  const [bloc] = await db.insert(schema.programmeBlocs).values({
    userId, nom: "Bloc de mesure", dateDebut: "2026-08-01", typeCycle: "volume", actif: true,
  }).returning();

  const gabarits = [];
  for (const [index, lettre] of ["A", "B", "C", "D"].entries()) {
    const [t] = await db.insert(schema.seanceTemplates).values({
      blocId: bloc!.id, lettre, nom: `Séance ${lettre}`, ordreDansSemaine: index + 1,
    }).returning();
    gabarits.push(t!);
    for (let j = 0; j < 6; j++) {
      await db.insert(schema.exerciseInTemplate).values({
        seanceTemplateId: t!.id, exerciseInstanceId: instances[index * 6 + j]!.id,
        ordre: j + 1, seriesCibles: 3, fourchetteRepsMin: 8, fourchetteRepsMax: 12,
        reposSecondes: 120, rpeCible: 8,
      });
    }
  }

  // Douze séances réalisées, avec plan et séries.
  for (let s = 0; s < 12; s++) {
    const gabarit = gabarits[s % gabarits.length]!;
    const date = new Date(Date.UTC(2026, 7, 1 + s * 2)).toISOString().slice(0, 10);
    const [seance] = await db.insert(schema.sessionLogs).values({
      userId, date, gymId: salle!.id, seanceTemplateId: gabarit.id,
      dureeMinutes: 58, energieFin: 7, feuBiologiqueJour: "vert",
    }).returning();

    const lignes = await db.query.exerciseInTemplate.findMany({
      where: (e, { eq }) => eq(e.seanceTemplateId, gabarit.id),
    });
    for (const [ordre, ligne] of lignes.entries()) {
      await db.insert(schema.sessionPlanItems).values({
        sessionLogId: seance!.id, ordre: ordre + 1,
        exerciseInstanceId: ligne.exerciseInstanceId, exerciseInTemplateId: ligne.id,
        seriesCibles: 3, fourchetteRepsMin: 8, fourchetteRepsMax: 12,
        reposSecondes: 120, statut: "fait",
      });
      for (let n = 1; n <= 3; n++) {
        await db.insert(schema.setLogs).values({
          sessionLogId: seance!.id, exerciseInstanceId: ligne.exerciseInstanceId,
          numeroSerie: n, repsEffectuees: 10, charge: 40 + s, rpeEffectif: 8,
          reposReelSecondes: 115,
        });
      }
    }
    await db.insert(schema.bodyWeights).values({ userId, date, poids: 90 - s * 0.1 });
  }

  console.log(`compte de mesure : ${userId}`);
  console.log(`  120 exercices, 123 instances, 4 séances, 12 séances réalisées, 216 séries`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
