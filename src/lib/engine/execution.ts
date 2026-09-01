/**
 * Ce qu'il faut savoir pour EXÉCUTER un mouvement, par opposition à le programmer.
 *
 * L'application savait proposer une séance, résoudre le matériel, enregistrer
 * des séries et suivre la progression. Debout devant la machine, il manquait
 * pourtant l'essentiel : à quel cran mettre le siège, quelle amplitude viser,
 * quel tempo tenir, et ce qu'on s'était noté la dernière fois.
 *
 * Trois natures d'information, à ne pas confondre :
 *
 *   FICHE TECHNIQUE   appartient au MOUVEMENT. « Le dos reste plaqué. » Vraie
 *                     partout, sur n'importe quelle machine, pour n'importe qui.
 *
 *   RÉGLAGES DISPONIBLES  appartiennent à l'APPAREIL. « Cette Leg Extension a
 *                     un siège à 10 crans. » Vrai de cette machine-là, pas du
 *                     mouvement, et pas de la personne.
 *
 *   RÉGLAGES PERSONNELS   appartiennent au COUPLE personne × appareil. « Sacha
 *                     met le siège au 6. » Ni transposable à une autre machine
 *                     du même exercice, ni partageable entre comptes.
 *
 * Les mélanger produirait exactement les faux souvenirs qu'on veut éviter : un
 * cran de siège recopié d'une machine à l'autre est pire qu'un cran absent.
 */

// ---------------------------------------------------------------------------
// Tempo
// ---------------------------------------------------------------------------

/**
 * Un tempo décrit les quatre temps d'une répétition, en secondes.
 *
 *     3-1-1-0
 *     │ │ │ └── pause en position contractée
 *     │ │ └──── phase concentrique (on soulève)
 *     │ └────── pause en position étirée
 *     └──────── phase excentrique (on retient)
 *
 * L'ordre est celui de la convention usuelle, qui commence par l'excentrique :
 * une répétition, dans la plupart des exercices, part de la position haute.
 *
 * `0` veut dire « sans pause », pas « le plus vite possible ». `X` existe dans
 * la littérature pour « explosif » ; on ne l'accepte pas ici, faute de savoir
 * quoi en faire dans un décompte.
 */
export const PHASES_TEMPO = [
  { cle: "excentrique", libelle: "Descente", explication: "Phase excentrique : on retient la charge" },
  { cle: "pause_etire", libelle: "Pause basse", explication: "Pause en position étirée" },
  { cle: "concentrique", libelle: "Montée", explication: "Phase concentrique : on soulève" },
  { cle: "pause_contracte", libelle: "Pause haute", explication: "Pause en position contractée" },
] as const;

export interface Tempo {
  excentrique: number;
  pauseEtire: number;
  concentrique: number;
  pauseContracte: number;
}

const FORMAT_TEMPO = /^(\d{1,2})-(\d{1,2})-(\d{1,2})-(\d{1,2})$/;

/**
 * Lit un tempo écrit. `null` sur tout ce qui n'est pas un tempo valide — jamais
 * une valeur de remplacement : un tempo inventé se tiendrait, et fausserait
 * l'exécution avec l'autorité d'une consigne.
 */
export function lireTempo(valeur: string | null | undefined): Tempo | null {
  if (!valeur) return null;
  const m = FORMAT_TEMPO.exec(valeur.trim());
  if (!m) return null;
  return {
    excentrique: Number(m[1]),
    pauseEtire: Number(m[2]),
    concentrique: Number(m[3]),
    pauseContracte: Number(m[4]),
  };
}

export function ecrireTempo(t: Tempo): string {
  return `${t.excentrique}-${t.pauseEtire}-${t.concentrique}-${t.pauseContracte}`;
}

/** Durée d'une répétition au tempo prescrit, en secondes. */
export function secondesParRepetition(t: Tempo): number {
  return t.excentrique + t.pauseEtire + t.concentrique + t.pauseContracte;
}

/** D'où vient le tempo affiché — l'UI le dit quand on ouvre le détail. */
export type OrigineTempo = "seance" | "programme" | "exercice";

export interface TempoResolu {
  tempo: Tempo;
  brut: string;
  origine: OrigineTempo;
}

/**
 * Le tempo qui s'applique aujourd'hui, et d'où il vient.
 *
 * Trois niveaux, du plus précis au plus général : ce que la séance prescrit
 * pour aujourd'hui l'emporte sur ce que le programme prescrit en général, qui
 * l'emporte sur le tempo propre au mouvement.
 *
 * Le quatrième cas est le plus important : quand aucun niveau n'en porte, il
 * n'y a PAS de tempo. On ne descend pas sur un `3-1-1-0` universel — ce serait
 * une consigne inventée, appliquée à des mouvements qui ne la méritent pas, et
 * l'athlète n'aurait aucun moyen de distinguer une prescription réfléchie d'un
 * remplissage automatique.
 *
 * Un tempo mal écrit à un niveau ne fait pas descendre au niveau suivant : il
 * est ignoré comme s'il était absent, et les niveaux inférieurs reprennent la
 * main. Une saisie fautive ne doit pas masquer une prescription valide.
 */
export function tempoEffectif(entrees: {
  seance?: string | null;
  programme?: string | null;
  exercice?: string | null;
}): TempoResolu | null {
  const niveaux: Array<[OrigineTempo, string | null | undefined]> = [
    ["seance", entrees.seance],
    ["programme", entrees.programme],
    ["exercice", entrees.exercice],
  ];
  for (const [origine, brut] of niveaux) {
    const tempo = lireTempo(brut);
    if (tempo) return { tempo, brut: ecrireTempo(tempo), origine };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Fiche technique
// ---------------------------------------------------------------------------

/**
 * Ce qu'on peut dire d'un mouvement, indépendamment du lieu et de la personne.
 *
 * Toutes les sections sont facultatives, et c'est la propriété qui compte : le
 * catalogue en compte cent vingt, ils ne seront pas renseignés le même jour.
 * Une section absente disparaît de l'écran — elle n'affiche ni « non
 * renseigné », ni un texte générique, ni un placeholder.
 *
 * Les points clés sont bornés à quatre. Ce n'est pas une limite technique :
 * au-delà, on ne les lit plus entre deux séries, et une consigne qu'on ne lit
 * pas ne protège personne.
 */
export interface FicheTechnique {
  description?: string;
  positionDepart?: string;
  execution?: string;
  amplitude?: string;
  respiration?: string;
  pointsCles?: string[];
  erreursFrequentes?: string[];
  securite?: string;
}

export const MAX_POINTS_CLES = 4;
export const MAX_ERREURS = 4;

/** Une fiche vide n'est pas une fiche : rien ne doit s'ouvrir pour rien. */
export function ficheRenseignee(f: FicheTechnique | null | undefined): boolean {
  if (!f) return false;
  return Boolean(
    f.description || f.positionDepart || f.execution || f.amplitude || f.respiration
    || f.securite || f.pointsCles?.length || f.erreursFrequentes?.length,
  );
}

// ---------------------------------------------------------------------------
// Réglages : ce que l'appareil propose
// ---------------------------------------------------------------------------

/**
 * Le TYPE d'une valeur de réglage, qui décide de la saisie et de la validation.
 *
 *   `cran`   un entier dans une plage — le cas de loin le plus fréquent :
 *            siège 1 à 10, rack 1 à 20, safety 1 à 12.
 *   `degres` un angle — inclinaison de banc, essentiellement.
 *   `choix`  une liste fermée — « poignée neutre / pronation / supination ».
 *   `texte`  le mode libre, pour ce qu'on n'a pas su modéliser. Toléré, jamais
 *            préféré : une valeur libre ne se compare pas d'une fois sur
 *            l'autre, et n'avertit de rien quand elle est aberrante.
 */
export const TYPES_REGLAGE = ["cran", "degres", "choix", "texte"] as const;
export type TypeReglage = (typeof TYPES_REGLAGE)[number];

/**
 * Ce que CETTE machine propose comme réglage. Une ligne par possibilité
 * physique : « il y a un siège, il a dix crans ».
 *
 * Cette définition ne dit rien de la personne. Elle décrit l'objet, elle est
 * donc commune à tous les comptes du lieu — comme l'instance elle-même.
 */
export interface DefinitionReglage {
  cle: string;
  libelle: string;
  type: TypeReglage;
  /** Bornes incluses, pour `cran` et `degres`. */
  min?: number | null;
  max?: number | null;
  /** Valeurs acceptées, pour `choix`. */
  options?: string[] | null;
  unite?: string | null;
  ordre: number;
}

export type RefusReglage =
  | { motif: "cle_inconnue" }
  | { motif: "vide" }
  | { motif: "pas_un_nombre" }
  | { motif: "hors_plage"; min: number | null; max: number | null }
  | { motif: "hors_options"; options: string[] };

export interface ValidationReglage {
  valide: boolean;
  /** La valeur telle qu'elle sera stockée. Jamais corrigée en silence. */
  valeur?: string;
  refus?: RefusReglage;
}

/**
 * Une valeur est-elle acceptable pour ce réglage ?
 *
 * Le principe : pas de coercition silencieuse. Un siège à 14 sur une machine
 * qui en compte 10 est refusé et dit pourquoi ; il n'est ni ramené à 10, ni
 * enregistré tel quel. La première option produirait un souvenir faux, la
 * seconde un souvenir inutilisable.
 *
 * Une clé qu'aucune définition ne décrit est refusée elle aussi : sans
 * définition, on ne saurait ni afficher la valeur, ni la vérifier, ni dire à
 * quoi elle correspond sur la machine.
 */
export function validerReglage(
  definition: DefinitionReglage | undefined,
  valeurBrute: string,
): ValidationReglage {
  if (!definition) return { valide: false, refus: { motif: "cle_inconnue" } };

  const valeur = valeurBrute.trim();
  if (valeur === "") return { valide: false, refus: { motif: "vide" } };

  if (definition.type === "choix") {
    const options = definition.options ?? [];
    if (!options.includes(valeur)) {
      return { valide: false, refus: { motif: "hors_options", options } };
    }
    return { valide: true, valeur };
  }

  if (definition.type === "texte") return { valide: true, valeur };

  const nombre = Number(valeur.replace(",", "."));
  if (!Number.isFinite(nombre)) return { valide: false, refus: { motif: "pas_un_nombre" } };
  if (definition.type === "cran" && !Number.isInteger(nombre)) {
    return { valide: false, refus: { motif: "pas_un_nombre" } };
  }

  const min = definition.min ?? null;
  const max = definition.max ?? null;
  if ((min !== null && nombre < min) || (max !== null && nombre > max)) {
    return { valide: false, refus: { motif: "hors_plage", min, max } };
  }

  return { valide: true, valeur: String(nombre) };
}

/** Message destiné à l'athlète, pas au journal d'erreurs. */
export function messageDeRefus(refus: RefusReglage, definition?: DefinitionReglage): string {
  switch (refus.motif) {
    case "cle_inconnue":
      return "Cette machine ne décrit pas ce réglage.";
    case "vide":
      return "Aucune valeur saisie.";
    case "pas_un_nombre":
      return definition?.type === "cran"
        ? "Un cran s'écrit en nombre entier."
        : "Cette valeur doit être un nombre.";
    case "hors_plage": {
      const { min, max } = refus;
      if (min !== null && max !== null) return `Valeur possible entre ${min} et ${max}.`;
      if (min !== null) return `Valeur minimale : ${min}.`;
      return `Valeur maximale : ${max}.`;
    }
    case "hors_options":
      return `Valeurs possibles : ${refus.options.join(", ")}.`;
  }
}

// ---------------------------------------------------------------------------
// Réglages : ce que la personne a retenu
// ---------------------------------------------------------------------------

/** Une valeur mémorisée pour un couple personne × appareil. */
export interface ReglagePersonnel {
  cle: string;
  valeur: string;
}

export interface ReglageAffiche {
  cle: string;
  libelle: string;
  unite: string | null;
  /** `null` quand la personne ne l'a pas encore renseigné. */
  valeur: string | null;
  definition: DefinitionReglage;
}

/**
 * Ce que l'écran montre : les réglages de la machine, garnis de ce que la
 * personne a retenu.
 *
 * Un réglage sans valeur personnelle reste visible — c'est ainsi qu'on sait
 * qu'il existe et qu'on peut le renseigner — mais sa valeur est `null`, et
 * l'UI affiche l'absence plutôt qu'un nombre. Une valeur personnelle dont la
 * clé a disparu de la machine n'est pas affichée : la définition est la source
 * de vérité sur ce qui existe physiquement.
 */
export function reglagesAAfficher(
  definitions: DefinitionReglage[],
  personnels: ReglagePersonnel[],
): ReglageAffiche[] {
  const parCle = new Map(personnels.map((p) => [p.cle, p.valeur]));
  return [...definitions]
    .sort((a, b) => a.ordre - b.ordre || a.libelle.localeCompare(b.libelle))
    .map((d) => ({
      cle: d.cle,
      libelle: d.libelle,
      unite: d.unite ?? null,
      valeur: parCle.get(d.cle) ?? null,
      definition: d,
    }));
}

/**
 * Le résumé d'une ligne, pour la carte d'exercice : « Siège 6 · Dossier 3 ».
 *
 * Seuls les réglages RENSEIGNÉS y figurent. Montrer « Siège — » sur la carte
 * occuperait la place sans rien apprendre ; l'absence se découvre en ouvrant le
 * détail, où elle est actionnable.
 */
export function resumeDesReglages(affiches: ReglageAffiche[], maximum = 3): string | null {
  const garnis = affiches.filter((r) => r.valeur !== null);
  if (garnis.length === 0) return null;
  const parts = garnis.slice(0, maximum).map((r) => `${r.libelle} ${r.valeur}${r.unite ?? ""}`);
  if (garnis.length > maximum) parts.push(`+${garnis.length - maximum}`);
  return parts.join(" · ");
}
