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
"POULIES — trois familles à ne pas confondre :",
  "· 7 poulies RÉGLABLES en hauteur (basse, milieu, haute), réparties sur",
  "  6 postes : 5 poulies simples, plus 1 station double fournissant 2 câbles",
  "  indépendants utilisables simultanément. Échelle +10 lbs, plafond 45 kg.",
  "· Lat Pulldown assis : poste dédié, poulie FIXE, échelle machine +15 lbs.",
  "  Deux exemplaires.",
  "· Low Row assis : poste dédié, poulie FIXE, échelle machine +15 lbs.",
  "",
  "Accessoires de poulie relevés : poignées, barre longue, prises neutres de",
  "plusieurs largeurs. Ils ne sont pas modélisés — le moteur n'exprime qu'un",
  "besoin par exercice, donc « poulie ET corde » est inexprimable — mais ils",
  "décident ce qui est déclaré : un mouvement dont l'accessoire manque n'entre",
  "pas dans l'inventaire.",
  "",
  "Cardio (rameurs, tapis, vélos, ClimbMill), plyo boxes, cordes, ballons,",
  "steps : présents, sans effet sur la programmation actuelle.",
  "",
  "Râtelier d'haltères : 2 à 50 kg, de 2 en 2 sur toute la plage. Deux paires",
  "par charge jusqu'à 28 kg, une seule paire de 30 à 50 kg.",
  "",
  "Piles sélectorisées : graduées en livres, 10 lbs au premier cran puis",
  "+15 lbs, affichées en kilogrammes. L'échelle est donc irrégulière une fois",
  "convertie — 4,5 · 11 · 18 · 25 · 32 · 39 · 45 · 52 · 59 · 66 · 73 · 79 ·",
  "86 · 93 · 100 · 107 · 113 · 120 · 127 · 134 — et commune à tous les",
  "appareils. Seul le NOMBRE de plaques change d'une machine à l'autre, et il",
  "n'a pas été compté : chaque pile reçoit l'échelle complète, plafonnée à la",
  "plus lourde vue dans la salle. Sur une machine plus légère, les derniers",
  "crans n'existent donc pas.",
  "",
  "À CONFIRMER SUR PLACE — rien de tout cela n'est saisi tant que ce n'est pas mesuré :",
  "· le NOMBRE de plaques de chaque pile MACHINE — le pas est connu, la hauteur",
  "  non. Les poulies réglables font exception : dix crans, plafond 45 kg, clos ;",
  "· un maximum de 91 kg figure au relevé, et l'échelle commune ne le produit",
  "  pas (elle passe de 86 à 93). Soit la lecture est approximative, soit cet",
  "  appareil-là a des plaques différentes : à revérifier sur place ;",
  "· la résistance des Smith machines (contrepoids ou non, et combien) ;",
  "· la résistance initiale du chariot des plate-loaded non relevées",
  "  (bench press, rack) ;",
  "· le sens de la Dip/Chin Assist : confirmer que le nombre affiché est bien",
  "  l'assistance et non la charge ;",
  "· l'identification des deux appareils inconnus (station intégrée au rack,",
  "  tapis incurvé). Ils ne sont PAS déclarés : une entrée exige un exercice, et",
  "  leur en attribuer un serait deviner ce qu'ils permettent de faire ;",
  "· le rapport de mouflage des poulies réglables : les 45 kg affichés sont-ils",
  "  la pile ou la charge en bout de câble ? Sans effet sur la progression —",
  "  l'affiché suffit et reste comparable à lui-même — mais interdit de comparer",
  "  un écarté poulie à un écarté haltères ;",
  "· la présence d'une CORDE et d'une SANGLE DE CHEVILLE au râtelier",
  "  d'accessoires : le relevé nomme poignées, barre longue et prises neutres,",
  "  pas ces deux-là. Sept exercices faisables sur les poulies réglables en",
  "  dépendent et attendent donc d'être déclarés — corde : face-pull,",
  "  rope-tricep-pushdown, rope-hammer-curl, cable-crunch, cable-pull-through,",
  "  overhead-tricep-extension ; sangle : cable-kickback ;",
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

/**
 * L'échelle d'une pile sélectorisée, chez Matrix.
 *
 * Les plaques sont graduées en livres — premier cran à 10 lbs, puis 15 lbs de
 * plus à chaque fois — et l'appareil affiche la conversion en kilogrammes. Ce
 * n'est donc pas une grille à pas constant une fois convertie : les écarts
 * réels alternent entre 6 et 7 kg (4,5 · 11 · 18 · 25 · 32 · 39 · 45 …). Un
 * incrément unique aurait produit des charges qui n'existent sur aucune
 * machine ; c'est exactement ce que la collection de paliers sait dire.
 *
 * Le premier cran garde sa demi-unité : c'est ainsi qu'il est marqué sur les
 * piles, et le relevé le confirme.
 */
const LIVRES_PREMIER_CRAN = 10;
const LIVRES_PAR_CRAN = 15;
const KG_PAR_LIVRE = 0.45359237;

/**
 * Les poulies réglables ne suivent PAS la même échelle que les machines.
 *
 * Même départ — 10 lbs — mais +10 lbs par cran au lieu de +15. Converti, cela
 * donne 4,5 · 9 · 14 · 18 · 23 · 27 · 32 · 36 · 41 · 45, et le dixième cran
 * tombe exactement sur les 45 kg relevés comme plafond. C'est la seule pile de
 * la salle dont on connaisse à la fois le pas ET la hauteur : dix plaques,
 * rien à confirmer.
 *
 * La valeur retenue est celle qu'affiche la machine. Le rapport de mouflage
 * n'est pas vérifié, donc aucune conversion n'est tentée : pour progresser sur
 * cette entrée, l'affiché suffit, et il reste comparable à lui-même.
 */
const LIVRES_PAR_CRAN_POULIE = 10;
const CRANS_POULIE = 10;

function echelleDUnePoulie(): number[] {
  return Array.from({ length: CRANS_POULIE }, (_, i) => {
    const kg = (LIVRES_PREMIER_CRAN + LIVRES_PAR_CRAN_POULIE * i) * KG_PAR_LIVRE;
    return i === 0 ? 4.5 : Math.round(kg);
  });
}

/**
 * Sept poulies réglables, cinq postes.
 *
 * Cinq poulies simples, plus une station double qui en fournit deux
 * indépendantes utilisables en même temps. Un mouvement à un seul câble peut
 * donc se faire sur n'importe laquelle des sept ; un mouvement à deux câbles
 * simultanés n'a qu'un seul poste possible.
 *
 * C'est la seule chose que `quantite` sait dire, et elle n'a aucun effet
 * moteur — pas de notion d'occupation en temps réel. Elle documente ce qui
 * est occupable, rien de plus.
 */
const POULIES_SIMPLES_DISPONIBLES = 7;
const STATIONS_DOUBLES_DISPONIBLES = 1;

/** Une entrée de poulie réglable : même appareil, même échelle, même plafond. */
function poulieReglable(
  slug: string,
  precisions: { double?: boolean; notes: string },
): Entree {
  return {
    slug,
    machineNom: precisions.double ? "Station double à poulies" : "Poulie réglable",
    conventionCharge: "pile_affichee",
    typePoulie: precisions.double ? "double" : "simple",
    paliersCharges: echelleDUnePoulie(),
    chargeMinimale: 4.5,
    chargeMax: 45,
    quantite: precisions.double ? STATIONS_DOUBLES_DISPONIBLES : POULIES_SIMPLES_DISPONIBLES,
    notesMachine:
      `${precisions.notes} Réglable en hauteur (basse, milieu, haute). `
      + "Valeur saisie = charge affichée sur la pile ; le rapport de mouflage "
      + "n'est pas vérifié, donc aucune conversion n'est appliquée.",
  };
}

/**
 * Vingt crans, soit 134 kg.
 *
 * Ce n'est pas la hauteur de CETTE pile — le nombre de plaques n'a pas été
 * compté machine par machine — mais celle de la plus lourde vue dans la salle.
 * Aucune pile d'ici ne monte plus haut, donc aucune charge inventée au-delà du
 * parc réel. En revanche, sur une machine plus légère, l'échelle dépasse son
 * vrai plafond : c'est une approximation assumée, écrite dans les notes et
 * portée par la liste « à confirmer ». Elle ne se voit qu'au dernier cran, et
 * elle vaut mieux qu'un appareil muet.
 */
const CRANS_OBSERVES = 20;

function echelleDUnePile(crans = CRANS_OBSERVES): number[] {
  return Array.from({ length: crans }, (_, i) => {
    const kg = (LIVRES_PREMIER_CRAN + LIVRES_PAR_CRAN * i) * KG_PAR_LIVRE;
    return i === 0 ? 4.5 : Math.round(kg);
  });
}

/** Ce que la pile affiche, tronqué au plafond de la machine quand il est connu. */
function pileJusqua(chargeMax?: number): number[] {
  const echelle = echelleDUnePile();
  return chargeMax === undefined ? echelle : echelle.filter((v) => v <= chargeMax);
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
   * Le Lat Pulldown assis : un poste dédié, pas une poulie réglable.
   *
   * La distinction compte. Sa poulie est FIXE, en hauteur, et sa pile suit
   * l'échelle machine (+15 lbs), pas celle des poulies réglables (+10). Le
   * confondre avec les sept poulies lui donnerait une mauvaise grille de
   * charges et un plafond de 45 kg qui n'est pas le sien.
   *
   * Deux exemplaires identiques, une seule entrée par prise : dédoubler
   * scinderait l'historique sans rien apporter. Les trois prises sont bien
   * trois exercices du catalogue — le travail diffère — mais elles partagent
   * l'appareil, donc l'échelle et le plafond.
   */
  ...["lat-pulldown", "close-grip-lat-pulldown", "wide-grip-lat-pulldown"].map(
    (slug): Entree => ({
      slug,
      machineNom: "Lat Pulldown assis",
      conventionCharge: "pile_affichee",
      typePoulie: "simple",
      quantite: 2,
      paliersCharges: pileJusqua(),
      chargeMinimale: 4.5,
      notesMachine:
        "Poste assis dédié, poulie FIXE — à ne pas confondre avec les sept "
        + "poulies réglables. Deux exemplaires identiques. Échelle machine "
        + "(+15 lbs par cran) ; le nombre de plaques de cette pile n'a pas été "
        + "compté, l'échelle va donc jusqu'au plafond de la plus lourde pile de "
        + "la salle, ce qui la dépasse peut-être.",
    }),
  ),

  /**
   * Le Low Row assis : l'autre poste dédié à poulie fixe.
   *
   * Il portait jusqu'ici le nom « station intégrée au rack — à identifier »,
   * qui était une hypothèse de travail, pas une observation. Le relevé le
   * nomme : c'est un rowing assis, et l'appareil non identifié du rack reste
   * non identifié — donc non déclaré, plutôt que rattaché à un exercice
   * choisi au jugé.
   */
  {
    slug: "seated-row",
    machineNom: "Low Row assis",
    conventionCharge: "pile_affichee",
    typePoulie: "simple",
    paliersCharges: pileJusqua(),
    chargeMinimale: 4.5,
    notesMachine:
      "Poste assis dédié, poulie FIXE — à ne pas confondre avec les sept "
      + "poulies réglables. Échelle machine (+15 lbs par cran) ; hauteur de "
      + "pile non comptée.",
  },

  // -------------------------------------------------------------------------
  // Les sept poulies réglables
  // -------------------------------------------------------------------------
  //
  // Un exercice n'entre ici que s'il est faisable avec les accessoires
  // RELEVÉS : poignées, barre longue, prises neutres de plusieurs largeurs.
  // Les mouvements qui exigent une corde ou une sangle de cheville attendent
  // que la présence de ces deux accessoires soit tranchée — ils sont listés
  // dans les notes de la salle, pas devinés ici.
  //
  // Aucun n'est retenu ni écarté selon qu'il est pratiqué aujourd'hui :
  // l'inventaire décrit ce que la salle permet, et c'est ce qui donne au
  // moteur de quoi proposer un remplacement le jour où un poste est pris.

  poulieReglable("single-arm-cable-row", {
    notes: "Poulie à hauteur de torse, poignée simple.",
  }),
  poulieReglable("straight-arm-pulldown", {
    notes: "Poulie haute, barre longue.",
  }),
  poulieReglable("cable-curl", {
    notes: "Poulie basse, barre longue ou poignée.",
  }),
  poulieReglable("tricep-pushdown", {
    notes: "Poulie haute, barre longue.",
  }),
  poulieReglable("cable-woodchop", {
    notes: "Poulie haute ou basse selon le sens, poignée simple.",
  }),
  poulieReglable("pallof-press", {
    notes: "Poulie à hauteur de poitrine, poignée simple.",
  }),
  poulieReglable("half-kneeling-pallof-press", {
    notes: "Poulie à hauteur de poitrine à genoux, poignée simple.",
  }),
  poulieReglable("cable-lateral-raise", {
    notes: "Poulie basse, poignée simple.",
  }),
  poulieReglable("cable-front-raise", {
    notes: "Poulie basse, poignée ou barre.",
  }),

  // Deux câbles simultanés : la station double est le seul poste possible.
  poulieReglable("cable-fly", {
    double: true,
    notes: "Deux câbles simultanés, poulies hautes, deux poignées.",
  }),
  poulieReglable("cable-rear-delt-fly", {
    double: true,
    notes: "Deux câbles croisés, poulies hautes, deux poignées.",
  }),
  poulieReglable("incline-cable-fly", {
    double: true,
    notes: "Deux câbles simultanés, poulies basses, deux poignées, banc inclinable.",
  }),

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
    paliersCharges: pileJusqua(),
    notesMachine:
      "Sens à confirmer : le nombre affiché doit être l'assistance, pas la charge. "
      + "Déclarée assistance par prudence — l'erreur inverse ferait lire un recul "
      + "comme une progression. Même échelle de pile que les autres appareils. "
      + "Pas de plancher à zéro : le premier cran est 4,5 kg, et « aucune "
      + "assistance » veut dire faire le mouvement sans la machine.",
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
    paliersCharges: pileJusqua(),
    chargeMinimale: 4.5,
    etat: "temporairement_indisponible",
    notesMachine:
      "Hors service au moment du relevé. À réactiver quand elle repart. "
      + "Échelle de pile commune, plafond propre non compté.",
  },

  /**
   * Les deux appareils non identifiés ne sont PAS déclarés.
   *
   * Une entrée exige un exercice du catalogue. Leur en attribuer un serait
   * choisir au jugé ce qu'ils permettent de faire — exactement la fabrication
   * que cet inventaire refuse. Ils restent dans la liste « à identifier » des
   * notes de la salle, où ils attendent d'être reconnus.
   */
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
