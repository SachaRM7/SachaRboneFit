import { config } from "dotenv";
import path from "path";
import postgres from "postgres";
import { MOCK_USER_ID, MOCK_USER_EMAIL } from "@/lib/constants";

// Load .env.local explicitly
const projectRoot = path.resolve(__dirname, "../..");
config({ path: path.join(projectRoot, ".env.local") });

const db = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main() {
  console.log("🌱 Starting seed...");

  // 1. Reset tables
  await db.unsafe(`
    TRUNCATE TABLE
      set_logs, session_logs, daily_states,
      exercise_in_template, seance_templates, programme_blocs,
      exercise_instances, exercises, gyms, body_weights
      RESTART IDENTITY CASCADE
  `);
  console.log("✅ Tables reset");

  // 2. User
  await db`INSERT INTO users (id, email, nom, date_naissance, taille, phase_nutritionnelle, objectif_chiffre, date_cible)
    VALUES (${MOCK_USER_ID}, ${MOCK_USER_EMAIL}, 'Sacha', '2001-02-22', 193, 'seche', '93 kg masse propre été 2026', '2026-08-01')
    ON CONFLICT (id) DO NOTHING`;
  console.log("✅ User inserted");

  // 3. Gyms
  const lalande = (await db`INSERT INTO gyms (user_id, nom, horaires_ouverture, est_24h, notes)
    VALUES (${MOCK_USER_ID}, 'BasicFit Lalande', 'ferme 22h', false, 'Proche domicile, défaut')
    RETURNING id`.then(r => r[0]))!;

  const sesquiere = (await db`INSERT INTO gyms (user_id, nom, horaires_ouverture, est_24h, notes)
    VALUES (${MOCK_USER_ID}, 'BasicFit Sesquière', '24/24', true, 'Tardives, jours fériés')
    RETURNING id`.then(r => r[0]))!;
  console.log("✅ Gyms inserted");

  // 4. Exercises
  const exerciseData = [
    { nom: "Lying Machine Chest Press", pilier: "P1_poussee", profil_tension: "mi_range", type: "polyarticulaire", categorie_role: "pilier", muscles_principaux: ["pecs", "epaule_ant"] },
    { nom: "Bench Press Barre", pilier: "P1_poussee", profil_tension: "mi_range", type: "polyarticulaire", categorie_role: "pilier", muscles_principaux: ["pecs", "triceps", "epaule_ant"] },
    { nom: "Seated Pec Fly", pilier: "P1_poussee", profil_tension: "stretch", type: "isolation", categorie_role: "accessoire", muscles_principaux: ["pecs"] },
    { nom: "Seated Row Machine", pilier: "P2_tirage", profil_tension: "mi_range", type: "polyarticulaire", categorie_role: "pilier", muscles_principaux: ["dos", "biceps"] },
    { nom: "Wide-Grip Seated Cable Row", pilier: "P2_tirage", profil_tension: "mi_range", type: "polyarticulaire", categorie_role: "substitut", muscles_principaux: ["dos", "biceps"] },
    { nom: "Close-Grip Front Lat Pulldown", pilier: "P2_tirage", profil_tension: "stretch", type: "polyarticulaire", categorie_role: "accessoire", muscles_principaux: ["dos", "biceps"] },
    { nom: "Wide Stance Hack Squat (Matrix Perfect Squat)", pilier: "P3_squat", profil_tension: "stretch", type: "polyarticulaire", categorie_role: "pilier", muscles_principaux: ["quads", "fessiers"] },
    { nom: "Hack Squat Machine", pilier: "P3_squat", profil_tension: "stretch", type: "polyarticulaire", categorie_role: "pilier", muscles_principaux: ["quads", "fessiers"] },
    { nom: "Leg Press", pilier: "P3_squat", profil_tension: "stretch", type: "polyarticulaire", categorie_role: "pilier", muscles_principaux: ["quads", "fessiers"] },
    { nom: "Seated Leg Extension", pilier: "jambes_iso", profil_tension: "contract", type: "isolation", categorie_role: "accessoire", muscles_principaux: ["quads"] },
    { nom: "Romanian Deadlift", pilier: "P4_hanche", profil_tension: "stretch", type: "polyarticulaire", categorie_role: "pilier", muscles_principaux: ["ischios", "fessiers"] },
    { nom: "Hip Thrust Barre", pilier: "P4_hanche", profil_tension: "contract", type: "polyarticulaire", categorie_role: "pilier", muscles_principaux: ["fessiers", "ischios"] },
    { nom: "Seated Leg Curl", pilier: "jambes_iso", profil_tension: "contract", type: "isolation", categorie_role: "accessoire", muscles_principaux: ["ischios"] },
    { nom: "Standing Military Press Machine", pilier: "epaules", profil_tension: "mi_range", type: "polyarticulaire", categorie_role: "pilier", muscles_principaux: ["epaule", "triceps"] },
    { nom: "Machine Lateral Raise", pilier: "epaules", profil_tension: "contract", type: "isolation", categorie_role: "accessoire", muscles_principaux: ["epaule_lat"] },
    { nom: "Cable Lateral Raise", pilier: "epaules", profil_tension: "stretch", type: "isolation", categorie_role: "accessoire", muscles_principaux: ["epaule_lat"] },
    { nom: "Face Pull Cable", pilier: "epaules", profil_tension: "contract", type: "isolation", categorie_role: "accessoire", muscles_principaux: ["epaule_post", "rotateurs"] },
    { nom: "EZ-Bar Preacher Curl", pilier: "bras_biceps", profil_tension: "contract", type: "isolation", categorie_role: "accessoire", muscles_principaux: ["biceps"] },
    { nom: "Incline DB Twist Curl", pilier: "bras_biceps", profil_tension: "stretch", type: "isolation", categorie_role: "accessoire", muscles_principaux: ["biceps"] },
    { nom: "Overhead Cable Triceps Extension", pilier: "bras_triceps", profil_tension: "stretch", type: "isolation", categorie_role: "accessoire", muscles_principaux: ["triceps"] },
    { nom: "Triceps Pushdown", pilier: "bras_triceps", profil_tension: "contract", type: "isolation", categorie_role: "accessoire", muscles_principaux: ["triceps"] },
    { nom: "Pallof Press", pilier: "core", profil_tension: "mi_range", type: "isolation", categorie_role: "accessoire", muscles_principaux: ["core"] },
    { nom: "Back Extension", pilier: "P4_hanche", profil_tension: "mi_range", type: "polyarticulaire", categorie_role: "substitut", muscles_principaux: ["ischios", "fessiers"] },
  ];

  const insertedExercises: any[] = [];
  for (const e of exerciseData) {
    const row = (await db`INSERT INTO exercises (user_id, nom, pilier, profil_tension, type, categorie_role, muscles_principaux)
      VALUES (${MOCK_USER_ID}, ${e.nom}, ${e.pilier}, ${e.profil_tension}, ${e.type}, ${e.categorie_role}, ${JSON.stringify(e.muscles_principaux)}::jsonb)
      RETURNING *`.then(r => r[0]))!;
    insertedExercises.push(row);
  }
  console.log(`✅ ${insertedExercises.length} exercises inserted`);

  // 5. Exercise Instances (Lalande)
  const chestPressEx = insertedExercises.find((e: any) => e.nom === "Lying Machine Chest Press")!;
  const hackSquatEx = insertedExercises.find((e: any) => e.nom === "Wide Stance Hack Squat (Matrix Perfect Squat)")!;
  const pecFlyEx = insertedExercises.find((e: any) => e.nom === "Seated Pec Fly")!;
  const lateralRaiseEx = insertedExercises.find((e: any) => e.nom === "Machine Lateral Raise")!;
  const tricepsExtEx = insertedExercises.find((e: any) => e.nom === "Overhead Cable Triceps Extension")!;
  const pallofEx = insertedExercises.find((e: any) => e.nom === "Pallof Press")!;
  const pressEx = insertedExercises.find((e: any) => e.nom === "Standing Military Press Machine")!;
  const rowEx = insertedExercises.find((e: any) => e.nom === "Wide-Grip Seated Cable Row")!;
  const curlEx = insertedExercises.find((e: any) => e.nom === "EZ-Bar Preacher Curl")!;

  const instanceData = [
    { exerciseId: chestPressEx.id, machineNom: "Lying Machine Chest Press", typePoulie: "na", conventionCharge: "pile_affichee", incrementsPossibles: [5], poidsNonCompte: null },
    { exerciseId: hackSquatEx.id, machineNom: "Matrix Perfect Squat", typePoulie: "na", conventionCharge: "disques_ajoutes", incrementsPossibles: [2.5, 5, 10, 15, 20], poidsNonCompte: 30.4 },
    { exerciseId: pecFlyEx.id, machineNom: "Seated Pec Fly réglage 1", typePoulie: "na", conventionCharge: "pile_affichee", incrementsPossibles: [5], poidsNonCompte: null },
    { exerciseId: lateralRaiseEx.id, machineNom: "Machine Lateral Raise Lalande", typePoulie: "na", conventionCharge: "pile_affichee", incrementsPossibles: [6], poidsNonCompte: null },
    { exerciseId: tricepsExtEx.id, machineNom: "Cable poulie simple", typePoulie: "simple", conventionCharge: "pile_affichee", incrementsPossibles: [2.3, 4.5, 6.8, 9, 11.3, 13.5], poidsNonCompte: null },
    { exerciseId: pallofEx.id, machineNom: "Cable poulie simple", typePoulie: "simple", conventionCharge: "pile_affichee", incrementsPossibles: [2.3, 4.5, 6.8, 9, 11.3, 13.5], poidsNonCompte: null },
    { exerciseId: pressEx.id, machineNom: "Standing Military Press", typePoulie: "na", conventionCharge: "pile_affichee", incrementsPossibles: [5], poidsNonCompte: null },
    { exerciseId: rowEx.id, machineNom: "Cable Row", typePoulie: "simple", conventionCharge: "pile_affichee", incrementsPossibles: [2.5, 5], poidsNonCompte: null },
    { exerciseId: curlEx.id, machineNom: "Preacher Curl", typePoulie: "na", conventionCharge: "poids_total", incrementsPossibles: [1.25, 2.5, 5], poidsNonCompte: null },
  ];

  const instances: any[] = [];
  for (const inst of instanceData) {
    const row = (await db`INSERT INTO exercise_instances (user_id, exercise_id, gym_id, machine_nom, type_poulie, convention_charge, increments_possibles, poids_non_compte)
      VALUES (${MOCK_USER_ID}, ${inst.exerciseId}, ${lalande.id}, ${inst.machineNom}, ${inst.typePoulie}, ${inst.conventionCharge}, ${JSON.stringify(inst.incrementsPossibles)}::jsonb, ${inst.poidsNonCompte})
      RETURNING *`.then(r => r[0]))!;
    instances.push(row);
  }
  console.log(`✅ ${instances.length} exercise instances inserted`);

  const [chestPressInst, hackSquatInst] = instances;

  // 6. Bloc + Templates
  const bloc = (await db`INSERT INTO programme_blocs (user_id, nom, date_debut, type_cycle, semaine_actuelle, actif)
    VALUES (${MOCK_USER_ID}, 'Bloc 1 Cycle 1 Mécanique', '2026-04-01', 'mecanique', 1, true)
    RETURNING *`.then(r => r[0]))!;
  console.log("✅ Programme bloc inserted");

  const seanceData = [
    { lettre: "A", nom: "Séance A - Poussette + Quadriceps", ordre: 1 },
    { lettre: "B", nom: "Séance B - Tirage + Ischio", ordre: 2 },
    { lettre: "C", nom: "Séance C - Epaule + Bras", ordre: 3 },
  ];

  const seances: any[] = [];
  for (const s of seanceData) {
    const row = (await db`INSERT INTO seance_templates (bloc_id, lettre, nom, ordre_dans_semaine)
      VALUES (${bloc.id}, ${s.lettre}, ${s.nom}, ${s.ordre})
      RETURNING *`.then(r => r[0]))!;
    seances.push(row);
  }
  console.log("✅ Seance templates inserted");

  const [seanceA, seanceB, seanceC] = seances;

  // 7. ExerciseInTemplate
  await db`INSERT INTO exercise_in_template (seance_template_id, exercise_instance_id, ordre, series_cibles, fourchette_reps_min, fourchette_reps_max, rpe_cible, tempo, repos_secondes)
    VALUES (${seanceA.id}, ${chestPressInst.id}, 1, 4, 6, 8, 8, '3010', 120)`;
  await db`INSERT INTO exercise_in_template (seance_template_id, exercise_instance_id, ordre, series_cibles, fourchette_reps_min, fourchette_reps_max, rpe_cible, tempo, repos_secondes)
    VALUES (${seanceA.id}, ${hackSquatInst.id}, 2, 4, 8, 10, 8, '3010', 120)`;
  console.log("✅ Exercise in template inserted");

  // 8. SessionLog 06/04/2026
  const sessionLog1 = (await db`INSERT INTO session_logs (user_id, seance_template_id, date, gym_id, duree_minutes, energie_fin, feu_biologique_jour, volume_ajuste_pct, volume_ajuste_raison)
    VALUES (${MOCK_USER_ID}, ${seanceA.id}, '2026-04-06', ${lalande.id}, 65, 70, 'orange', -25, 'sommeil 4h seulement')
    RETURNING *`.then(r => r[0]))!;

  await db`INSERT INTO set_logs (session_log_id, exercise_instance_id, numero_serie, reps_effectuees, charge, rpe_effectif)
    VALUES (${sessionLog1.id}, ${chestPressInst.id}, 1, 6, 80, 8)`;
  await db`INSERT INTO set_logs (session_log_id, exercise_instance_id, numero_serie, reps_effectuees, charge, rpe_effectif)
    VALUES (${sessionLog1.id}, ${chestPressInst.id}, 2, 6, 80, 8)`;
  await db`INSERT INTO set_logs (session_log_id, exercise_instance_id, numero_serie, reps_effectuees, charge, rpe_effectif)
    VALUES (${sessionLog1.id}, ${chestPressInst.id}, 3, 6, 80, 8)`;
  await db`INSERT INTO set_logs (session_log_id, exercise_instance_id, numero_serie, reps_effectuees, charge, rpe_effectif)
    VALUES (${sessionLog1.id}, ${hackSquatInst.id}, 1, 8, 60, 8)`;
  await db`INSERT INTO set_logs (session_log_id, exercise_instance_id, numero_serie, reps_effectuees, charge, rpe_effectif)
    VALUES (${sessionLog1.id}, ${hackSquatInst.id}, 2, 8, 60, 8)`;
  await db`INSERT INTO set_logs (session_log_id, exercise_instance_id, numero_serie, reps_effectuees, charge, rpe_effectif)
    VALUES (${sessionLog1.id}, ${hackSquatInst.id}, 3, 8, 60, 8)`;
  console.log("✅ Session log 06/04 inserted");

  // 9. SessionLog 04/04/2026 (sans dailyState)
  await db`INSERT INTO session_logs (user_id, seance_template_id, date, gym_id, duree_minutes, energie_fin)
    VALUES (${MOCK_USER_ID}, ${seanceB.id}, '2026-04-04', ${lalande.id}, 55, 75)`;
  console.log("✅ Session log 04/04 inserted");

  // 10. BodyWeight
  await db`INSERT INTO body_weights (user_id, date, poids, notes)
    VALUES (${MOCK_USER_ID}, '2026-04-05', 90.55, 'Poids initial mesuré')`;
  console.log("✅ Bodyweight inserted");

  console.log("✅ Seed terminé!");
  await db.end();
  process.exit(0);
}

main().catch((e) => { console.error("❌ Seed failed:", e.message); process.exit(1); });
