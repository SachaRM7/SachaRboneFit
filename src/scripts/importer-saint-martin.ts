import { config } from "dotenv";
import path from "path";
import postgres from "postgres";

/**
 * Basic-Fit Saint-Martin-du-Touch, premier inventaire de référence.
 *
 * Ce script transcrit un relevé de terrain, et rien d'autre. Sa règle
 * gouvernante tient en une phrase : ce qui n'a pas été mesuré reste `null`.
 *
 * C'est la raison d'être du modèle qui vient d'être posé. Il sait dire
 * « inconnu » — une pile dont personne n'a compté le cran reste sans
 * incréments, et l'application se taira sur les charges au lieu d'en inventer.
 * Remplir ces trous avec des valeurs plausibles rendrait ce fichier inutile :
 * on ne saurait plus ce qui a été vu de ce qui a été supposé.
 *
 * Les appareils non identifiés portent un nom qui le dit. Aucun modèle Matrix
 * ne leur est attribué au jugé, même si le parc observé est intégralement
 * Matrix : le catalogue commercial du constructeur ne fait pas partie de ce que
 * l'application a besoin de savoir.
 *
 *   DATABASE_URL=… npx tsx src/scripts/importer-saint-martin.ts <userId>
 *
 * Le script est idempotent : relancé, il met à jour ce qu'il a déjà écrit.
 */

const projectRoot = path.resolve(__dirname, "../..");
config({ path: path.join(projectRoot, ".env.local") });

const db = postgres(process.env.DATABASE_URL!, { prepare: false });

const NOM_SALLE = "Basic-Fit Saint-Martin-du-Touch";

/**
 * Ce que le lieu possède.
 *
 * `barre_traction` vient de la station double en configuration traction : le
 * relevé la mentionne, donc son absence ailleurs doit compter. `smith`,
 * `hack_squat`, `banc`, `banc_incline` viennent des postes observés.
 *
 * Les barres parallèles ne sont PAS déclarées : le relevé ne mentionne aucune
 * station à dips, et cocher la case « au cas où » reviendrait à programmer un
 * exercice qu'on n'a pas vu.
 */
const EQUIPEMENTS = [
  "barre", "halteres", "poulie", "disque", "kettlebell",
  "banc", "banc_incline", "smith", "hack_squat",
  "chest_press", "pec_deck", "rowing_assis", "tirage_vertical",
  "leg_press", "leg_extension", "leg_curl", "mollets",
  "abduction_adduction", "kickback_fessiers", "epaules_machine",
  "elevations_machine", "preacher",
  "barre_traction",
];

const NOTES_SALLE = [
  "Parc intégralement Matrix. Relevé terrain, premier inventaire de référence.",
  "",
  "Accessoires de poulie observés : poignées, barre longue, prises neutres de",
  "plusieurs largeurs. Non modélisés — leur absence change la variante d'un",
  "mouvement, pas sa faisabilité.",
  "",
  "Cardio (rameurs, tapis, vélos, ClimbMill), plyo boxes, cordes, ballons,",
  "steps : présents, sans effet sur la programmation actuelle.",
  "",
  "Râtelier d'haltères : 2 à 50 kg, de 2 en 2 sur toute la plage. Deux paires",
  "par charge jusqu'à 28 kg, une seule paire de 30 à 50 kg.",
  "",
  "À CONFIRMER SUR PLACE — rien de tout cela n'est saisi tant que ce n'est pas mesuré :",
  "· le pas de chaque pile, machine par machine ;",
  "· la résistance des Smith machines (contrepoids ou non, et combien) ;",
  "· la résistance initiale du chariot des plate-loaded non relevées",
  "  (bench press, rack) ;",
  "· le sens de la Dip/Chin Assist : confirmer que le nombre affiché est bien",
  "  l'assistance et non la charge ;",
  "· l'identification des deux appareils inconnus (station intégrée au rack,",
  "  tapis incurvé) ;",
  "· la charge maximale des poulies réglables : 45 kg relevé, reste à savoir",
  "  si c'est la pile ou la charge en bout de câble ;",
  "· l'existence d'une barre préchargée hors de la plage 10–30, et d'un",
  "  éventuel palier à 12,5 ;",
  "· la station de traction : confirmer qu'on peut réellement s'y suspendre,",
  "  et si d'autres points de traction existent.",
].join("\n");

/**
 * Une entrée d'inventaire.
 *
 * `slug` désigne l'exercice du catalogue. Tout le reste décrit l'appareil tel
 * qu'on l'a vu — et `null` veut dire qu'on ne l'a pas vu, jamais qu'on prend
 * la valeur habituelle.
 */
interface Entree {
  slug: string;
  machineNom: string;
  conventionCharge: "pile_affichee" | "disques_ajoutes" | "poids_total";
  typePoulie?: "na" | "simple" | "double" | "corde";
  incrementsPossibles?: number[] | null;
  paliersCharges?: number[] | null;
  chargeMinimale?: number | null;
  chargeMax?: number | null;
  poidsNonCompte?: number | null;
  natureCharge?: "resistance" | "assistance";
  etat?: "disponible" | "temporairement_indisponible";
  quantite?: number | null;
  notesMachine?: string | null;
}

const RELEVE: Entree[] = [
  /**
   * Les haltères : UNE entrée par exercice, jamais une par haltère.
   *
   * Cinquante instances pour un râtelier scinderaient l'historique du curl en
   * cinquante courbes sans lien.
   *
   * Le pas est de 2 kg sur toute la plage, sans exception. Ce qui change à
   * 30 kg n'est pas la charge disponible mais le nombre d'exemplaires : deux
   * paires jusqu'à 28, une seule au-delà. C'est une question de disponibilité
   * à l'instant où l'on veut la barre, pas de charge atteignable — la
   * progression est identique dans les deux moitiés du râtelier.
   */
  {
    slug: "dumbbell-bench-press",
    machineNom: "Haltères — râtelier",
    conventionCharge: "poids_total",
    paliersCharges: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50],
    chargeMinimale: 2,
    chargeMax: 50,
    notesMachine:
      "Râtelier 2–50 kg, de 2 en 2 sur toute la plage. "
      + "Deux paires par charge jusqu'à 28 kg, une seule paire de 30 à 50 kg. "
      + "La quantité n'est pas portée par le champ prévu pour ça : il vaut pour "
      + "toute l'entrée, alors qu'elle change ici selon la charge. Elle reste "
      + "une note, sans effet sur la programmation — il n'y a pas de notion "
      + "d'occupation en temps réel.",
  },

  /**
   * Le râtelier de barres préchargées : une entrée, cinq barres.
   *
   * Ici la barre EST la charge. Rien à ajouter, rien à charger — et la
   * progression consiste à aller chercher la barre suivante, ce que la
   * collection de paliers dit exactement.
   */
  {
    slug: "bicep-curl",
    machineNom: "Barres préchargées — râtelier",
    conventionCharge: "poids_total",
    paliersCharges: [10, 15, 20, 25, 30],
    chargeMinimale: 10,
    chargeMax: 30,
    notesMachine:
      "Cinq barres observées : 10, 15, 20, 25, 30 kg. Une seule entrée pour le "
      + "râtelier — cinq entrées scinderaient l'historique du curl en cinq courbes.",
  },

  /**
   * La barre olympique : la charge saisie est le TOTAL déplacé, barre comprise.
   *
   * La barre de 20 kg appartient à la description de l'appareil : elle sert à
   * résoudre les charges atteignables, et n'a pas à être ressaisie à chaque
   * série. Les disques observés donnent la grille.
   */
  {
    slug: "bench-press",
    machineNom: "Barre olympique 20 kg + disques",
    conventionCharge: "poids_total",
    incrementsPossibles: [1.25, 2.5, 5, 10, 15, 20],
    chargeMinimale: 20,
    notesMachine:
      "Charge saisie = poids total déplacé, barre de 20 kg comprise. "
      + "Disques observés de 1,25 à 20 kg ; le plancher est la barre à vide.",
  },

  /**
   * Les deux plate-loaded dont la résistance à vide a été mesurée.
   *
   * Cette résistance se lit, elle ne s'additionne pas : sur une machine à cames
   * ou à bras de levier, ce n'est pas une masse qu'on ajoute à la charge saisie.
   * Elle sert à reconnaître l'appareil et à expliquer un écart d'une salle à
   * l'autre.
   */
  {
    slug: "hack-squat",
    machineNom: "Hack squat plate-loaded",
    conventionCharge: "disques_ajoutes",
    incrementsPossibles: [1.25, 2.5, 5, 10, 15, 20],
    poidsNonCompte: 47.6,
    notesMachine: "Résistance du chariot à vide mesurée à 47,6 kg. Métadonnée : non comptée dans la saisie.",
  },
  {
    slug: "belt-squat",
    machineNom: "Perfect Squat plate-loaded",
    conventionCharge: "disques_ajoutes",
    incrementsPossibles: [1.25, 2.5, 5, 10, 15, 20],
    poidsNonCompte: 30.4,
    notesMachine: "Résistance du chariot à vide mesurée à 30,4 kg. Métadonnée : non comptée dans la saisie.",
  },

  /**
   * Les deux lat pulldown identiques : UNE entrée, quantité 2.
   *
   * Deux entrées dédoubleraient l'historique sans rien apporter. La quantité
   * est une note d'inventaire — aucun module ne s'en sert, et il n'existe pas
   * de notion d'occupation en temps réel.
   */
  {
    slug: "lat-pulldown",
    machineNom: "Lat pulldown",
    conventionCharge: "pile_affichee",
    typePoulie: "simple",
    quantite: 2,
    chargeMinimale: 4.5,
    notesMachine:
      "Deux exemplaires identiques. Départ de pile relevé à 4,5 kg ; le cran "
      + "n'a pas été compté, donc aucun incrément n'est déclaré et aucune charge "
      + "ne sera suggérée tant que ce n'est pas mesuré.",
  },

  /**
   * La Dip/Chin Assist : la charge AIDE.
   *
   * Le sens du nombre reste à confirmer sur place. Le déclarer `assistance`
   * est le choix prudent : au pire l'appareil ne recevra pas de suggestion de
   * charge, au mieux il évite que le moteur félicite un recul. L'inverse —
   * déclarer une résistance — produirait une progression fausse, silencieuse.
   */
  {
    slug: "chin-up",
    machineNom: "Dip/Chin Assist",
    conventionCharge: "pile_affichee",
    natureCharge: "assistance",
    chargeMinimale: 0,
    notesMachine:
      "Sens à confirmer : le nombre affiché doit être l'assistance, pas la charge. "
      + "Déclarée assistance par prudence — l'erreur inverse ferait lire un recul "
      + "comme une progression. Crans non relevés.",
  },

  /**
   * Le Glute Trainer : hors service, pas archivé.
   *
   * Le cas de référence. Il reste dans l'inventaire, avec son historique, et
   * il sort seulement du parc du jour. Le remettre en service ne demandera
   * rien d'autre que de changer son état.
   */
  {
    slug: "machine-glute-kickback",
    machineNom: "Glute Trainer",
    conventionCharge: "pile_affichee",
    etat: "temporairement_indisponible",
    notesMachine: "Hors service au moment du relevé. À réactiver quand elle repart.",
  },

  /**
   * Les deux appareils non identifiés.
   *
   * Ils portent un nom qui dit ce qu'on en sait, et rien de plus. Leur donner
   * un modèle Matrix au jugé les rendrait indiscernables d'un appareil
   * réellement identifié.
   */
  {
    slug: "seated-row",
    machineNom: "Station intégrée au rack — à identifier",
    conventionCharge: "pile_affichee",
    notesMachine:
      "Appareil non identifié lors du relevé. Nom, convention et crans à confirmer "
      + "sur place. L'exercice rattaché est une hypothèse de travail.",
  },
];

/** Ce qui n'est pas dans le relevé n'est pas écrit. */
function valeurOuNull<T>(v: T | undefined): T | null {
  return v === undefined ? null : v;
}

async function main() {
  const userId = process.argv[2];
  if (!userId) {
    console.error("Usage : npx tsx src/scripts/importer-saint-martin.ts <userId>");
    process.exit(1);
  }

  const [compte] = await db<{ id: string }[]>`
    SELECT id FROM users WHERE id = ${userId}
  `;
  if (!compte) {
    console.error(`Compte ${userId} introuvable.`);
    process.exit(1);
  }

  const [existante] = await db<{ id: string }[]>`
    SELECT id FROM gyms WHERE nom = ${NOM_SALLE} AND archive_le IS NULL LIMIT 1
  `;

  let gymId: string;
  if (existante) {
    gymId = existante.id;
    await db`
      UPDATE gyms
      SET equipements_disponibles = ${db.json(EQUIPEMENTS)},
          notes = ${NOTES_SALLE},
          updated_at = now()
      WHERE id = ${gymId}
    `;
    console.log(`Salle mise à jour : ${NOM_SALLE}`);
  } else {
    const [creee] = await db<{ id: string }[]>`
      INSERT INTO gyms (user_id, nom, equipements_disponibles, notes)
      VALUES (${userId}, ${NOM_SALLE}, ${db.json(EQUIPEMENTS)}, ${NOTES_SALLE})
      RETURNING id
    `;
    gymId = creee!.id;
    console.log(`Salle créée : ${NOM_SALLE}`);
  }

  let ecrites = 0;
  const absents: string[] = [];

  for (const e of RELEVE) {
    const [exercice] = await db<{ id: string }[]>`
      SELECT id FROM exercises WHERE slug = ${e.slug} LIMIT 1
    `;
    if (!exercice) {
      absents.push(e.slug);
      continue;
    }

    const valeurs = {
      machine_nom: e.machineNom,
      type_poulie: e.typePoulie ?? "na",
      convention_charge: e.conventionCharge,
      increments_possibles: e.incrementsPossibles ? db.json(e.incrementsPossibles) : null,
      paliers_charges: e.paliersCharges ? db.json(e.paliersCharges) : null,
      charge_minimale: valeurOuNull(e.chargeMinimale),
      charge_max: valeurOuNull(e.chargeMax),
      poids_non_compte: valeurOuNull(e.poidsNonCompte),
      nature_charge: e.natureCharge ?? "resistance",
      etat: e.etat ?? "disponible",
      quantite: valeurOuNull(e.quantite),
      notes_machine: valeurOuNull(e.notesMachine),
    };

    const [deja] = await db<{ id: string }[]>`
      SELECT id FROM exercise_instances
      WHERE gym_id = ${gymId} AND exercise_id = ${exercice.id} AND archive_le IS NULL
      LIMIT 1
    `;

    if (deja) {
      // Relancer le script ne doit pas dupliquer le parc. Les propriétés qui
      // figent le sens de l'historique sont réécrites ici en connaissance de
      // cause : ce script est le relevé lui-même, et il n'est censé tourner
      // que sur un inventaire qu'on est en train de constituer.
      await db`UPDATE exercise_instances SET ${db(valeurs)}, updated_at = now() WHERE id = ${deja.id}`;
    } else {
      await db`
        INSERT INTO exercise_instances ${db({
          user_id: userId,
          exercise_id: exercice.id,
          gym_id: gymId,
          ...valeurs,
        })}
      `;
    }
    ecrites += 1;
  }

  console.log(`${ecrites} entrées d'inventaire écrites.`);
  if (absents.length > 0) {
    console.log(
      `Slugs absents du catalogue, non importés : ${absents.join(", ")}`,
    );
  }
  console.log(
    "Aucune valeur non mesurée n'a été inventée. La liste de ce qui reste à "
    + "relever est dans les notes de la salle.",
  );

  await db.end();
}

main().catch(async (e) => {
  console.error(e);
  await db.end();
  process.exit(1);
});
