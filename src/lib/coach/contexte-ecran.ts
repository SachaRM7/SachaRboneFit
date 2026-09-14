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

export const SUJETS = [
  "modifier_programme",
  "decharge",
  "materiel",
  "stagnation",
  "expliquer_seance",
  "construire_seance",
  "observation_seance",
] as const;
export type Sujet = (typeof SUJETS)[number];

export const SIGNAUX_OBSERVATION = [
  "repos_ecourte",
  "repos_rallonge",
  "effort_au_dela_de_la_cible",
  "effort_en_deca_de_la_cible",
  "series_hors_prescription",
  "reps_sous_la_fourchette",
] as const;
export type SignalObservation = (typeof SIGNAUX_OBSERVATION)[number];

export interface ContexteEcran {
  ecran: Ecran;
  sessionLogId?: string;
  numeroSerie?: number;
  typeEntite?: TypeEntite | null;
  entiteId?: string | null;
  sujet?: Sujet | null;
  signal?: SignalObservation | null;
}

export interface Suggestion {
  libelle: string;
  message: string;
}

/**
 * Métadonnée invisible ajoutée uniquement aux messages issus d'un bouton.
 *
 * Le texte reste visuellement identique dans le champ du Coach. Le serveur
 * peut toutefois distinguer :
 * - phrase tapée à la main -> LLM ;
 * - même phrase issue d'un bouton -> moteur déterministe.
 *
 * L'identifiant est encodé uniquement avec des caractères de largeur nulle,
 * donc aucune chaîne technique n'apparaît dans l'interface ou l'historique.
 */
const ACTION_DEBUT = "\u2063\u2063";
const ACTION_FIN = "\u2064";
const BIT_0 = "\u200b";
const BIT_1 = "\u200c";

function encoderActionRapide(id: string): string {
  const octets = new TextEncoder().encode(id);
  let bits = "";
  for (const octet of octets) {
    bits += octet.toString(2).padStart(8, "0").replace(/0/g, BIT_0).replace(/1/g, BIT_1);
  }
  return `${ACTION_DEBUT}${bits}${ACTION_FIN}`;
}

export function extraireActionRapide(message: string): { id: string; message: string } | null {
  const debut = message.lastIndexOf(ACTION_DEBUT);
  if (debut < 0) return null;
  const fin = message.indexOf(ACTION_FIN, debut + ACTION_DEBUT.length);
  if (fin < 0) return null;

  const code = message.slice(debut + ACTION_DEBUT.length, fin);
  if (!code || code.length % 8 !== 0 || [...code].some((c) => c !== BIT_0 && c !== BIT_1)) return null;

  const octets: number[] = [];
  for (let i = 0; i < code.length; i += 8) {
    const binaire = code.slice(i, i + 8).replaceAll(BIT_0, "0").replaceAll(BIT_1, "1");
    octets.push(Number.parseInt(binaire, 2));
  }

  const id = new TextDecoder().decode(new Uint8Array(octets));
  if (!/^(?:accueil|programme|progression|seance|exercices|plus):\d+$/.test(id)
      && !/^sujet:[a-z_]+:\d+$/.test(id)) return null;

  return {
    id,
    message: `${message.slice(0, debut)}${message.slice(fin + ACTION_FIN.length)}`.trim(),
  };
}

function marquerSuggestions(prefixe: string, liste: Suggestion[]): Suggestion[] {
  return liste.map((s, index) => ({
    ...s,
    message: `${s.message}${encoderActionRapide(`${prefixe}:${index}`)}`,
  }));
}

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
  construire_seance: [
    { libelle: "Une séance plus courte", message: "Construis-moi une séance alternative plus courte pour aujourd'hui." },
    { libelle: "Choisir les muscles", message: "Je veux construire une nouvelle séance autour de certains muscles." },
    { libelle: "Adapter à ma récupération", message: "Propose-moi une séance complète adaptée à ma récupération et au matériel disponible." },
  ],
};

const AMORCES_SUJET: Record<Sujet, string> = {
  modifier_programme: "Tu veux modifier ton programme actuel.",
  decharge: "Tu veux parler de la décharge que je t'ai proposée.",
  materiel: "Tu veux adapter ton programme à ton matériel.",
  stagnation: "Tu veux comprendre une stagnation.",
  observation_seance: "Tu veux parler de ce que j'ai remarqué pendant ta séance.",
  expliquer_seance: "Tu veux comprendre la séance que je t'ai proposée.",
  construire_seance: "Tu veux construire une nouvelle séance avec moi.",
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
  if (!contexte) return marquerSuggestions("plus", SUGGESTIONS.plus);
  if (contexte.sujet) {
    const propres = SUGGESTIONS_SUJET[contexte.sujet];
    // Construire une séance demande le raisonnement et les outils du Coach ;
    // ces suggestions ne passent donc pas par les réponses rapides statiques.
    if (propres) return contexte.sujet === "construire_seance"
      ? propres
      : marquerSuggestions(`sujet:${contexte.sujet}`, propres);
  }
  return marquerSuggestions(contexte.ecran, SUGGESTIONS[contexte.ecran]);
}

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

  const estUuid = (v: unknown) =>
    typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

  const sujet =
    typeof o.sujet === "string" && (SUJETS as readonly string[]).includes(o.sujet)
      ? (o.sujet as Sujet)
      : null;

  const signal =
    typeof o.signal === "string" && (SIGNAUX_OBSERVATION as readonly string[]).includes(o.signal)
      ? (o.signal as SignalObservation)
      : null;

  return {
    ecran,
    ...(estUuid(o.sessionLogId) ? { sessionLogId: o.sessionLogId as string } : {}),
    ...(typeof o.numeroSerie === "number" && Number.isInteger(o.numeroSerie)
      && o.numeroSerie > 0 && o.numeroSerie <= 100 ? { numeroSerie: o.numeroSerie } : {}),
    typeEntite,
    entiteId: typeEntite && estUuid(o.entiteId) ? (o.entiteId as string) : null,
    sujet,
    signal,
  };
}
