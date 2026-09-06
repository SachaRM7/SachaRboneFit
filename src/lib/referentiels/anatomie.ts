import {
  MUSCLES, ZONES_DOULEUR, musclesDeLaZone,
  type Muscle, type ZoneDouleur,
} from "./muscles";

/**
 * Le corps, tel qu'on le MONTRE — et la frontière avec ce que le moteur en sait.
 *
 * Ce module ajoute une couche visuelle par-dessus `muscles.ts`. Il n'ajoute
 * AUCUN vocabulaire : il ne définit ni muscle, ni zone de douleur. Les quinze
 * `MUSCLES` et les dix-sept `ZONES_DOULEUR` restent les seules sources de
 * vérité, et ce fichier ne fait que dire où les poser sur une silhouette.
 *
 * LA RÈGLE QUI TIENT TOUT — deux sens, jamais mélangés
 *
 *   DOULEUR    région touchée → `zone` (une `ZoneDouleur`, rien d'autre) →
 *              `musclesDeLaZone(zone)` → moteur.
 *
 *              La région donne la PRÉCISION DU GESTE : quelle face, quel côté,
 *              quel endroit exact du membre. Elle ne donne aucune précision
 *              MÉDICALE, et le moteur n'en reçoit aucune : toucher le genou
 *              droit produit exactement ce que produisait la pastille
 *              « Genou », c'est-à-dire `[quadriceps, ischios]`. Face, dos et
 *              côté enrichissent le signalement consigné ; ils ne créent pas
 *              de muscle que le moteur ne connaît pas.
 *
 *   EXERCICE   `Muscle[]` → régions dont `muscles` contient ce muscle → teinte.
 *
 *              `muscles` ne sert QU'À PEINDRE. Il n'entre jamais dans la
 *              chaîne de douleur. C'est ce qui permet à une articulation
 *              d'exister visuellement sans prétendre être un muscle : le genou
 *              et le coude ont `muscles: []`, donc aucun exercice ne les
 *              allume, alors qu'on peut parfaitement y avoir mal.
 *
 * POURQUOI UN SVG ÉCRIT ICI plutôt qu'une planche anatomique
 *
 * Une illustration médicale importée promettrait une finesse que le moteur n'a
 * pas : quinze muscles, dix-sept zones. Montrer un deltoïde antérieur distinct
 * d'un deltoïde moyen, alors que les deux retombent sur `epaules`, ferait
 * croire à une précision inexistante. Des formes simples, lisibles au pouce,
 * disent exactement ce que l'application sait — et rien de plus.
 *
 * GAUCHE, DROITE, ET LE MIROIR
 *
 * Une géométrie est écrite UNE fois, sur la moitié droite de l'image, puis
 * reflétée. Le côté ANATOMIQUE qui en découle dépend de la face : vu de face,
 * la moitié droite de l'image est le côté GAUCHE de l'athlète ; vu de dos,
 * c'est son côté droit. C'est exactement l'erreur qu'on commet en salle devant
 * un miroir, et elle est résolue ici plutôt que dans chaque écran.
 */

// ---------------------------------------------------------------------------
// Le repère
// ---------------------------------------------------------------------------

/** Les deux faces montrées, jamais en même temps. */
export const FACES = ["face", "dos"] as const;
export type Face = (typeof FACES)[number];

export const LIBELLES_FACE: Record<Face, string> = {
  face: "De face",
  dos: "De dos",
};

/**
 * Le côté ANATOMIQUE, du point de vue de l'athlète.
 *
 * `centre` n'est pas « on ne sait pas » : c'est une région qui n'a pas de côté
 * — la nuque, le bas du dos, la sangle abdominale. Une gêne sur une région
 * latéralisée porte toujours `gauche` ou `droite`.
 */
export const COTES = ["gauche", "droite", "centre"] as const;
export type Cote = (typeof COTES)[number];

export const LIBELLES_COTE: Record<Cote, string> = {
  gauche: "gauche",
  droite: "droite",
  centre: "",
};

/** Le repère de dessin. Portrait : un corps est plus haut que large. */
export const VUE = { largeur: 120, hauteur: 260 } as const;

/** Formes acceptées. Volontairement deux, et pas des tracés libres. */
export type Forme =
  | { type: "rect"; x: number; y: number; w: number; h: number; rx: number }
  | { type: "ellipse"; cx: number; cy: number; rx: number; ry: number };

/** La même forme, reflétée par rapport à l'axe vertical du corps. */
export function refleter(forme: Forme): Forme {
  const axe = VUE.largeur;
  return forme.type === "rect"
    ? { ...forme, x: axe - forme.x - forme.w }
    : { ...forme, cx: axe - forme.cx };
}

/**
 * Le côté anatomique d'une forme posée sur la moitié droite de l'IMAGE.
 *
 * Vu de face on regarde l'athlète : sa gauche est à notre droite. Vu de dos on
 * regarde dans le même sens que lui : sa droite est à notre droite.
 */
export function coteDeLaMoitieDroite(face: Face): Cote {
  return face === "face" ? "gauche" : "droite";
}

// ---------------------------------------------------------------------------
// Les régions
// ---------------------------------------------------------------------------

interface Gabarit {
  /** Racine de l'identifiant. Le côté s'y ajoute pour les régions latéralisées. */
  base: string;
  libelle: string;
  /** La SEULE chose qui entre dans le moteur de douleur. */
  zone: ZoneDouleur;
  /**
   * Muscles à teinter en mode exercice. Vide pour une articulation : on peut y
   * avoir mal, aucun exercice ne l'entraîne.
   */
  muscles: readonly Muscle[];
  face: Face;
  /** Latéralisée : la forme est écrite à droite de l'image et reflétée. */
  laterale: boolean;
  forme: Forme;
}

/**
 * L'ordre compte : une région déclarée plus tard passe DEVANT.
 *
 * Les grandes surfaces d'abord, les articulations ensuite. Sans quoi le coude,
 * posé au bord du biceps, serait recouvert par lui et deviendrait intouchable.
 */
const GABARITS: readonly Gabarit[] = [
  // ---- de face ----
  {
    base: "nuque", libelle: "Nuque", zone: "Nuque / cervicales", muscles: [],
    face: "face", laterale: false,
    forme: { type: "rect", x: 50, y: 34, w: 20, h: 14, rx: 6 },
  },
  {
    base: "pectoraux", libelle: "Pectoraux", zone: "Pectoraux", muscles: ["pectoraux"],
    face: "face", laterale: true,
    forme: { type: "rect", x: 61, y: 64, w: 23, h: 25, rx: 7 },
  },
  {
    base: "abdomen", libelle: "Sangle abdominale", zone: "Sangle abdominale", muscles: ["core"],
    face: "face", laterale: false,
    forme: { type: "rect", x: 45, y: 92, w: 30, h: 32, rx: 9 },
  },
  {
    base: "epaule", libelle: "Épaule", zone: "Épaule", muscles: ["epaules"],
    face: "face", laterale: true,
    forme: { type: "ellipse", cx: 91, cy: 58, rx: 13, ry: 12 },
  },
  {
    base: "biceps", libelle: "Biceps", zone: "Coude", muscles: ["biceps"],
    face: "face", laterale: true,
    forme: { type: "rect", x: 84, y: 72, w: 17, h: 31, rx: 8 },
  },
  {
    base: "avant-bras", libelle: "Avant-bras", zone: "Avant-bras", muscles: ["avant_bras"],
    face: "face", laterale: true,
    forme: { type: "rect", x: 86, y: 119, w: 16, h: 28, rx: 8 },
  },
  {
    base: "aine", libelle: "Aine / adducteurs", zone: "Aine / adducteurs", muscles: ["adducteurs"],
    face: "face", laterale: true,
    forme: { type: "rect", x: 60, y: 133, w: 15, h: 18, rx: 6 },
  },
  {
    base: "quadriceps", libelle: "Quadriceps", zone: "Quadriceps", muscles: ["quadriceps"],
    face: "face", laterale: true,
    forme: { type: "rect", x: 61, y: 152, w: 21, h: 40, rx: 10 },
  },
  // Articulations de face — après les masses, pour rester atteignables.
  {
    base: "hanche", libelle: "Hanche", zone: "Hanche", muscles: [],
    face: "face", laterale: true,
    forme: { type: "ellipse", cx: 79, cy: 128, rx: 12, ry: 11 },
  },
  {
    base: "coude", libelle: "Coude", zone: "Coude", muscles: [],
    face: "face", laterale: true,
    forme: { type: "ellipse", cx: 92, cy: 110, rx: 10, ry: 9 },
  },
  {
    base: "poignet", libelle: "Poignet", zone: "Poignet", muscles: [],
    face: "face", laterale: true,
    forme: { type: "ellipse", cx: 94, cy: 153, rx: 9, ry: 8 },
  },
  {
    base: "genou", libelle: "Genou", zone: "Genou", muscles: [],
    face: "face", laterale: true,
    forme: { type: "ellipse", cx: 71, cy: 198, rx: 11, ry: 9 },
  },
  {
    base: "cheville", libelle: "Cheville", zone: "Cheville", muscles: [],
    face: "face", laterale: true,
    forme: { type: "ellipse", cx: 71, cy: 240, rx: 9, ry: 8 },
  },

  // ---- de dos ----
  {
    base: "nuque", libelle: "Nuque", zone: "Nuque / cervicales", muscles: [],
    face: "dos", laterale: false,
    forme: { type: "rect", x: 50, y: 34, w: 20, h: 14, rx: 6 },
  },
  {
    base: "haut-du-dos", libelle: "Haut du dos", zone: "Haut du dos", muscles: ["haut_dos"],
    face: "dos", laterale: false,
    forme: { type: "rect", x: 43, y: 60, w: 34, h: 25, rx: 8 },
  },
  {
    base: "dorsaux", libelle: "Grands dorsaux", zone: "Haut du dos", muscles: ["dorsaux"],
    face: "dos", laterale: true,
    forme: { type: "rect", x: 61, y: 86, w: 23, h: 26, rx: 7 },
  },
  {
    base: "lombaires", libelle: "Bas du dos", zone: "Bas du dos", muscles: ["lombaires"],
    face: "dos", laterale: false,
    forme: { type: "rect", x: 45, y: 100, w: 30, h: 22, rx: 7 },
  },
  {
    base: "epaule", libelle: "Arrière d'épaule", zone: "Épaule",
    muscles: ["deltoide_posterieur", "epaules"],
    face: "dos", laterale: true,
    forme: { type: "ellipse", cx: 91, cy: 58, rx: 13, ry: 12 },
  },
  {
    base: "triceps", libelle: "Triceps", zone: "Coude", muscles: ["triceps"],
    face: "dos", laterale: true,
    forme: { type: "rect", x: 84, y: 72, w: 17, h: 31, rx: 8 },
  },
  {
    base: "avant-bras", libelle: "Avant-bras", zone: "Avant-bras", muscles: ["avant_bras"],
    face: "dos", laterale: true,
    forme: { type: "rect", x: 86, y: 119, w: 16, h: 28, rx: 8 },
  },
  {
    base: "fessiers", libelle: "Fessiers", zone: "Fessiers", muscles: ["fessiers"],
    face: "dos", laterale: true,
    forme: { type: "rect", x: 61, y: 124, w: 21, h: 24, rx: 9 },
  },
  {
    base: "ischios", libelle: "Ischio-jambiers", zone: "Ischios", muscles: ["ischios"],
    face: "dos", laterale: true,
    forme: { type: "rect", x: 61, y: 152, w: 21, h: 40, rx: 10 },
  },
  {
    base: "mollets", libelle: "Mollets", zone: "Mollets", muscles: ["mollets"],
    face: "dos", laterale: true,
    forme: { type: "rect", x: 62, y: 206, w: 19, h: 28, rx: 9 },
  },
  {
    base: "coude", libelle: "Coude", zone: "Coude", muscles: [],
    face: "dos", laterale: true,
    forme: { type: "ellipse", cx: 92, cy: 110, rx: 10, ry: 9 },
  },
  {
    base: "poignet", libelle: "Poignet", zone: "Poignet", muscles: [],
    face: "dos", laterale: true,
    forme: { type: "ellipse", cx: 94, cy: 153, rx: 9, ry: 8 },
  },
  {
    base: "genou", libelle: "Genou", zone: "Genou", muscles: [],
    face: "dos", laterale: true,
    forme: { type: "ellipse", cx: 71, cy: 198, rx: 11, ry: 9 },
  },
  {
    base: "cheville", libelle: "Cheville", zone: "Cheville", muscles: [],
    face: "dos", laterale: true,
    forme: { type: "ellipse", cx: 71, cy: 240, rx: 9, ry: 8 },
  },
];

/** Une région dessinable et touchable, côté résolu. */
export interface RegionAnatomique {
  /** Stable : `face:base:cote`. Il voyage dans le contexte d'un incident. */
  id: string;
  libelle: string;
  /** Ce que l'écran annonce : « Épaule gauche ». */
  libelleComplet: string;
  zone: ZoneDouleur;
  muscles: readonly Muscle[];
  face: Face;
  cote: Cote;
  forme: Forme;
}

function region(g: Gabarit, cote: Cote, forme: Forme): RegionAnatomique {
  const suffixe = LIBELLES_COTE[cote];
  return {
    id: `${g.face}:${g.base}:${cote}`,
    libelle: g.libelle,
    libelleComplet: suffixe ? `${g.libelle} ${suffixe}` : g.libelle,
    zone: g.zone,
    muscles: g.muscles,
    face: g.face,
    cote,
    forme,
  };
}

/** Toutes les régions, les deux faces confondues, côtés développés. */
export const REGIONS: readonly RegionAnatomique[] = GABARITS.flatMap((g) => {
  if (!g.laterale) return [region(g, "centre", g.forme)];
  const aDroiteDeLImage = coteDeLaMoitieDroite(g.face);
  const aGaucheDeLImage: Cote = aDroiteDeLImage === "gauche" ? "droite" : "gauche";
  return [
    region(g, aDroiteDeLImage, g.forme),
    region(g, aGaucheDeLImage, refleter(g.forme)),
  ];
});

export const REGIONS_PAR_ID = new Map(REGIONS.map((r) => [r.id, r]));

/** Les régions d'une face, dans l'ordre de dessin. */
export function regionsDeLaFace(face: Face): RegionAnatomique[] {
  return REGIONS.filter((r) => r.face === face);
}

// ---------------------------------------------------------------------------
// Sens 1 — de la douleur vers le moteur
// ---------------------------------------------------------------------------

/**
 * Les zones de douleur désignées par une sélection de régions.
 *
 * C'est le seul pont vers le moteur, et il est volontairement étroit : ni la
 * face, ni le côté, ni l'identifiant de région ne le franchissent. Deux régions
 * qui pointent vers la même zone n'en produisent qu'une.
 */
export function zonesDesRegions(ids: readonly string[]): ZoneDouleur[] {
  const vues = new Set<ZoneDouleur>();
  for (const id of ids) {
    const r = REGIONS_PAR_ID.get(id);
    if (r) vues.add(r.zone);
  }
  return [...vues];
}

/**
 * Les muscles canoniques d'une sélection — par les ZONES, jamais par `muscles`.
 *
 * La distinction est tout l'objet du module. Toucher le genou donne
 * `[quadriceps, ischios]`, comme la pastille « Genou » le donnait déjà, et non
 * le tableau vide que porte la région du genou.
 */
export function musclesDesRegions(ids: readonly string[]): Muscle[] {
  const vus = new Set<Muscle>();
  for (const zone of zonesDesRegions(ids)) {
    for (const m of musclesDeLaZone(zone)) vus.add(m);
  }
  return [...vus];
}

/** Ce qu'on consigne d'une région : assez pour relire, jamais un diagnostic. */
export interface RegionSignalee {
  id: string;
  libelle: string;
  zone: ZoneDouleur;
  face: Face;
  cote: Cote;
}

export function regionsSignalees(ids: readonly string[]): RegionSignalee[] {
  return ids.flatMap((id) => {
    const r = REGIONS_PAR_ID.get(id);
    return r ? [{ id: r.id, libelle: r.libelle, zone: r.zone, face: r.face, cote: r.cote }] : [];
  });
}

// ---------------------------------------------------------------------------
// Sens 2 — de l'exercice vers l'image
// ---------------------------------------------------------------------------

/** Trois niveaux, et pas davantage : lu d'un coup d'œil entre deux séries. */
export type Sollicitation = "principal" | "secondaire" | "aucun";

/**
 * Ce que chaque région doit montrer pour un exercice donné.
 *
 * Un muscle à la fois principal et secondaire — le catalogue en contient —
 * compte comme principal : c'est le niveau le plus fort qui gagne, sinon
 * l'affichage minimiserait ce que l'exercice vise vraiment.
 */
export function sollicitationDesRegions(
  principaux: readonly Muscle[],
  secondaires: readonly Muscle[],
): Map<string, Sollicitation> {
  const p = new Set(principaux);
  const s = new Set(secondaires);
  const par = new Map<string, Sollicitation>();
  for (const r of REGIONS) {
    const niveau: Sollicitation = r.muscles.some((m) => p.has(m))
      ? "principal"
      : r.muscles.some((m) => s.has(m))
        ? "secondaire"
        : "aucun";
    par.set(r.id, niveau);
  }
  return par;
}

/** La face qui montre le plus de ce que cet exercice travaille. */
export function faceLaPlusParlante(
  principaux: readonly Muscle[],
  secondaires: readonly Muscle[],
): Face {
  const par = sollicitationDesRegions(principaux, secondaires);
  const score = (face: Face) =>
    regionsDeLaFace(face).reduce((n, r) => {
      const niveau = par.get(r.id);
      return n + (niveau === "principal" ? 2 : niveau === "secondaire" ? 1 : 0);
    }, 0);
  // À égalité — y compris quand rien n'est renseigné — la face, qui est la vue
  // par défaut partout ailleurs.
  return score("dos") > score("face") ? "dos" : "face";
}

// ---------------------------------------------------------------------------
// Garde-fous, vérifiés par les tests
// ---------------------------------------------------------------------------

/** Zones du référentiel qu'aucune région ne permet de désigner. */
export function zonesSansRegion(): string[] {
  const couvertes = new Set(REGIONS.map((r) => r.zone));
  return ZONES_DOULEUR.map((z) => z.zone).filter((z) => !couvertes.has(z));
}

/** Muscles du référentiel qu'aucune région ne sait teinter. */
export function musclesSansRegion(): Muscle[] {
  const peints = new Set(REGIONS.flatMap((r) => [...r.muscles]));
  return MUSCLES.filter((m) => !peints.has(m));
}
