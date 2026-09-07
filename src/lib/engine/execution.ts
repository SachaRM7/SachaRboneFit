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
/**
 * Les quatre phases, nommées par ce qu'elles SONT — pas par une direction.
 *
 * Elles s'appelaient « Descente », « Pause basse », « Montée », « Pause
 * haute ». C'est juste sur un squat et faux ailleurs, parfois exactement à
 * l'envers :
 *
 *   cable crunch   on enroule le buste VERS LE BAS pour produire l'effort —
 *                  le concentrique descend, l'excentrique remonte.
 *   seated row     rien ne monte ni ne descend : on tire vers l'arrière, on
 *                  laisse revenir vers l'avant.
 *   hack squat     là, oui : descente puis remontée.
 *
 * Un athlète qui lit « Montée — 1 s » sur un cable crunch apprend le contraire
 * du geste. Le repli générique dit donc la phase biomécanique, qui est vraie
 * partout, et la fiche de l'exercice fournit sa traduction concrète quand elle
 * en a une — voir `libellesPhasesTempo`.
 *
 * `terme` et non `libelle` : le nom dit que c'est le mot du modèle, celui qui
 * ne change pas d'un mouvement à l'autre. Le mot du geste, lui, vient d'ailleurs.
 */
export const PHASES_TEMPO = [
  {
    cle: "excentrique",
    terme: "Excentrique",
    explication: "Tu freines la charge : le muscle s'allonge sous tension.",
  },
  {
    cle: "pause_etire",
    terme: "Pause en position étirée",
    explication: "Le muscle est allongé, on marque un temps.",
  },
  {
    cle: "concentrique",
    terme: "Concentrique",
    explication: "Tu produis l'effort : le muscle se raccourcit.",
  },
  {
    cle: "pause_contracte",
    terme: "Pause en position contractée",
    explication: "Le muscle est raccourci, on marque un temps.",
  },
] as const;

export type PhaseTempo = (typeof PHASES_TEMPO)[number]["cle"];

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
/**
 * D'où vient le tempo affiché.
 *
 * `defaut` n'est pas une absence : c'est la politique canonique, appliquée
 * faute de mieux et annoncée comme telle. La distinguer permet à l'écran de
 * dire « repère général » plutôt que de faire passer une convention pour une
 * prescription.
 */
export type OrigineTempo = "seance" | "programme" | "exercice" | "defaut";

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
/**
 * Le tempo qu'on applique faute de prescription, et pourquoi il existe.
 *
 * Pendant toute la séance du 6 septembre, le tempo a dû être demandé ailleurs
 * qu'à l'application : la chaîne de résolution fonctionne, elle est testée, et
 * elle rendait `null` — parce qu'AUCUN des exercices du catalogue ne porte de
 * tempo. Rien n'était cassé ; la donnée n'avait jamais été semée.
 *
 * Semer cent vingt tempos exacts n'est pas la réponse : ils seraient inventés
 * pour la plupart. Une politique canonique, si — elle est explicite, elle vaut
 * pour tout ce qui n'a rien de plus précis, et elle est remplacée dès qu'un
 * exercice, un programme ou une séance dit mieux.
 *
 * Deux valeurs, et il faut lire les chiffres dans le bon ordre :
 *
 *     excentrique - pause ÉTIRÉE - concentrique - pause CONTRACTÉE
 *
 *   polyarticulaire  `3-0-1-0` — trois secondes de freinage, aucune pause. Un
 *                    mouvement lourd s'enchaîne ; l'y arrêter en position
 *                    allongée ajoute de la contrainte sans ajouter de travail.
 *
 *   isolation        `3-1-1-0` — trois secondes de freinage, puis UNE SECONDE
 *                    EN POSITION ÉTIRÉE. C'est le deuxième chiffre, et il
 *                    porte bien sur l'allongement.
 *
 * CE COMMENTAIRE ÉTAIT FAUX, et le rectifier valait mieux que de changer la
 * valeur : il annonçait « marquer la position courte », c'est-à-dire la pause
 * CONTRACTÉE — le quatrième chiffre, qui vaut zéro. Les deux techniques
 * existent et se défendent pour une isolation ; celle que la valeur encode
 * depuis le début est la pause en position étirée, et c'est elle qui est
 * décrite ici. Déplacer la seconde sur le quatrième chiffre changerait le
 * repli de plus de cent exercices, ce qui est une décision de politique et pas
 * une correction de rédaction.
 *
 * Aucune des deux ne prétend valoir pour tous les exercices de sa famille, et
 * c'est précisément pour ça qu'elle porte l'origine « défaut ».
 */
export const TEMPO_CANONIQUE = {
  polyarticulaire: "3-0-1-0",
  isolation: "3-1-1-0",
} as const;

/**
 * Une phase, prête à afficher : le mot du geste, le terme du modèle, la durée.
 *
 * L'assemblage vit ICI, avec les phases et le tempo, plutôt que dans l'écran.
 * Mis dans le composant, il aurait pris la forme d'un `if slug === …` — et
 * c'est exactement ce qu'on refuse : le mot d'un mouvement appartient à sa
 * fiche, pas à un branchement dans du JSX.
 */
export interface PhaseAffichee {
  cle: PhaseTempo;
  /** Le mot du mouvement quand la fiche en donne un, le terme sinon. */
  libelle: string;
  /** Le terme biomécanique. Toujours là, pour apprendre. */
  terme: string;
  explication: string;
  /** Secondes lues dans le tempo. */
  secondes: number;
  /** Vrai quand `libelle` vient de la fiche et non du repli générique. */
  propreAuMouvement: boolean;
}

/**
 * Les quatre phases d'un tempo, nommées par ce mouvement-là quand c'est possible.
 *
 * L'ordre des chiffres n'est jamais recalculé : il vient de `PHASES_TEMPO`, et
 * `Tempo` porte les mêmes quatre valeurs. Une fiche ne peut donc pas renommer
 * une phase en une autre — elle ne fournit qu'un mot.
 */
export function phasesDuTempo(
  tempo: Tempo,
  libelles?: Partial<Record<PhaseTempo, string>>,
): PhaseAffichee[] {
  const secondes: Record<PhaseTempo, number> = {
    excentrique: tempo.excentrique,
    pause_etire: tempo.pauseEtire,
    concentrique: tempo.concentrique,
    pause_contracte: tempo.pauseContracte,
  };

  return PHASES_TEMPO.map((p) => {
    // Une chaîne vide n'est pas un libellé : elle laisserait la ligne muette.
    const propre = libelles?.[p.cle]?.trim();
    return {
      cle: p.cle,
      libelle: propre || p.terme,
      terme: p.terme,
      explication: p.explication,
      secondes: secondes[p.cle],
      propreAuMouvement: Boolean(propre),
    };
  });
}

export function tempoEffectif(entrees: {
  seance?: string | null;
  programme?: string | null;
  exercice?: string | null;
  /** `polyarticulaire` | `isolation`. Décide du repli canonique. */
  typeExercice?: string | null;
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

  // Le repli n'est proposé que si l'on sait de quelle famille il s'agit :
  // deviner sur rien vaudrait moins que ne rien dire.
  const canonique = entrees.typeExercice === "polyarticulaire"
    ? TEMPO_CANONIQUE.polyarticulaire
    : entrees.typeExercice === "isolation"
      ? TEMPO_CANONIQUE.isolation
      : null;
  const tempo = lireTempo(canonique);
  return tempo ? { tempo, brut: ecrireTempo(tempo), origine: "defaut" } : null;
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
  /**
   * Ce qu'on fait AVANT de commencer : s'installer, orienter le siège, saisir
   * la poignée, sortir de la machine.
   *
   * Séparé de `positionDepart` parce que ce sont deux moments distincts, et
   * que c'est le premier qui manquait le plus devant un appareil inconnu. Sur
   * une machine d'assistance, savoir comment monter dessus et en redescendre
   * vaut plus qu'une consigne d'amplitude.
   *
   * Il décrit un GESTE, jamais un chiffre : « règle le siège pour que… » et
   * non « siège 5 ». Un numéro de cran appartient à `instance_reglages`, et
   * cette fiche est commune à toutes les machines qui font ce mouvement.
   */
  installation?: string;
  positionDepart?: string;
  execution?: string;
  amplitude?: string;
  respiration?: string;
  /**
   * Où le travail doit se faire sentir.
   *
   * Formulé comme un repère, jamais comme un diagnostic : « tu devrais surtout
   * sentir… », et non « si tu ne le sens pas, tu exécutes mal ». Une sensation
   * dépend du gabarit, de la fatigue et de l'habitude ; en faire un verdict
   * ferait douter quelqu'un qui exécute correctement.
   */
  sensation?: string;
  pointsCles?: string[];
  erreursFrequentes?: string[];
  securite?: string;
  /**
   * Comment ce mouvement-là appelle ses quatre phases.
   *
   * « Excentrique » est vrai partout et ne dit rien à personne devant une
   * machine. « Descente » parle, mais ment sur un cable crunch. La fiche
   * apporte donc la traduction concrète, phase par phase, et le moteur garde
   * sa sémantique : la clé reste `excentrique`, seul le mot change.
   *
   * Les clés sont EXACTEMENT celles de `PHASES_TEMPO`. Une table de
   * correspondance en camelCase aurait créé un second vocabulaire à tenir
   * d'accord avec le premier, et ces deux-là finissent toujours par diverger.
   *
   * Tout est facultatif, phase par phase : une pause à zéro seconde n'a pas
   * besoin de nom, et un mouvement dont « descente » décrit bien l'excentrique
   * peut ne renseigner que celui-là.
   */
  libellesPhasesTempo?: Partial<Record<PhaseTempo, string>>;
}

export const MAX_POINTS_CLES = 4;
export const MAX_ERREURS = 4;

/** Une fiche vide n'est pas une fiche : rien ne doit s'ouvrir pour rien. */
export function ficheRenseignee(f: FicheTechnique | null | undefined): boolean {
  if (!f) return false;
  return Boolean(
    f.description || f.installation || f.positionDepart || f.execution || f.amplitude
    || f.respiration || f.sensation || f.securite
    || f.pointsCles?.length || f.erreursFrequentes?.length,
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
