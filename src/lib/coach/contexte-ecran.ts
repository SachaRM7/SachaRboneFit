/**
 * Ce que le coach sait de l'écran d'où on l'ouvre.
 *
 * Le tiroir s'ouvrait sur une liste de conversations, sans la moindre idée de
 * ce que l'utilisateur regardait : un chatbot posé sur l'application, pas un
 * assistant dedans. Et « Modifier avec le coach » pointait vers `/coach?sujet=`,
 * une route qui n'existe pas et un paramètre que rien ne lisait.
 *
 * Le principe retenu : le client n'envoie PAS de données. Il envoie une
 * désignation — quel écran, quel objet, quelle intention — et le serveur
 * résout les vraies données depuis la session authentifiée. Un identifiant
 * d'utilisateur ne transite jamais par le client ni par le modèle.
 */

export const ECRANS = [
  "accueil",
  "programme",
  "progression",
  "seance",
  "exercices",
  "plus",
] as const;
export type Ecran = (typeof ECRANS)[number];

/** Objets que le serveur sait résoudre. */
export const TYPES_ENTITE = ["bloc", "seance", "exercice", "instance"] as const;
export type TypeEntite = (typeof TYPES_ENTITE)[number];

/**
 * Intentions déclenchées par un bouton de l'application.
 *
 * Elles pré-remplissent le contexte et proposent une amorce ; elles n'envoient
 * jamais de message à la place de l'utilisateur.
 */
export const SUJETS = [
  "modifier_programme",
  "decharge",
  "materiel",
  "stagnation",
  "expliquer_seance",
] as const;
export type Sujet = (typeof SUJETS)[number];

export interface ContexteEcran {
  ecran: Ecran;
  typeEntite?: TypeEntite | null;
  entiteId?: string | null;
  sujet?: Sujet | null;
}

export interface Suggestion {
  /** Ce que l'utilisateur lit sur le bouton. */
  libelle: string;
  /** Ce qui part réellement comme message s'il le touche. */
  message: string;
}

/** Trois ou quatre suggestions par écran. Au-delà, ce n'est plus une aide. */
const SUGGESTIONS: Record<Ecran, Suggestion[]> = {
  accueil: [
    { libelle: "Je suis fatigué aujourd'hui", message: "Je suis fatigué aujourd'hui, comment j'adapte ma séance ?" },
    { libelle: "Pourquoi cette séance ?", message: "Pourquoi tu me proposes cette séance aujourd'hui ?" },
    { libelle: "Je n'ai que 30 minutes", message: "Je n'ai que 30 minutes aujourd'hui, qu'est-ce que je garde ?" },
  ],
  programme: [
    { libelle: "Pourquoi cette répartition ?", message: "Pourquoi mes séances sont réparties comme ça ?" },
    { libelle: "Modifier mes disponibilités", message: "Je veux changer le nombre de séances par semaine." },
    { libelle: "Remplacer une séance", message: "Je voudrais remplacer une des séances de ma semaine." },
    { libelle: "Adapter à mon matériel", message: "Mon programme est-il adapté au matériel dont je dispose ?" },
  ],
  progression: [
    { libelle: "Pourquoi je stagne ?", message: "Pourquoi est-ce que je stagne sur certains exercices ?" },
    { libelle: "Qu'est-ce qui progresse le mieux ?", message: "Sur quoi est-ce que je progresse le mieux en ce moment ?" },
    { libelle: "Que dois-je améliorer ?", message: "Qu'est-ce que je devrais améliorer en priorité ?" },
  ],
  seance: [
    { libelle: "Cette charge est trop lourde", message: "La charge proposée est trop lourde, qu'est-ce que je fais ?" },
    { libelle: "J'ai une gêne", message: "J'ai une gêne sur cet exercice, comment j'adapte ?" },
    { libelle: "Pourquoi cet exercice ?", message: "Pourquoi cet exercice est-il dans ma séance aujourd'hui ?" },
  ],
  exercices: [
    { libelle: "Quel exercice pour ce muscle ?", message: "Quel exercice me conseilles-tu pour ce muscle ?" },
    { libelle: "Expliquer un mouvement", message: "Peux-tu m'expliquer comment bien exécuter cet exercice ?" },
    { libelle: "Trouver un remplaçant", message: "Par quoi je peux remplacer cet exercice ?" },
  ],
  plus: [
    { libelle: "Mon programme", message: "Où en est mon programme ?" },
    { libelle: "Ma progression", message: "Comment évolue ma progression ?" },
    { libelle: "Ma récupération", message: "Comment va ma récupération en ce moment ?" },
    { libelle: "Mes exercices", message: "Parle-moi de mes exercices." },
  ],
};

/** Suggestions propres à une intention, quand elle en appelle de plus précises. */
const SUGGESTIONS_SUJET: Partial<Record<Sujet, Suggestion[]>> = {
  modifier_programme: [
    { libelle: "Changer mes jours", message: "Je ne peux plus m'entraîner certains jours de la semaine." },
    { libelle: "Réduire la durée", message: "Mes séances sont trop longues, je voudrais les raccourcir." },
    { libelle: "Remplacer une séance", message: "Je voudrais remplacer une des séances de ma semaine." },
    { libelle: "Comprendre la répartition", message: "Pourquoi mes séances sont réparties comme ça ?" },
  ],
  decharge: [
    { libelle: "Pourquoi une décharge ?", message: "Pourquoi me proposes-tu une décharge maintenant ?" },
    { libelle: "À quoi ça ressemble", message: "Concrètement, à quoi ressemblerait une semaine de décharge ?" },
    { libelle: "Je préfère continuer", message: "Je préfère continuer sans décharge, quels sont les risques ?" },
  ],
  materiel: [
    { libelle: "Adapter à mon matériel", message: "Mon programme est-il adapté au matériel dont je dispose ?" },
    { libelle: "Changer de lieu", message: "Je vais m'entraîner ailleurs, comment j'adapte ?" },
    { libelle: "Remplacer un exercice", message: "Par quoi je remplace un exercice que je ne peux plus faire ?" },
  ],
  stagnation: [
    { libelle: "Pourquoi je stagne ?", message: "Pourquoi est-ce que je stagne sur cet exercice ?" },
    { libelle: "Changer d'exercice ?", message: "Est-ce que je devrais changer d'exercice ?" },
    { libelle: "Est-ce grave ?", message: "Est-ce que cette stagnation est un problème ?" },
  ],
};

/**
 * Phrase d'accueil.
 *
 * Elle nomme ce que l'utilisateur regardait, sans rien affirmer sur ses
 * données : c'est une amorce, pas une analyse. Elle ne remplace jamais un
 * message envoyé — rien ne part tant qu'il n'a rien touché.
 */
const AMORCES_SUJET: Record<Sujet, string> = {
  modifier_programme: "Tu veux modifier ton programme actuel.",
  decharge: "Tu veux parler de la décharge que je t'ai proposée.",
  materiel: "Tu veux adapter ton programme à ton matériel.",
  stagnation: "Tu veux comprendre une stagnation.",
  expliquer_seance: "Tu veux comprendre la séance que je t'ai proposée.",
};

const AMORCES_ECRAN: Record<Ecran, string> = {
  accueil: "Tu regardes ta séance du jour.",
  programme: "Tu regardes ton programme.",
  progression: "Tu regardes ta progression.",
  seance: "Tu es en séance.",
  exercices: "Tu regardes tes exercices.",
  plus: "Comment puis-je t'aider ?",
};

export function amorce(contexte: ContexteEcran | null): string {
  if (!contexte) return "Comment puis-je t'aider ?";
  if (contexte.sujet) return AMORCES_SUJET[contexte.sujet];
  return AMORCES_ECRAN[contexte.ecran];
}

export function suggestions(contexte: ContexteEcran | null): Suggestion[] {
  if (!contexte) return SUGGESTIONS.plus;
  if (contexte.sujet) {
    const propres = SUGGESTIONS_SUJET[contexte.sujet];
    if (propres) return propres;
  }
  return SUGGESTIONS[contexte.ecran];
}

/** Le contexte reçu du client, nettoyé. Rien d'autre n'est accepté. */
export function contexteValide(brut: unknown): ContexteEcran | null {
  if (!brut || typeof brut !== "object") return null;
  const o = brut as Record<string, unknown>;

  const ecran = typeof o.ecran === "string" && (ECRANS as readonly string[]).includes(o.ecran)
    ? (o.ecran as Ecran)
    : null;
  if (!ecran) return null;

  const typeEntite =
    typeof o.typeEntite === "string" && (TYPES_ENTITE as readonly string[]).includes(o.typeEntite)
      ? (o.typeEntite as TypeEntite)
      : null;

  // Un identifiant n'est retenu que s'il a la forme attendue. Le serveur
  // vérifiera de toute façon qu'il appartient à l'utilisateur authentifié.
  const estUuid = (v: unknown) =>
    typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

  const sujet =
    typeof o.sujet === "string" && (SUJETS as readonly string[]).includes(o.sujet)
      ? (o.sujet as Sujet)
      : null;

  return {
    ecran,
    typeEntite,
    entiteId: typeEntite && estUuid(o.entiteId) ? (o.entiteId as string) : null,
    sujet,
  };
}
