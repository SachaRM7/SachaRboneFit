/**
 * Ce qu'un appareil permet réellement d'atteindre.
 *
 * Une seule question, posée partout de la même façon : « à partir de cette
 * valeur, quelle est la prochaine réellement atteignable sur CET appareil ? »
 *
 * Elle avait deux réponses. La double progression prenait `incrementsPossibles[0]`
 * — le premier élément du tableau, c'est-à-dire l'ordre de saisie. La
 * calibration prenait `Math.min(...increments)` — le plus petit. Sur une entrée
 * saisie `[5, 2.5]`, l'une ajoutait 5 kg et l'autre arrondissait à 2,5 : deux
 * modules prescrivaient des charges différentes sur la même machine, et l'ordre
 * du tableau constituait une règle métier que personne n'avait écrite.
 *
 * Ici, un tableau d'incréments est un ENSEMBLE : son ordre ne signifie rien.
 * Le plus petit engendre la grille — c'est le plus petit changement de charge
 * physiquement réalisable, donc la définition de « la valeur suivante ».
 *
 * Ce module ne décide pas si une progression est souhaitable. Il dit ce qui est
 * atteignable, de combien on bouge en absolu et en relatif, et quand on est en
 * butée. Aucune règle n'interdit ici un grand écart relatif : l'information est
 * exposée, la décision appartient à l'appelant.
 */

export type NatureCharge = "resistance" | "assistance";

export const NATURES_CHARGE = ["resistance", "assistance"] as const;

export const ETATS_INSTANCE = ["disponible", "temporairement_indisponible"] as const;
export type EtatInstance = (typeof ETATS_INSTANCE)[number];

/**
 * Ce qu'il faut savoir d'un appareil pour prescrire une charge dessus.
 *
 * `null` signifie inconnu, partout. Jamais « prends la valeur habituelle ».
 */
export interface ConfigurationCharge {
  natureCharge: NatureCharge;
  /** Collection discrète des charges atteignables. Prime sur les incréments. */
  paliersCharges: number[] | null;
  /** Sauts mesurés. `null` ou vide : inconnus. */
  incrementsPossibles: number[] | null;
  /** Premier cran, haltère le plus léger, barre à vide. */
  chargeMinimale: number | null;
  /** Dernier cran de la pile, chargement maximal admis. */
  chargeMax: number | null;
}

/**
 * La configuration telle qu'elle sort de la base.
 *
 * Une seule conversion, pour que personne ne réinterprète `null` à sa façon en
 * chemin. Un tableau vide vaut inconnu : c'est ce que la base contenait avant
 * que la colonne devienne nullable.
 */
export function configurationDe(instance: {
  natureCharge?: string | null;
  paliersCharges?: number[] | null;
  incrementsPossibles?: number[] | null;
  chargeMinimale?: number | null;
  chargeMax?: number | null;
}): ConfigurationCharge {
  return {
    natureCharge: instance.natureCharge === "assistance" ? "assistance" : "resistance",
    paliersCharges: paliersUtilisables(instance.paliersCharges ?? null),
    incrementsPossibles:
      instance.incrementsPossibles && instance.incrementsPossibles.length > 0
        ? instance.incrementsPossibles
        : null,
    chargeMinimale: instance.chargeMinimale ?? null,
    chargeMax: instance.chargeMax ?? null,
  };
}

/** Un appareil dont on ne sait rien : ni paliers, ni crans, ni bornes. */
export const CHARGE_INCONNUE: ConfigurationCharge = {
  natureCharge: "resistance",
  paliersCharges: null,
  incrementsPossibles: null,
  chargeMinimale: null,
  chargeMax: null,
};

export type StatutCharge =
  /** Une valeur différente existe, et la voici. */
  | "atteignable"
  /** L'appareil ne va pas plus loin dans ce sens : `valeur` est la butée. */
  | "butee"
  /** L'appareil n'a pas été mesuré : rien ne peut être proposé sans l'inventer. */
  | "indeterminable";

export interface ResolutionCharge {
  statut: StatutCharge;
  /** La charge retenue. `null` seulement quand rien n'est déterminable. */
  valeur: number | null;
  /** `valeur - depuis`. Négatif quand la charge baisse — assistance comprise. */
  delta: number | null;
  /** `delta / depuis`, en fraction. `null` si le point de départ est nul. */
  deltaRelatif: number | null;
  butee: "minimum" | "maximum" | null;
  motif: string;
}

/** Les flottants du terrain : 2,3 + 2,3 ne fait pas exactement 4,6. */
const EPSILON = 1e-6;

function arrondiPropre(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Le tableau est un ensemble : seul le plus petit saut engendre la grille. */
export function pasDeLaGrille(increments: number[] | null | undefined): number | null {
  if (!increments || increments.length === 0) return null;
  const positifs = increments.filter((i) => Number.isFinite(i) && i > 0);
  if (positifs.length === 0) return null;
  return Math.min(...positifs);
}

export function paliersUtilisables(paliers: number[] | null | undefined): number[] | null {
  if (!paliers || paliers.length === 0) return null;
  const propres = [...new Set(paliers.filter((p) => Number.isFinite(p) && p >= 0))].sort(
    (a, b) => a - b,
  );
  return propres.length > 0 ? propres : null;
}

/**
 * L'appareil a-t-il été assez décrit pour qu'on prescrive dessus ?
 *
 * Sert aux écrans autant qu'au moteur : c'est ce qui distingue « je ne sais pas
 * encore » de « il n'y a rien à proposer ».
 */
export function chargesConnues(config: ConfigurationCharge): boolean {
  return paliersUtilisables(config.paliersCharges) !== null
    || pasDeLaGrille(config.incrementsPossibles) !== null;
}

function indeterminable(motif: string): ResolutionCharge {
  return { statut: "indeterminable", valeur: null, delta: null, deltaRelatif: null, butee: null, motif };
}

function resultat(
  depuis: number,
  valeur: number,
  statut: "atteignable" | "butee",
  butee: "minimum" | "maximum" | null,
  motif: string,
): ResolutionCharge {
  const v = arrondiPropre(valeur);
  const delta = arrondiPropre(v - depuis);
  return {
    statut,
    valeur: v,
    delta,
    deltaRelatif: depuis > 0 ? Math.round((delta / depuis) * 10000) / 10000 : null,
    butee,
    motif,
  };
}

/** Bornes effectives, dans l'ordre. */
function bornes(config: ConfigurationCharge): { min: number | null; max: number | null } {
  const paliers = paliersUtilisables(config.paliersCharges);
  if (paliers) {
    // Une collection discrète EST ses bornes : un râtelier de barres n'a pas de
    // plafond séparé. Un plancher déclaré plus haut le restreint encore.
    const min = config.chargeMinimale !== null
      ? Math.max(config.chargeMinimale, paliers[0]!)
      : paliers[0]!;
    const max = config.chargeMax !== null
      ? Math.min(config.chargeMax, paliers[paliers.length - 1]!)
      : paliers[paliers.length - 1]!;
    return { min, max };
  }
  return { min: config.chargeMinimale, max: config.chargeMax };
}

/**
 * La charge atteignable la plus proche d'une valeur visée.
 *
 * C'est ce dont la calibration a besoin : elle calcule une charge théorique,
 * puis demande ce que l'appareil sait réellement produire à cet endroit.
 */
export function chargeAtteignable(
  config: ConfigurationCharge,
  visee: number,
): ResolutionCharge {
  const paliers = paliersUtilisables(config.paliersCharges);
  const { min, max } = bornes(config);

  if (paliers) {
    const admissibles = paliers.filter(
      (p) => (min === null || p >= min - EPSILON) && (max === null || p <= max + EPSILON),
    );
    if (admissibles.length === 0) {
      return indeterminable("aucun palier ne tient dans les bornes déclarées");
    }
    const proche = admissibles.reduce((meilleur, p) =>
      Math.abs(p - visee) < Math.abs(meilleur - visee) ? p : meilleur,
    );
    if (visee < proche - EPSILON && proche === admissibles[0]) {
      return resultat(visee, proche, "butee", "minimum", "plus léger que le premier palier");
    }
    if (visee > proche + EPSILON && proche === admissibles[admissibles.length - 1]) {
      return resultat(visee, proche, "butee", "maximum", "plus lourd que le dernier palier");
    }
    return resultat(visee, proche, "atteignable", null, "palier le plus proche");
  }

  const pas = pasDeLaGrille(config.incrementsPossibles);
  if (pas === null) {
    return indeterminable("incréments inconnus sur cet appareil");
  }

  // La grille est ancrée sur le plancher quand il est connu : une pile qui
  // commence à 5 et monte par 5 donne 5, 10, 15 — pas 0, 5, 10.
  const ancre = min ?? 0;
  const arrondie = ancre + Math.round((visee - ancre) / pas) * pas;

  if (min !== null && arrondie < min - EPSILON) {
    return resultat(visee, min, "butee", "minimum", "sous le premier cran");
  }
  if (max !== null && arrondie > max + EPSILON) {
    // Le dernier cran réellement atteignable, pas le plafond nominal.
    const dernier = ancre + Math.floor((max - ancre) / pas + EPSILON) * pas;
    return resultat(visee, dernier, "butee", "maximum", "au-delà du dernier cran");
  }
  return resultat(visee, arrondie, "atteignable", null, "arrondi au cran disponible");
}

/**
 * La charge suivante dans le sens de la PROGRESSION.
 *
 * Pour une résistance, la suivante est plus lourde. Pour une assistance, elle
 * est plus faible : progresser, c'est avoir besoin de moins d'aide. Le sens
 * n'est pas un réglage à déclarer, il découle de ce que le nombre mesure.
 */
export function prochaineCharge(
  config: ConfigurationCharge,
  depuis: number,
): ResolutionCharge {
  const versLeHaut = config.natureCharge !== "assistance";
  const paliers = paliersUtilisables(config.paliersCharges);
  const { min, max } = bornes(config);

  if (paliers) {
    const admissibles = paliers.filter(
      (p) => (min === null || p >= min - EPSILON) && (max === null || p <= max + EPSILON),
    );
    if (admissibles.length === 0) {
      return indeterminable("aucun palier ne tient dans les bornes déclarées");
    }
    const suivant = versLeHaut
      ? admissibles.find((p) => p > depuis + EPSILON)
      : [...admissibles].reverse().find((p) => p < depuis - EPSILON);

    if (suivant === undefined) {
      const butee = versLeHaut ? admissibles[admissibles.length - 1]! : admissibles[0]!;
      return resultat(
        depuis,
        butee,
        "butee",
        versLeHaut ? "maximum" : "minimum",
        versLeHaut ? "dernier palier de la collection" : "premier palier de la collection",
      );
    }
    return resultat(depuis, suivant, "atteignable", null, "palier suivant de la collection");
  }

  const pas = pasDeLaGrille(config.incrementsPossibles);
  if (pas === null) {
    return indeterminable("incréments inconnus sur cet appareil");
  }

  const vise = versLeHaut ? depuis + pas : depuis - pas;

  if (versLeHaut && max !== null && vise > max + EPSILON) {
    return resultat(depuis, Math.min(depuis, max), "butee", "maximum", "dernier cran atteint");
  }
  if (!versLeHaut && min !== null && vise < min - EPSILON) {
    return resultat(depuis, Math.max(depuis, min), "butee", "minimum", "premier cran atteint");
  }
  // Une assistance descend jusqu'à zéro et pas en dessous : à zéro, l'exercice
  // se fait au poids du corps, il n'y a plus rien à retirer.
  if (!versLeHaut && min === null && vise < -EPSILON) {
    return resultat(depuis, 0, "butee", "minimum", "plus aucune assistance à retirer");
  }
  if (versLeHaut && min !== null && vise < min - EPSILON) {
    return resultat(depuis, min, "atteignable", null, "premier cran de l'appareil");
  }

  return resultat(depuis, vise, "atteignable", null, "cran suivant de l'appareil");
}

// ---------------------------------------------------------------------------
// Ce que la charge d'un appareil autorise comme lecture
// ---------------------------------------------------------------------------

/**
 * Le nombre saisi mesure-t-il des kilogrammes comparables ailleurs ?
 *
 * Une pile Matrix affichant 40 et une pile Technogym affichant 40 ne déplacent
 * pas la même chose : bras de levier, poulies, frottements. Le nombre reste
 * parfaitement utile — mais comme INDICE LOCAL, comparable à lui-même sur cette
 * entrée, et à rien d'autre.
 *
 * Les charges libres échappent à cela : 60 kg à la barre sont 60 kg partout.
 * Comparables longitudinalement à convention et entrée constantes — jamais
 * entre une barre et des haltères, entre « par haltère » et charge totale,
 * entre deux variantes d'un mouvement, ni entre deux appareils.
 */
export type PorteeDeLaMesure = "kilos" | "indice_local" | "assistance";

export function porteeDeLaMesure(entree: {
  natureCharge: NatureCharge | string | null | undefined;
  conventionCharge: string | null | undefined;
}): PorteeDeLaMesure {
  if (entree.natureCharge === "assistance") return "assistance";
  // Une masse totale et une masse par main sont toutes deux de vrais kilos,
  // mais ne deviennent pas comparables entre elles pour autant : la portée ne
  // sert qu'à choisir la métrique, et l'instance/convention borne l'historique.
  return entree.conventionCharge === "poids_total"
    || entree.conventionCharge === "poids_par_main"
    ? "kilos"
    : "indice_local";
}

/**
 * Un maximum estimé a-t-il un sens ici ?
 *
 * Sur une assistance, non : la formule d'Epley suppose qu'une charge résiste.
 * Fabriquer un « poids du corps moins assistance » ne sauverait rien — rien ne
 * garantit un poids du corps daté à chaque séance, et la métrique honnête est
 * l'assistance elle-même, qui baisse.
 */
export function e1rmApplicable(natureCharge: NatureCharge | string | null | undefined): boolean {
  return natureCharge !== "assistance";
}

/** Comment nommer la courbe, sans prétendre à une force absolue en kilos. */
export function libelleDeLaMesure(portee: PorteeDeLaMesure): string {
  switch (portee) {
    case "kilos":
      return "1RM estimé";
    case "assistance":
      return "Assistance";
    default:
      return "Indice de performance estimé";
  }
}

/**
 * Propriétés qui figent l'interprétation de l'historique.
 *
 * Changer l'une d'elles après coup ne corrige pas une erreur de saisie : cela
 * réécrit le sens de séries déjà enregistrées. Une pile relue comme un poids
 * total ferait bondir une courbe sans qu'on ait soulevé un gramme de plus.
 */
export const PROPRIETES_FIGEES_PAR_L_HISTORIQUE = [
  "conventionCharge",
  "natureCharge",
  "paliersCharges",
  "chargeMinimale",
] as const;

export type ProprieteFigee = (typeof PROPRIETES_FIGEES_PAR_L_HISTORIQUE)[number];

function memeListe(a: number[] | null | undefined, b: number[] | null | undefined): boolean {
  const ga = paliersUtilisables(a ?? null);
  const gb = paliersUtilisables(b ?? null);
  if (ga === null || gb === null) return ga === gb;
  return ga.length === gb.length && ga.every((v, i) => Math.abs(v - gb[i]!) < EPSILON);
}

/**
 * Ce qu'une modification changerait au sens de l'historique.
 *
 * Renvoie la liste des propriétés figées réellement modifiées. Vide : la
 * modification est sans effet sur la lecture des séries passées.
 */
export function proprietesFigeesModifiees(
  avant: {
    conventionCharge: string;
    natureCharge: string;
    paliersCharges: number[] | null;
    chargeMinimale: number | null;
  },
  apres: Partial<{
    conventionCharge: string;
    natureCharge: string;
    paliersCharges: number[] | null;
    chargeMinimale: number | null;
  }>,
): ProprieteFigee[] {
  const touchees: ProprieteFigee[] = [];
  if (apres.conventionCharge !== undefined && apres.conventionCharge !== avant.conventionCharge) {
    touchees.push("conventionCharge");
  }
  if (apres.natureCharge !== undefined && apres.natureCharge !== avant.natureCharge) {
    touchees.push("natureCharge");
  }
  if (apres.paliersCharges !== undefined && !memeListe(apres.paliersCharges, avant.paliersCharges)) {
    touchees.push("paliersCharges");
  }
  if (
    apres.chargeMinimale !== undefined
    && (apres.chargeMinimale ?? null) !== (avant.chargeMinimale ?? null)
  ) {
    touchees.push("chargeMinimale");
  }
  return touchees;
}

export const LIBELLES_PROPRIETE_FIGEE: Record<ProprieteFigee, string> = {
  conventionCharge: "la convention de charge",
  natureCharge: "le sens de la charge",
  paliersCharges: "les paliers atteignables",
  chargeMinimale: "la charge minimale",
};

export function refusDeModification(touchees: ProprieteFigee[]): string {
  const quoi = touchees.map((t) => LIBELLES_PROPRIETE_FIGEE[t]).join(", ");
  return `Des séries ont déjà été enregistrées sur cet appareil : changer ${quoi} `
    + "changerait le sens de cet historique. Archive cette entrée et crée-en une nouvelle "
    + "si l'appareil a réellement changé.";
}
