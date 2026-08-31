import { createHash } from "node:crypto";

/**
 * Ce que le coach a le droit de proposer, et sous quelle forme.
 *
 * Le coach savait tout lire et rien écrire, sauf trois exceptions qui se sont
 * révélées mal fondées : deux d'entre elles écrivaient dans des tables qu'un
 * autre chemin réécrit ou vide juste après. Le problème n'était donc pas qu'il
 * manquait des outils d'écriture, mais qu'il manquait un chemin d'écriture.
 *
 * Ce module est ce chemin, et il tient en une phrase : le modèle décrit une
 * opération, le serveur en calcule l'effet, l'humain le regarde et tranche.
 * Rien n'est écrit avant ce oui.
 *
 * Tout ici est pur — aucune base, aucun réseau. C'est ce qui permet de tester
 * la projection, l'empreinte et l'aperçu sans monter un environnement, et c'est
 * aussi ce qui garantit qu'un aperçu montré à l'écran et l'application qui
 * suivra parlent bien du même calcul : c'est le même code qui produit les deux.
 */

// ---------------------------------------------------------------------------
// L'objet manipulé
// ---------------------------------------------------------------------------

/**
 * Une ligne d'une séance programmée.
 *
 * Volontairement plus pauvre que `exercise_in_template` : les propositions ne
 * touchent qu'à ce qui se discute avec un athlète — quel exercice, combien de
 * séries, dans quelle fourchette. Le tempo, le RPE cible et les notes ne sont
 * pas dans ce périmètre, et ne sont donc pas dans ce type.
 */
export interface LigneProgramme {
  id: string;
  ordre: number;
  exerciseInstanceId: string;
  /** Ce qu'on lit à l'écran : le nom de l'exercice, la machine s'il y en a une. */
  nom: string;
  seriesCibles: number;
  repsMin: number;
  repsMax: number;
}

/**
 * Les opérations exposées, une par une.
 *
 * Il n'y a pas d'outil générique qui prendrait le programme entier en JSON.
 * Un tel outil ne se contrôle pas : sa validation devrait couvrir tout ce que
 * le modèle peut écrire, alors qu'ici chaque opération porte ses propres
 * bornes, et qu'une opération non listée est simplement impossible.
 */
export type Operation =
  | { type: "remplacer_exercice"; ligneId: string; versInstanceId: string }
  | {
      type: "ajuster_volume";
      ligneId: string;
      seriesCibles?: number;
      repsMin?: number;
      repsMax?: number;
    }
  | {
      type: "ajouter_exercice";
      exerciseInstanceId: string;
      seriesCibles: number;
      repsMin: number;
      repsMax: number;
    };

export type TypeOperation = Operation["type"];

/**
 * Les trois opérations exposées.
 *
 * Retirer un exercice n'en fait pas partie, et l'absence est délibérée :
 * `session_plan_items` référence la ligne de gabarit sans cascade, donc toute
 * ligne déjà servie dans une séance est indélébile. Un outil « retirer » aurait
 * fonctionné sur les lignes jamais utilisées et échoué sur les autres — c'est
 * la pire des deux situations. Le sujet est documenté en dette.
 */
export const OPERATIONS: readonly TypeOperation[] = [
  "remplacer_exercice",
  "ajuster_volume",
  "ajouter_exercice",
] as const;

/**
 * Bornes des opérations.
 *
 * Centralisées : le schéma d'outil, la projection et la route d'application
 * doivent refuser les mêmes valeurs, sinon la borne la plus permissive gagne.
 */
export const BORNES = {
  seriesMin: 1,
  seriesMax: 12,
  repsMin: 1,
  repsMax: 50,
  /** Au-delà, ce n'est plus une séance, c'est une liste de courses. */
  lignesMax: 12,
  /** Une proposition périmée ne s'applique pas : l'état a pu changer. */
  validiteMinutes: 30,
} as const;

// ---------------------------------------------------------------------------
// Projection : l'effet d'une opération, calculé sans rien écrire
// ---------------------------------------------------------------------------

export interface Projection {
  lignes: LigneProgramme[];
  /** Renseignée quand l'opération est impossible ; `lignes` vaut alors l'avant. */
  refus: string | null;
}

/** Nom lisible d'une instance ajoutée ou substituée, fourni par l'appelant. */
export type NommerInstance = (exerciseInstanceId: string) => string | null;

function entierDans(valeur: number, min: number, max: number): boolean {
  return Number.isInteger(valeur) && valeur >= min && valeur <= max;
}

/**
 * Applique une opération à une séance, en mémoire.
 *
 * Cette fonction est appelée deux fois pour une même proposition : une fois
 * pour construire l'aperçu, une fois au moment d'appliquer. C'est délibéré —
 * une proposition ne transporte pas un résultat calculé jadis, elle transporte
 * une opération qu'on recalcule sur l'état du moment.
 */
export function projeter(
  lignes: LigneProgramme[],
  operation: Operation,
  nommer: NommerInstance,
): Projection {
  const inchange = (refus: string): Projection => ({ lignes, refus });
  const ordonnees = [...lignes].sort((a, b) => a.ordre - b.ordre);

  switch (operation.type) {
    case "remplacer_exercice": {
      const cible = ordonnees.find((l) => l.id === operation.ligneId);
      if (!cible) return inchange("Cette ligne n'existe plus dans la séance.");
      if (cible.exerciseInstanceId === operation.versInstanceId) {
        return inchange("Le remplaçant est déjà l'exercice en place.");
      }
      if (ordonnees.some((l) => l.id !== cible.id && l.exerciseInstanceId === operation.versInstanceId)) {
        return inchange("Cet exercice est déjà dans la séance.");
      }
      const nom = nommer(operation.versInstanceId);
      if (!nom) return inchange("Cet exercice n'existe pas dans le matériel disponible.");

      return {
        refus: null,
        lignes: ordonnees.map((l) =>
          l.id === cible.id ? { ...l, exerciseInstanceId: operation.versInstanceId, nom } : l,
        ),
      };
    }

    case "ajuster_volume": {
      const cible = ordonnees.find((l) => l.id === operation.ligneId);
      if (!cible) return inchange("Cette ligne n'existe plus dans la séance.");

      const series = operation.seriesCibles ?? cible.seriesCibles;
      const min = operation.repsMin ?? cible.repsMin;
      const max = operation.repsMax ?? cible.repsMax;

      if (series === cible.seriesCibles && min === cible.repsMin && max === cible.repsMax) {
        return inchange("Cet ajustement ne change rien.");
      }
      if (!entierDans(series, BORNES.seriesMin, BORNES.seriesMax)) {
        return inchange(`Le nombre de séries doit tenir entre ${BORNES.seriesMin} et ${BORNES.seriesMax}.`);
      }
      if (!entierDans(min, BORNES.repsMin, BORNES.repsMax) || !entierDans(max, BORNES.repsMin, BORNES.repsMax)) {
        return inchange(`Les répétitions doivent tenir entre ${BORNES.repsMin} et ${BORNES.repsMax}.`);
      }
      if (min > max) return inchange("La fourchette de répétitions est inversée.");

      return {
        refus: null,
        lignes: ordonnees.map((l) =>
          l.id === cible.id ? { ...l, seriesCibles: series, repsMin: min, repsMax: max } : l,
        ),
      };
    }

    case "ajouter_exercice": {
      if (ordonnees.length >= BORNES.lignesMax) {
        return inchange(`Une séance ne dépasse pas ${BORNES.lignesMax} exercices.`);
      }
      if (ordonnees.some((l) => l.exerciseInstanceId === operation.exerciseInstanceId)) {
        return inchange("Cet exercice est déjà dans la séance.");
      }
      if (!entierDans(operation.seriesCibles, BORNES.seriesMin, BORNES.seriesMax)) {
        return inchange(`Le nombre de séries doit tenir entre ${BORNES.seriesMin} et ${BORNES.seriesMax}.`);
      }
      if (
        !entierDans(operation.repsMin, BORNES.repsMin, BORNES.repsMax) ||
        !entierDans(operation.repsMax, BORNES.repsMin, BORNES.repsMax)
      ) {
        return inchange(`Les répétitions doivent tenir entre ${BORNES.repsMin} et ${BORNES.repsMax}.`);
      }
      if (operation.repsMin > operation.repsMax) return inchange("La fourchette de répétitions est inversée.");

      const nom = nommer(operation.exerciseInstanceId);
      if (!nom) return inchange("Cet exercice n'existe pas dans le matériel disponible.");

      return {
        refus: null,
        lignes: [
          ...ordonnees,
          {
            // Une ligne pas encore en base : l'identifiant définitif viendra de
            // l'insertion. Ce marqueur n'existe que le temps de l'aperçu.
            id: NOUVELLE_LIGNE,
            ordre: ordonnees.length + 1,
            exerciseInstanceId: operation.exerciseInstanceId,
            nom,
            seriesCibles: operation.seriesCibles,
            repsMin: operation.repsMin,
            repsMax: operation.repsMax,
          },
        ],
      };
    }
  }
}

/** Identifiant provisoire d'une ligne qui n'existe pas encore en base. */
export const NOUVELLE_LIGNE = "__nouvelle__";

// ---------------------------------------------------------------------------
// Empreinte : de quoi refuser une proposition devenue fausse
// ---------------------------------------------------------------------------

/**
 * Empreinte de l'état sur lequel une proposition a été calculée.
 *
 * Une proposition dit « remplace la ligne 3 par le tirage horizontal ». Si
 * l'athlète modifie la séance entre-temps, cette phrase peut encore
 * s'exécuter — et produire tout autre chose que ce qu'il avait sous les yeux.
 * L'empreinte rend cet écart détectable au lieu de le laisser passer.
 *
 * Elle porte tout ce que l'aperçu montre. Un champ hors périmètre — un tempo,
 * une note — ne doit pas périmer une proposition qui ne le concerne pas.
 */
export function empreinteDe(lignes: LigneProgramme[]): string {
  const canonique = [...lignes]
    .sort((a, b) => a.ordre - b.ordre)
    .map((l) => [l.id, l.ordre, l.exerciseInstanceId, l.seriesCibles, l.repsMin, l.repsMax]);
  return createHash("sha256").update(JSON.stringify(canonique)).digest("hex").slice(0, 32);
}

/** Une proposition est périmée passé son délai, quoi qu'il arrive par ailleurs. */
export function estPerimee(creeeLe: Date, maintenant: Date = new Date()): boolean {
  return maintenant.getTime() - creeeLe.getTime() > BORNES.validiteMinutes * 60_000;
}

// ---------------------------------------------------------------------------
// Aperçu : ce que l'humain lit avant de dire oui
// ---------------------------------------------------------------------------

export type Mouvement = "retire" | "ajoute" | "modifie" | "inchange";

export interface LigneApercu {
  mouvement: Mouvement;
  /** L'exercice, sans jargon ni identifiant. */
  nom: string;
  /** La prescription, telle qu'elle se lit : « 4 × 8-12 ». */
  avant: string | null;
  apres: string | null;
}

export interface Apercu {
  /** Une phrase qui dit ce qui change, avant même de lire le détail. */
  resume: string;
  lignes: LigneApercu[];
  seriesAvant: number;
  seriesApres: number;
  /** Ce que la validation signale sans l'interdire. */
  avertissements: string[];
}

/** « 4 × 8-12 », ou « 4 × 10 » quand la fourchette est un point. */
export function prescription(l: Pick<LigneProgramme, "seriesCibles" | "repsMin" | "repsMax">): string {
  const reps = l.repsMin === l.repsMax ? `${l.repsMin}` : `${l.repsMin}-${l.repsMax}`;
  return `${l.seriesCibles} × ${reps}`;
}

function totalSeries(lignes: LigneProgramme[]): number {
  return lignes.reduce((n, l) => n + l.seriesCibles, 0);
}

/**
 * L'aperçu, construit par différence entre deux états.
 *
 * Il ne reprend pas la phrase du modèle : celle-ci décrit une intention, pas un
 * effet, et les deux peuvent diverger sans que rien ne le signale. Ce qui
 * s'affiche est donc calculé à partir de l'avant et de l'après réels — même
 * opération, mêmes lignes, même texte, à chaque fois.
 */
export function construireApercu(
  avant: LigneProgramme[],
  apres: LigneProgramme[],
  avertissements: string[] = [],
): Apercu {
  const parIdAvant = new Map(avant.map((l) => [l.id, l]));
  const parIdApres = new Map(apres.filter((l) => l.id !== NOUVELLE_LIGNE).map((l) => [l.id, l]));

  const lignes: LigneApercu[] = [];

  for (const l of [...avant].sort((a, b) => a.ordre - b.ordre)) {
    const suivante = parIdApres.get(l.id);
    if (!suivante) {
      lignes.push({ mouvement: "retire", nom: l.nom, avant: prescription(l), apres: null });
      continue;
    }
    const memeExercice = suivante.exerciseInstanceId === l.exerciseInstanceId;
    const memePrescription = prescription(suivante) === prescription(l);
    if (memeExercice && memePrescription) {
      lignes.push({ mouvement: "inchange", nom: l.nom, avant: prescription(l), apres: prescription(l) });
      continue;
    }
    if (!memeExercice) {
      // Un remplacement se lit mieux en deux lignes qu'en une : ce qui part et
      // ce qui arrive ne portent pas le même nom.
      lignes.push({ mouvement: "retire", nom: l.nom, avant: prescription(l), apres: null });
      lignes.push({ mouvement: "ajoute", nom: suivante.nom, avant: null, apres: prescription(suivante) });
      continue;
    }
    lignes.push({
      mouvement: "modifie",
      nom: l.nom,
      avant: prescription(l),
      apres: prescription(suivante),
    });
  }

  // Ce qui n'était pas là avant : la ligne créée par un ajout, et rien d'autre.
  // Un remplacement garde l'identifiant de sa ligne, il est déjà traité plus haut.
  for (const l of apres) {
    if (l.id !== NOUVELLE_LIGNE && parIdAvant.has(l.id)) continue;
    lignes.push({ mouvement: "ajoute", nom: l.nom, avant: null, apres: prescription(l) });
  }

  const seriesAvant = totalSeries(avant);
  const seriesApres = totalSeries(apres);

  return {
    resume: resumer(lignes, seriesAvant, seriesApres),
    lignes,
    seriesAvant,
    seriesApres,
    avertissements,
  };
}

function resumer(lignes: LigneApercu[], seriesAvant: number, seriesApres: number): string {
  const retires = lignes.filter((l) => l.mouvement === "retire").length;
  const ajoutes = lignes.filter((l) => l.mouvement === "ajoute").length;
  const modifies = lignes.filter((l) => l.mouvement === "modifie").length;

  const morceaux: string[] = [];
  if (retires === 1 && ajoutes === 1) morceaux.push("Un exercice remplacé");
  else {
    if (ajoutes) morceaux.push(ajoutes === 1 ? "Un exercice ajouté" : `${ajoutes} exercices ajoutés`);
    if (retires) morceaux.push(retires === 1 ? "Un exercice retiré" : `${retires} exercices retirés`);
  }
  if (modifies) morceaux.push(modifies === 1 ? "Une prescription ajustée" : `${modifies} prescriptions ajustées`);
  if (morceaux.length === 0) morceaux.push("Aucun changement");

  const ecart = seriesApres - seriesAvant;
  const volume =
    ecart === 0
      ? "volume inchangé"
      : `${ecart > 0 ? "+" : "−"}${Math.abs(ecart)} série${Math.abs(ecart) > 1 ? "s" : ""}`;

  return `${morceaux.join(", ")} — ${volume} sur la séance.`;
}

/**
 * L'aperçu rendu au modèle, en texte.
 *
 * Le modèle a besoin de savoir ce qu'il vient de proposer pour en parler
 * correctement, mais il ne décide plus rien à ce stade : la carte que voit
 * l'athlète est construite depuis `Apercu`, pas depuis ce texte.
 */
export function apercuEnTexte(apercu: Apercu): string {
  const symboles: Record<Mouvement, string> = {
    retire: "−", ajoute: "+", modifie: "~", inchange: " ",
  };
  const corps = apercu.lignes
    .filter((l) => l.mouvement !== "inchange")
    .map((l) => `${symboles[l.mouvement]} ${l.nom} : ${l.avant ?? "—"} → ${l.apres ?? "—"}`)
    .join("\n");
  const alertes = apercu.avertissements.length
    ? `\nÀ signaler : ${apercu.avertissements.join(" ; ")}`
    : "";
  return `${apercu.resume}\n${corps}${alertes}`;
}
