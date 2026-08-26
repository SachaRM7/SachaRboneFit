import { config } from "dotenv";
import path from "path";
import postgres from "postgres";
import { SEED_USER_EMAIL } from "@/lib/constants";
import { CATALOGUE, CATALOGUE_PAR_SLUG } from "@/lib/referentiels/catalogue";

const projectRoot = path.resolve(__dirname, "../..");
config({ path: path.join(projectRoot, ".env.local") });

const db = postgres(process.env.DATABASE_URL!, { prepare: false });

/** Ligne renvoyee par postgres.js. */
type SeedRow = { id: string; slug?: string };

const SEED_USER_ID = process.env.SEED_USER_ID || "00000000-0000-0000-0000-000000000001";

/**
 * Machines reellement disponibles, par salle.
 *
 * `slug` designe l'exercice du catalogue ; le reste decrit la machine physique :
 * son nom sur place, sa convention de charge et ses increments reels. C'est cette
 * connaissance de terrain qui rend la personnalisation possible — elle ne peut pas
 * venir de la bibliotheque.
 */
const MACHINES_LALANDE = [
  { slug: "machine-chest-press", machineNom: "Lying Machine Chest Press", typePoulie: "na", conventionCharge: "pile_affichee", increments: [5], poidsNonCompte: null, chargeMax: 100 },
  { slug: "hack-squat", machineNom: "Matrix Perfect Squat", typePoulie: "na", conventionCharge: "disques_ajoutes", increments: [2.5, 5, 10, 15, 20], poidsNonCompte: 30.4, chargeMax: null },
  { slug: "pec-deck", machineNom: "Seated Pec Fly réglage 1", typePoulie: "na", conventionCharge: "pile_affichee", increments: [5], poidsNonCompte: null, chargeMax: 85 },
  { slug: "machine-lateral-raise", machineNom: "Machine Lateral Raise", typePoulie: "na", conventionCharge: "pile_affichee", increments: [6], poidsNonCompte: null, chargeMax: 72 },
  { slug: "overhead-tricep-extension", machineNom: "Cable poulie simple", typePoulie: "simple", conventionCharge: "pile_affichee", increments: [2.3, 4.5, 6.8, 9, 11.3, 13.5], poidsNonCompte: null, chargeMax: 90 },
  { slug: "pallof-press", machineNom: "Cable poulie simple", typePoulie: "simple", conventionCharge: "pile_affichee", increments: [2.3, 4.5, 6.8, 9, 11.3, 13.5], poidsNonCompte: null, chargeMax: 90 },
  { slug: "machine-shoulder-press", machineNom: "Standing Military Press", typePoulie: "na", conventionCharge: "pile_affichee", increments: [5], poidsNonCompte: null, chargeMax: 90 },
  { slug: "seated-row", machineNom: "Cable Row", typePoulie: "simple", conventionCharge: "pile_affichee", increments: [2.5, 5], poidsNonCompte: null, chargeMax: 100 },
  { slug: "preacher-curl", machineNom: "Preacher Curl", typePoulie: "na", conventionCharge: "poids_total", increments: [1.25, 2.5, 5], poidsNonCompte: null, chargeMax: null },
  { slug: "leg-press", machineNom: "Leg Press 45°", typePoulie: "na", conventionCharge: "disques_ajoutes", increments: [5, 10, 20], poidsNonCompte: 25, chargeMax: null },
  { slug: "lat-pulldown", machineNom: "Lat Pulldown", typePoulie: "simple", conventionCharge: "pile_affichee", increments: [5], poidsNonCompte: null, chargeMax: 100 },
  { slug: "romanian-deadlift", machineNom: "Barre olympique + rack 2", typePoulie: "na", conventionCharge: "poids_total", increments: [2.5, 5, 10, 20], poidsNonCompte: null, chargeMax: null },
  { slug: "leg-extension", machineNom: "Leg Extension", typePoulie: "na", conventionCharge: "pile_affichee", increments: [5], poidsNonCompte: null, chargeMax: 85 },
  { slug: "seated-leg-curl", machineNom: "Seated Leg Curl", typePoulie: "na", conventionCharge: "pile_affichee", increments: [5], poidsNonCompte: null, chargeMax: 85 },
  { slug: "tricep-pushdown", machineNom: "Cable poulie haute", typePoulie: "simple", conventionCharge: "pile_affichee", increments: [2.3, 4.5, 6.8, 9], poidsNonCompte: null, chargeMax: 90 },
  { slug: "face-pull", machineNom: "Cable poulie haute + corde", typePoulie: "corde", conventionCharge: "pile_affichee", increments: [2.3, 4.5], poidsNonCompte: null, chargeMax: 45 },
  { slug: "hip-thrust", machineNom: "Barre olympique + banc", typePoulie: "na", conventionCharge: "poids_total", increments: [2.5, 5, 10, 20], poidsNonCompte: null, chargeMax: null },
  { slug: "standing-calf-raise", machineNom: "Standing Calf Raise", typePoulie: "na", conventionCharge: "pile_affichee", increments: [5], poidsNonCompte: null, chargeMax: 120 },
];

/**
 * Sesquiere n'avait aucune machine : une seance dans cette salle proposait donc
 * le materiel de Lalande, sous ses noms de Lalande. Le parc ci-dessous est
 * volontairement different (modeles, increments, exercices absents) pour que la
 * difference entre salles soit reellement testable.
 */
const MACHINES_SESQUIERE = [
  { slug: "bench-press", machineNom: "Banc + barre olympique", typePoulie: "na", conventionCharge: "poids_total", increments: [1.25, 2.5, 5, 10, 20], poidsNonCompte: null, chargeMax: null },
  { slug: "incline-dumbbell-press", machineNom: "Haltères 2-50 kg", typePoulie: "na", conventionCharge: "poids_total", increments: [2], poidsNonCompte: null, chargeMax: 50 },
  { slug: "leg-press", machineNom: "Leg Press horizontale", typePoulie: "na", conventionCharge: "pile_affichee", increments: [10], poidsNonCompte: null, chargeMax: 200 },
  { slug: "seated-row", machineNom: "Seated Row Technogym", typePoulie: "na", conventionCharge: "pile_affichee", increments: [5], poidsNonCompte: null, chargeMax: 110 },
  { slug: "lat-pulldown", machineNom: "Lat Pulldown Technogym", typePoulie: "simple", conventionCharge: "pile_affichee", increments: [5], poidsNonCompte: null, chargeMax: 110 },
  { slug: "romanian-deadlift", machineNom: "Barre olympique + rack", typePoulie: "na", conventionCharge: "poids_total", increments: [2.5, 5, 10, 20], poidsNonCompte: null, chargeMax: null },
  { slug: "lateral-raise", machineNom: "Haltères 2-50 kg", typePoulie: "na", conventionCharge: "poids_total", increments: [2], poidsNonCompte: null, chargeMax: 50 },
  { slug: "bicep-curl", machineNom: "Haltères 2-50 kg", typePoulie: "na", conventionCharge: "poids_total", increments: [2], poidsNonCompte: null, chargeMax: 50 },
  { slug: "tricep-pushdown", machineNom: "Poulie haute Technogym", typePoulie: "simple", conventionCharge: "pile_affichee", increments: [5], poidsNonCompte: null, chargeMax: 80 },
  { slug: "leg-curl", machineNom: "Lying Leg Curl", typePoulie: "na", conventionCharge: "pile_affichee", increments: [5], poidsNonCompte: null, chargeMax: 90 },
];

/** Les trois seances du bloc, en slugs du catalogue. */
const SEANCES = [
  {
    lettre: "A", nom: "Séance A — Poussée + Quadriceps", ordre: 1,
    exercices: [
      { slug: "machine-chest-press", series: 4, repsMin: 6, repsMax: 8, rpe: 8, tempo: "3010", repos: 150 },
      { slug: "hack-squat", series: 4, repsMin: 8, repsMax: 10, rpe: 8, tempo: "3010", repos: 150 },
      { slug: "pec-deck", series: 3, repsMin: 10, repsMax: 12, rpe: 9, tempo: "3011", repos: 90 },
      { slug: "leg-extension", series: 3, repsMin: 12, repsMax: 15, rpe: 9, tempo: "2011", repos: 75 },
      { slug: "overhead-tricep-extension", series: 3, repsMin: 10, repsMax: 12, rpe: 9, tempo: "3010", repos: 75 },
    ],
  },
  {
    lettre: "B", nom: "Séance B — Tirage + Ischios", ordre: 2,
    exercices: [
      { slug: "seated-row", series: 4, repsMin: 8, repsMax: 10, rpe: 8, tempo: "3011", repos: 150 },
      { slug: "romanian-deadlift", series: 4, repsMin: 6, repsMax: 8, rpe: 8, tempo: "3110", repos: 180 },
      { slug: "lat-pulldown", series: 3, repsMin: 10, repsMax: 12, rpe: 9, tempo: "3011", repos: 90 },
      { slug: "seated-leg-curl", series: 3, repsMin: 10, repsMax: 12, rpe: 9, tempo: "3011", repos: 90 },
      { slug: "preacher-curl", series: 3, repsMin: 10, repsMax: 12, rpe: 9, tempo: "3011", repos: 75 },
    ],
  },
  {
    lettre: "C", nom: "Séance C — Épaules + Bras", ordre: 3,
    exercices: [
      { slug: "machine-shoulder-press", series: 4, repsMin: 8, repsMax: 10, rpe: 8, tempo: "3010", repos: 150 },
      { slug: "machine-lateral-raise", series: 4, repsMin: 12, repsMax: 15, rpe: 9, tempo: "2011", repos: 75 },
      { slug: "face-pull", series: 3, repsMin: 15, repsMax: 20, rpe: 8, tempo: "2012", repos: 60 },
      { slug: "preacher-curl", series: 3, repsMin: 10, repsMax: 12, rpe: 9, tempo: "3011", repos: 75 },
      { slug: "tricep-pushdown", series: 3, repsMin: 12, repsMax: 15, rpe: 9, tempo: "2011", repos: 60 },
      { slug: "pallof-press", series: 3, repsMin: 12, repsMax: 12, rpe: 7, tempo: "2012", repos: 60 },
    ],
  },
];

async function main() {
  console.log("🌱 Seed…");

  await db.unsafe(`
    TRUNCATE TABLE
      session_incidents, set_logs, session_logs, daily_states,
      exercise_in_template, seance_templates, programme_blocs,
      exercise_instances, exercises, gyms, body_weights
      RESTART IDENTITY CASCADE
  `);
  console.log("✅ Tables vidées");

  await db`INSERT INTO users (id, email, nom, date_naissance, taille, phase_nutritionnelle,
      objectif_chiffre, date_cible, objectif_type, objectif_muscles_prioritaires,
      frequence_cible_par_semaine, duree_seance_cible_minutes)
    VALUES (${SEED_USER_ID}, ${SEED_USER_EMAIL}, 'Sacha', '2001-02-22', 193, 'seche',
      '93 kg masse propre été 2026', '2026-08-01', 'recomposition',
      ${JSON.stringify(["epaules", "dorsaux"])}::jsonb, 3, 60)
    ON CONFLICT (id) DO UPDATE SET
      objectif_type = EXCLUDED.objectif_type,
      objectif_muscles_prioritaires = EXCLUDED.objectif_muscles_prioritaires,
      frequence_cible_par_semaine = EXCLUDED.frequence_cible_par_semaine,
      duree_seance_cible_minutes = EXCLUDED.duree_seance_cible_minutes`;
  console.log("✅ Utilisateur");

  const lalande = (await db`INSERT INTO gyms (user_id, nom, horaires_ouverture, est_24h, notes)
    VALUES (${SEED_USER_ID}, 'BasicFit Lalande', 'ferme 22h', false, 'Proche domicile, salle par défaut')
    RETURNING id`.then((r) => r[0] as unknown as SeedRow))!;

  const sesquiere = (await db`INSERT INTO gyms (user_id, nom, horaires_ouverture, est_24h, notes)
    VALUES (${SEED_USER_ID}, 'BasicFit Sesquière', '24/24', true, 'Tardives et jours fériés')
    RETURNING id`.then((r) => r[0] as unknown as SeedRow))!;
  console.log("✅ 2 salles");

  // Catalogue complet : le moteur peut proposer des substituts au-dela des
  // exercices programmes.
  const idParSlug = new Map<string, string>();
  for (const e of CATALOGUE) {
    const row = (await db`INSERT INTO exercises
      (user_id, nom, pilier, profil_tension, type, categorie_role,
       muscles_principaux, muscles_secondaires, equipement, slug)
      VALUES (${SEED_USER_ID}, ${e.nom}, ${e.pilier}, ${e.profilTension}, ${e.type},
        ${e.categorieRole}, ${JSON.stringify(e.musclesPrincipaux)}::jsonb,
        ${JSON.stringify(e.musclesSecondaires)}::jsonb, ${e.equipement}, ${e.slug})
      RETURNING id`.then((r) => r[0] as unknown as SeedRow))!;
    idParSlug.set(e.slug, row.id);
  }
  console.log(`✅ ${CATALOGUE.length} exercices du catalogue`);

  async function insererMachines(gymId: string, machines: typeof MACHINES_LALANDE) {
    const parSlug = new Map<string, string>();
    for (const m of machines) {
      const exerciseId = idParSlug.get(m.slug);
      if (!exerciseId) {
        throw new Error(`Slug absent du catalogue : ${m.slug}`);
      }
      const row = (await db`INSERT INTO exercise_instances
        (user_id, exercise_id, gym_id, machine_nom, type_poulie, convention_charge,
         increments_possibles, poids_non_compte, charge_max)
        VALUES (${SEED_USER_ID}, ${exerciseId}, ${gymId}, ${m.machineNom}, ${m.typePoulie},
          ${m.conventionCharge}, ${JSON.stringify(m.increments)}::jsonb,
          ${m.poidsNonCompte}, ${m.chargeMax})
        RETURNING id`.then((r) => r[0] as unknown as SeedRow))!;
      parSlug.set(m.slug, row.id);
    }
    return parSlug;
  }

  const instancesLalande = await insererMachines(lalande.id, MACHINES_LALANDE);
  const instancesSesquiere = await insererMachines(sesquiere.id, MACHINES_SESQUIERE);
  console.log(`✅ ${instancesLalande.size} machines à Lalande, ${instancesSesquiere.size} à Sesquière`);

  const bloc = (await db`INSERT INTO programme_blocs
      (user_id, nom, date_debut, type_cycle, semaine_actuelle, actif)
    VALUES (${SEED_USER_ID}, 'Bloc 1 — Cycle mécanique', '2026-08-03', 'mecanique', 3, true)
    RETURNING id`.then((r) => r[0] as unknown as SeedRow))!;

  const templateParLettre = new Map<string, string>();

  function templateId(lettre: string): string {
    const id = templateParLettre.get(lettre);
    if (!id) throw new Error(`Template ${lettre} absent`);
    return id;
  }
  for (const s of SEANCES) {
    const t = (await db`INSERT INTO seance_templates (bloc_id, lettre, nom, ordre_dans_semaine)
      VALUES (${bloc.id}, ${s.lettre}, ${s.nom}, ${s.ordre})
      RETURNING id`.then((r) => r[0] as unknown as SeedRow))!;
    templateParLettre.set(s.lettre, t.id);

    let ordre = 1;
    for (const ex of s.exercices) {
      const instanceId = instancesLalande.get(ex.slug);
      if (!instanceId) throw new Error(`Machine absente de Lalande : ${ex.slug}`);
      if (!CATALOGUE_PAR_SLUG.has(ex.slug)) throw new Error(`Slug inconnu : ${ex.slug}`);
      await db`INSERT INTO exercise_in_template
        (seance_template_id, exercise_instance_id, ordre, series_cibles,
         fourchette_reps_min, fourchette_reps_max, rpe_cible, tempo, repos_secondes)
        VALUES (${t.id}, ${instanceId}, ${ordre}, ${ex.series}, ${ex.repsMin},
          ${ex.repsMax}, ${ex.rpe}, ${ex.tempo}, ${ex.repos})`;
      ordre += 1;
    }
  }
  console.log(`✅ ${SEANCES.length} séances (${SEANCES.reduce((n, s) => n + s.exercices.length, 0)} exercices programmés)`);

  // Historique : deux seances passees pour que la double progression ait de quoi
  // travailler des le premier lancement.
  const etat = (await db`INSERT INTO daily_states
      (user_id, date, gym_id, sommeil_heures, jeune_bool, shift_recent_bool, shift_type,
       energie_depart, courbatures)
    VALUES (${SEED_USER_ID}, '2026-08-24', ${lalande.id}, 4.5, true, false, 'aucun', 5,
      ${JSON.stringify([{ muscle: "ischios", intensite: 8 }, { muscle: "fessiers", intensite: 4 }])}::jsonb)
    RETURNING id`.then((r) => r[0] as unknown as SeedRow))!;

  const seanceA = (await db`INSERT INTO session_logs
      (user_id, seance_template_id, daily_state_id, date, gym_id, duree_minutes,
       energie_fin, feu_biologique_jour, volume_ajuste_pct, volume_ajuste_raison)
    VALUES (${SEED_USER_ID}, ${templateId("A")}, ${etat.id}, '2026-08-24',
      ${lalande.id}, 58, 6, 'orange', -25, 'Sommeil 4.5h → -25%; Jeûne → -15%')
    RETURNING id`.then((r) => r[0] as unknown as SeedRow))!;

  const seriesA: Array<[string, number, number, number, number]> = [
    ["machine-chest-press", 1, 8, 75, 8], ["machine-chest-press", 2, 8, 75, 8], ["machine-chest-press", 3, 7, 75, 9],
    ["hack-squat", 1, 10, 60, 8], ["hack-squat", 2, 10, 60, 8], ["hack-squat", 3, 9, 60, 9],
    ["pec-deck", 1, 12, 45, 9], ["pec-deck", 2, 11, 45, 9],
  ];
  for (const [slug, numero, reps, charge, rpe] of seriesA) {
    await db`INSERT INTO set_logs
      (session_log_id, exercise_instance_id, numero_serie, reps_effectuees, charge, rpe_effectif, repos_reel_secondes)
      VALUES (${seanceA.id}, ${instancesLalande.get(slug)!}, ${numero}, ${reps}, ${charge}, ${rpe}, ${150})`;
  }

  const seanceB = (await db`INSERT INTO session_logs
      (user_id, seance_template_id, date, gym_id, duree_minutes, energie_fin, feu_biologique_jour)
    VALUES (${SEED_USER_ID}, ${templateId("B")}, '2026-08-21', ${lalande.id}, 62, 8, 'vert')
    RETURNING id`.then((r) => r[0] as unknown as SeedRow))!;

  const seriesB: Array<[string, number, number, number, number]> = [
    ["seated-row", 1, 10, 65, 8], ["seated-row", 2, 10, 65, 8], ["seated-row", 3, 10, 65, 9],
    ["romanian-deadlift", 1, 8, 80, 8], ["romanian-deadlift", 2, 8, 80, 8], ["romanian-deadlift", 3, 8, 80, 9],
  ];
  for (const [slug, numero, reps, charge, rpe] of seriesB) {
    await db`INSERT INTO set_logs
      (session_log_id, exercise_instance_id, numero_serie, reps_effectuees, charge, rpe_effectif, repos_reel_secondes)
      VALUES (${seanceB.id}, ${instancesLalande.get(slug)!}, ${numero}, ${reps}, ${charge}, ${rpe}, ${165})`;
  }
  console.log("✅ 2 séances d'historique");

  for (const [date, poids] of [["2026-08-10", 91.2], ["2026-08-17", 90.7], ["2026-08-24", 90.2]] as const) {
    await db`INSERT INTO body_weights (user_id, date, poids) VALUES (${SEED_USER_ID}, ${date}, ${poids})`;
  }
  console.log("✅ Pesées");

  console.log("🌱 Seed terminé");
  await db.end();
  process.exit(0);
}

main().catch(async (e) => {
  console.error("❌ Seed échoué :", e.message);
  await db.end().catch(() => {});
  process.exit(1);
});
