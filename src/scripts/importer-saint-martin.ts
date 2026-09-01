import { config } from "dotenv";
import path from "path";
import postgres from "postgres";

/**
 * Inventaire terrain de Basic-Fit St-Martin-Du-Touch.
 *
 * Garde-fous : ce script ne crée jamais de salle, ne réactive jamais une
 * instance archivée et n'écrit rien sans le drapeau explicite `--appliquer`.
 * Les valeurs inconnues restent `null`; en particulier, un maximum observé ne
 * permet jamais de reconstruire les paliers qui le précèdent.
 */
export const GYM_CIBLE = {
  id: "a29c5180-3393-48a1-94f9-25f69d29b3f8",
  nom: "St-Martin-Du-Touch",
} as const;

export type ConfianceMapping = "haute" | "moyenne";

export interface EntreeInventaire {
  slug: string;
  machineNom: string;
  conventionCharge:
    | "pile_affichee"
    | "pile_par_cote"
    | "disques_ajoutes"
    | "poids_total"
    | "poids_par_main"
    | "sans_charge";
  typePoulie?: "na" | "simple" | "double";
  paliersCharges?: number[] | null;
  chargeMinimale?: number | null;
  chargeMax?: number | null;
  poidsNonCompte?: number | null;
  natureCharge?: "resistance" | "assistance";
  etat?: "disponible" | "temporairement_indisponible";
  quantite: number;
  confiance: ConfianceMapping;
  notes?: string;
}

const PALIERS_POULIE_REGLABLE = [4.5, 9, 14, 18, 23, 27, 32, 36, 41, 45];
const PALIERS_POULIE_FIXE = [4.5, 11, 18, 25, 32, 39, 45, 52, 59, 66, 73, 79, 86, 93, 100, 107, 113, 120, 127, 134];

function entree(
  slug: string,
  machineNom: string,
  quantite: number,
  chargeMax: number,
  confiance: ConfianceMapping = "haute",
  notes?: string,
): EntreeInventaire {
  return {
    slug, machineNom, quantite, confiance,
    notes: [
      notes,
      "Paliers intermédiaires inconnus; microcharges +1,1/+2,3 observées mais non modélisées comme incréments.",
    ].filter(Boolean).join(" "),
    conventionCharge: "pile_affichee",
    chargeMinimale: 4.5,
    chargeMax,
    paliersCharges: null,
  };
}

function poulieReglable(slug: string, double = false, notes?: string): EntreeInventaire {
  return {
    slug,
    machineNom: double ? "Station double à poulies réglables" : "Sortie de poulie réglable",
    conventionCharge: double ? "pile_par_cote" : "pile_affichee",
    typePoulie: double ? "double" : "simple",
    paliersCharges: PALIERS_POULIE_REGLABLE,
    chargeMinimale: 4.5,
    chargeMax: 45,
    quantite: double ? 1 : 7,
    confiance: "haute",
    notes: `${notes ?? ""} ${double
      ? "Les deux piles doivent être réglées pareil; si chacune affiche 18 kg, la charge stockée est 18 kg (par côté), jamais 36 kg."
      : "Valeur saisie = valeur affichée; aucune conversion de ratio."}`.trim(),
  };
}

const CABLES_SIMPLES = [
  "single-arm-cable-row", "straight-arm-pulldown", "cable-pull-through",
  "cable-curl", "rope-hammer-curl", "tricep-pushdown",
  "rope-tricep-pushdown", "overhead-tricep-extension", "cable-crunch",
  "cable-woodchop", "pallof-press", "half-kneeling-pallof-press",
  "cable-lateral-raise", "cable-front-raise", "face-pull",
] as const;
const CABLES_DOUBLES = ["cable-fly", "cable-rear-delt-fly", "incline-cable-fly"] as const;

const EXERCICES_HALTERES = [
  "dumbbell-bench-press", "dumbbell-fly", "incline-dumbbell-press",
  "dumbbell-bent-over-row", "dumbbell-shrug", "one-arm-dumbbell-row",
  "bulgarian-split-squat", "front-foot-elevated-split-squat", "goblet-squat",
  "heel-elevated-goblet-squat", "reverse-lunge", "split-squat", "walking-lunge",
  "dumbbell-hip-thrust", "dumbbell-romanian-deadlift",
  "single-leg-romanian-deadlift", "bicep-curl", "concentration-curl",
  "hammer-curl", "incline-dumbbell-curl", "spider-curl",
  "dumbbell-overhead-tricep-extension", "tricep-kickback",
  "dumbbell-skull-crusher", "arnold-press", "seated-dumbbell-press",
  "front-raise", "lateral-raise", "rear-delt-fly", "standing-dumbbell-press",
] as const;

const EXERCICES_BARRE_RACK = [
  "barbell-row", "shrug", "pendlay-row", "front-squat", "squat",
  "barbell-glute-bridge", "deadlift", "good-morning", "romanian-deadlift",
  "sumo-deadlift", "skull-crusher",
  "overhead-press", "push-press",
] as const;

function halteres(slug: string): EntreeInventaire {
  return {
    slug,
    machineNom: "Haltères + banc si nécessaire",
    conventionCharge: "poids_par_main",
    paliersCharges: null,
    chargeMinimale: 2,
    chargeMax: 50,
    quantite: 1,
    confiance: "haute",
    notes: "Valeur saisie = poids d’un haltère / charge par main, jamais ×2. Deux paires de 2 à 28 kg et une paire de 30 à 50 kg; valeurs exactes au-dessus de 28 non documentées; saisie manuelle autorisée.",
  };
}

function barreRack(slug: string): EntreeInventaire {
  return {
    slug,
    machineNom: "Barre olympique 20 kg + rack/platform + disques",
    conventionCharge: "poids_total",
    chargeMinimale: 20,
    quantite: 1,
    confiance: "haute",
    notes: "Charge totale déplacée, barre de 20 kg comprise. Disques observés : 1,25 / 2,5 / 5 / 10 / 20 kg; aucun incrément bilatéral déduit.",
  };
}

export const INVENTAIRE: EntreeInventaire[] = [
  ...CABLES_SIMPLES.map((slug) => poulieReglable(slug)),
  poulieReglable("cable-kickback", false, "PROVISOIRE : sangle de cheville non confirmée."),
  ...CABLES_DOUBLES.map((slug) => poulieReglable(slug, true)),

  ...["lat-pulldown", "close-grip-lat-pulldown", "wide-grip-lat-pulldown"].map((slug): EntreeInventaire => ({
    slug, machineNom: "Lat Pulldown dédié", conventionCharge: "pile_affichee",
    typePoulie: "simple", paliersCharges: PALIERS_POULIE_FIXE,
    chargeMinimale: 4.5, chargeMax: 134, quantite: 1, confiance: "haute",
    notes: "Poste assis dédié; échelle observée uniquement sur cette station.",
  })),
  {
    slug: "seated-row", machineNom: "Low Row dédié", conventionCharge: "pile_affichee",
    typePoulie: "simple", paliersCharges: PALIERS_POULIE_FIXE,
    chargeMinimale: 4.5, chargeMax: 134, quantite: 1, confiance: "haute",
    notes: "Poste assis dédié; échelle observée uniquement sur cette station.",
  },

  entree("pec-deck", "Rear Delt / Pec Fly", 2, 134),
  entree("reverse-pec-deck", "Rear Delt / Pec Fly", 2, 134),
  entree("lat-pulldown", "Lat Pulldown à pile", 2, 134),
  entree("machine-row", "Seated Row à pile", 1, 134),
  entree("chest-supported-row", "Diverging Seated Row", 1, 113, "moyenne", "Mapping biomécanique à valider."),
  ...["chin-up", "pull-up", "dip"].map((slug): EntreeInventaire => ({
    ...entree(slug, "Dip/Chin Assist", 1, 68), natureCharge: "assistance",
    notes: "La valeur saisie est l'assistance affichée; une diminution est une progression; pas d'e1RM standard.",
  })),
  entree("machine-chest-press", "Chest Press", 1, 113),
  entree("machine-chest-press", "Converging Chest Press", 1, 113),
  entree("machine-shoulder-press", "Shoulder Press", 1, 91),
  entree("machine-shoulder-press", "Converging Shoulder Press", 1, 91),
  entree("seated-leg-curl", "Seated Leg Curl", 1, 113),
  entree("lying-leg-curl", "Prone Leg Curl", 1, 91),
  entree("leg-curl", "Prone Leg Curl", 1, 91),
  entree("leg-extension", "Leg Extension", 2, 113),
  entree("hip-abduction-machine", "Hip Abduction extérieur", 1, 100),
  entree("hip-adduction-machine", "Hip Abduction intérieur", 1, 100, "moyenne", "À confirmer : le mouvement doit bien être une adduction."),
  entree("leg-press", "Leg Press à pile", 1, 175),
  entree("leg-press-calf-raise", "Leg Press à pile", 1, 175),

  ...["smith-machine-bench-press", "smith-machine-squat", "smith-machine-romanian-deadlift"]
    .map((slug): EntreeInventaire => ({
      slug,
      machineNom: "Smith machine",
      conventionCharge: "disques_ajoutes",
      quantite: 2,
      confiance: "haute",
      notes: "Valeur saisie = disques ajoutés uniquement. Contrepoids et résistance effective inconnus; aucune résistance de barre n’est inventée.",
    })),

  {
    slug: "hack-squat", machineNom: "Hack Squat", conventionCharge: "disques_ajoutes",
    poidsNonCompte: 47.6, quantite: 1, confiance: "haute",
    notes: "Résistance intrinsèque constructeur, métadonnée uniquement; jamais ajoutée aux performances/e1RM.",
  },
  {
    slug: "leg-press", machineNom: "Leg Press plate-loaded", conventionCharge: "disques_ajoutes",
    poidsNonCompte: 75.7, quantite: 1, confiance: "haute",
    notes: "Résistance intrinsèque constructeur, métadonnée uniquement; jamais ajoutée aux performances/e1RM.",
  },
  {
    slug: "leg-press-calf-raise", machineNom: "Leg Press plate-loaded", conventionCharge: "disques_ajoutes",
    poidsNonCompte: 75.7, quantite: 1, confiance: "haute",
    notes: "Variante mollets compatible catalogue; résistance intrinsèque en métadonnée uniquement.",
  },
  {
    slug: "machine-glute-kickback", machineNom: "Glute Trainer", conventionCharge: "disques_ajoutes",
    poidsNonCompte: 22.7, etat: "temporairement_indisponible", quantite: 1,
    confiance: "moyenne", notes: "Mapping à valider; appareil temporairement indisponible; résistance intrinsèque non comptée.",
  },

  {
    slug: "bench-press", machineNom: "Poste développé couché olympique",
    conventionCharge: "poids_total", chargeMinimale: 20, quantite: 2, confiance: "haute",
    notes: "Charge totale déplacée, barre de 20 kg comprise. Disques vus : 1,25 / 2,5 / 5 / 10 / 20 kg; aucun incrément bilatéral déduit.",
  },
  {
    slug: "incline-bench-press", machineNom: "Poste développé incliné olympique",
    conventionCharge: "poids_total", chargeMinimale: 20, quantite: 1, confiance: "haute",
    notes: "Charge totale déplacée, barre de 20 kg comprise. Aucun incrément bilatéral déduit.",
  },
  ...EXERCICES_HALTERES.map(halteres),
  ...EXERCICES_BARRE_RACK.map(barreRack),
  {
    slug: "close-grip-bench-press", machineNom: "Poste développé couché olympique",
    conventionCharge: "poids_total", chargeMinimale: 20, quantite: 2, confiance: "haute",
    notes: "Charge totale déplacée, barre de 20 kg comprise; aucun incrément bilatéral déduit.",
  },
  {
    slug: "bench-dip", machineNom: "Banc plat", conventionCharge: "sans_charge",
    quantite: 7, confiance: "haute",
    notes: "Le banc est uniquement un support. Aucune charge externe n’est saisie; le poids du corps n’entre jamais dans le champ charge.",
  },
  {
    slug: "weighted-crunch", machineNom: "Disques libres", conventionCharge: "poids_total",
    quantite: 1, confiance: "haute",
    notes: "Valeur saisie = poids du disque tenu; disques observés : 1,25 / 2,5 / 5 / 10 / 20 kg.",
  },
  {
    slug: "preacher-curl", machineNom: "Pupitre preacher + barres fixes",
    conventionCharge: "poids_total", paliersCharges: [10, 15, 20, 25, 30],
    chargeMinimale: 10, chargeMax: 30, quantite: 1, confiance: "haute",
    notes: "Poids total de la barre fixe saisie; pupitre et paliers 10/15/20/25/30 kg observés.",
  },
];

export const APPAREILS_NON_IMPORTES = [
  "Diverging Lat Pulldown ×2 — mapping non fidèle à confirmer",
  "Arm Curl ×1 — trou de catalogue",
  "Seated Triceps Press ×1 — trou de catalogue",
  "Abdominal Crunch ×2 — trou de catalogue",
  "Rotary Torso ×1 — trou de catalogue",
  "Back Extension stack ×1 — trou de catalogue; back-extension bodyweight infidèle",
  "Abdominal ×1 — trou de catalogue",
  "Perfect Squat ×1 — trou de catalogue; belt-squat interdit",
  "Station intégrée au rack ×1 — appareil non identifié",
] as const;

export const INCERTITUDES = [
  "Sangle de cheville pour cable-kickback non confirmée.",
  "Diverging Seated Row → chest-supported-row : confiance moyenne.",
  "Hip Abduction intérieur → hip-adduction-machine : mouvement à confirmer.",
  "Glute Trainer → machine-glute-kickback : confiance moyenne; appareil indisponible.",
  "Valeurs exactes des haltères au-dessus de 28 kg non documentées.",
  "Paliers intermédiaires de toutes les machines à pile hors poulies dédiées non observés.",
  "Microcharges +1,1/+2,3 : observées mais non modélisées comme incréments.",
  "Contrepoids/résistance effective des Smith machines inconnue.",
  "Step-Up : aucun support de hauteur sûre n'a été validé; un banc n'est pas assimilé à une box.",
  "Hip Thrust barre/Smith : matériel plausible, mais installation et calage du banc non validés.",
  "Chest Dip : usage assisté ou non assisté sur la Dip/Chin Assist non documenté; aucun sens de charge n'est choisi au hasard.",
  "Inverted Row : présence d'un rack et de Smith machines, mais installation basse adaptée non validée.",
] as const;

function valeurOuNull<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

async function appliquer(userId: string) {
  const projectRoot = path.resolve(__dirname, "../..");
  config({ path: path.join(projectRoot, ".env.local") });
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL absent.");
  const db = postgres(process.env.DATABASE_URL, { prepare: false });

  try {
    await db.begin(async (tx) => {
      const [gym] = await tx<{ id: string; nom: string; user_id: string }[]>`
        SELECT id, nom, user_id FROM gyms
        WHERE id = ${GYM_CIBLE.id} AND archive_le IS NULL
        FOR UPDATE
      `;
      if (!gym || gym.nom !== GYM_CIBLE.nom) {
        throw new Error(`Salle cible absente, archivée ou renommée; aucune salle ne sera créée.`);
      }
      if (gym.user_id !== userId) throw new Error("Le compte fourni ne possède pas la salle cible.");

      for (const item of INVENTAIRE) {
        const [exercise] = await tx<{ id: string }[]>`SELECT id FROM exercises WHERE slug = ${item.slug} LIMIT 1`;
        if (!exercise) throw new Error(`Slug catalogue absent : ${item.slug}`);
        const values = {
          machine_nom: item.machineNom,
          type_poulie: item.typePoulie ?? "na",
          convention_charge: item.conventionCharge,
          increments_possibles: null,
          paliers_charges: item.paliersCharges ? tx.json(item.paliersCharges) : null,
          charge_minimale: valeurOuNull(item.chargeMinimale),
          charge_max: valeurOuNull(item.chargeMax),
          poids_non_compte: valeurOuNull(item.poidsNonCompte),
          nature_charge: item.natureCharge ?? "resistance",
          etat: item.etat ?? "disponible",
          quantite: item.quantite,
          notes_machine: `${item.notes ?? ""} Confiance mapping : ${item.confiance}.`.trim(),
        };
        const [active] = await tx<{ id: string }[]>`
          SELECT id FROM exercise_instances
          WHERE gym_id = ${GYM_CIBLE.id}
            AND exercise_id = ${exercise.id}
            AND machine_nom = ${item.machineNom}
            AND archive_le IS NULL
          LIMIT 1
        `;
        if (active) {
          await tx`UPDATE exercise_instances SET ${tx(values)}, updated_at = now() WHERE id = ${active.id}`;
        } else {
          await tx`INSERT INTO exercise_instances ${tx({ user_id: userId, gym_id: GYM_CIBLE.id, exercise_id: exercise.id, ...values })}`;
        }
      }
      // inventaire_statut reste volontairement inchangé jusqu'à validation finale.
    });
  } finally {
    await db.end();
  }
}

async function main() {
  const userId = process.argv[2];
  if (!userId || !process.argv.includes("--appliquer")) {
    console.error("Aucune écriture. Usage explicite : npx tsx src/scripts/importer-saint-martin.ts <userId> --appliquer");
    process.exitCode = 1;
    return;
  }
  await appliquer(userId);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
