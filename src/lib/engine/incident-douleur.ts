import { versMuscle, versMuscles, musclesDeLaZone, type Muscle } from "@/lib/referentiels/muscles";
import type { RegionSignalee } from "@/lib/referentiels/anatomie";
import type { Signalement } from "./contraintes";

/**
 * Ce qu'on consigne d'une gêne — et comment on relit ce qu'on consignait avant.
 *
 * LE DÉFAUT QU'ON CORRIGE ICI
 *
 * `SOSDouleur` écrivait dans `session_incidents.contexte` :
 *
 *     { zones: ["Épaule"], niveau: 6, type_douleur: "sourde" }
 *
 * et `verdictSignalement` y cherchait :
 *
 *     { muscle: "epaules", intensite: 6 }
 *
 * Aucun des deux noms ne se rencontrait. La liste des signalements antérieurs
 * était donc TOUJOURS vide, et la détection de récurrence — deux gênes sur la
 * même zone en trois semaines — n'a jamais pu se déclencher une seule fois.
 * Rien ne plantait, rien ne s'affichait : la moitié de la chaîne était morte en
 * silence.
 *
 * LE CHOIX
 *
 * Le format canonique écrit LES DEUX vocabulaires. `muscle` et `intensite`
 * parce que c'est ce que la règle lit ; `zones` et `niveau` parce que c'est ce
 * que l'historique porte et qu'un lecteur ancien ne doit pas se casser. Aucune
 * migration : la colonne est un `jsonb`, et un incident écrit hier reste lisible
 * tel quel.
 *
 * ET LA RELECTURE EST TOLÉRANTE, dans les deux sens
 *
 * `signalementsDepuis` sait lire les trois formes qui existent en base :
 * le format canonique, l'ancien `zones` + `niveau`, et le `muscle` + `intensite`
 * que seul un script serveur a jamais écrit. Un incident de septembre compte
 * donc dans une récurrence de novembre — c'était le point : ne pas repartir
 * d'une ardoise vide sous prétexte qu'on a changé de nom de champ.
 */

// ---------------------------------------------------------------------------
// Le moment du geste
// ---------------------------------------------------------------------------

/**
 * Quand la gêne se manifeste dans la répétition.
 *
 * Facultatif, et il doit le rester : on signale une douleur en trois gestes,
 * pas en remplissant un questionnaire. Ce champ est consigné et relu par un
 * humain ; AUCUNE règle du moteur ne s'en sert. En faire un critère
 * d'exclusion reviendrait à interpréter médicalement une phrase que personne
 * n'a validée.
 */
export const MOMENTS_DOULEUR = [
  { valeur: "excentrique", libelle: "En descendant" },
  { valeur: "concentrique", libelle: "En poussant / tirant" },
  { valeur: "verrouillage", libelle: "En fin d'amplitude" },
  { valeur: "toute_la_repetition", libelle: "Toute la répétition" },
  { valeur: "repos", libelle: "Au repos, entre les séries" },
  { valeur: "inconnu", libelle: "Je ne sais pas" },
] as const;

export type MomentDouleur = (typeof MOMENTS_DOULEUR)[number]["valeur"];

const MOMENTS_CONNUS = new Set<string>(MOMENTS_DOULEUR.map((m) => m.valeur));

export function estMomentDouleur(valeur: unknown): valeur is MomentDouleur {
  return typeof valeur === "string" && MOMENTS_CONNUS.has(valeur);
}

// ---------------------------------------------------------------------------
// Le format canonique
// ---------------------------------------------------------------------------

/** Version du contexte écrit. Elle sert à la RELECTURE, pas à filtrer. */
export const VERSION_CONTEXTE_DOULEUR = 2;

/**
 * Ce que la règle a décidé, au moment où elle l'a décidé — et qui fait foi.
 *
 * `muscles` est le SOUS-ENSEMBLE EXACT retenu, pas tous les muscles de la zone.
 * La distinction est le défaut qu'on corrige : « Épaule » vaut `epaules` et
 * `deltoide_posterieur`, mais si le second porte déjà une contrainte active, la
 * règle n'a proposé que le premier. Recalculer `musclesDeLaZone(zone)` à la
 * confirmation recréerait une contrainte sur le muscle déjà couvert — une
 * surprotection que personne n'a demandée, et un doublon dans la liste.
 *
 * Ce cliché est donc persisté avec l'incident, et c'est lui, jamais le client
 * ni un recalcul, que la confirmation relit.
 */
export interface PropositionPersistee {
  zone: string;
  /** Le sous-ensemble décidé par la règle. Autorité de la confirmation. */
  muscles: Muscle[];
  severite: number;
  motif: string;
}

/** Ce que l'athlète a répondu à la proposition, et quand. */
export interface DecisionProtection {
  decision: "appliquee" | "refusee";
  le: string;
}

export interface ContexteDouleur extends Record<string, unknown> {
  v: number;
  /** Zones du référentiel. Nom historique, conservé tel quel. */
  zones: string[];
  /** Régions visuelles touchées : face, côté, libellé. Consultatif. */
  regions: RegionSignalee[];
  /** Muscles canoniques déduits des ZONES — jamais des régions. */
  muscles: Muscle[];
  /**
   * Le muscle porteur, pour la règle qui n'en lit qu'un.
   *
   * `muscles[0]`, et l'ordre vient de celui des zones sélectionnées. Ce n'est
   * pas un choix médical : la suite du signalement est évaluée pour CHACUN des
   * muscles de `muscles`, ce champ n'existe que pour qu'un lecteur ancien —
   * ou un futur — trouve quelque chose de sensé.
   */
  muscle: Muscle | null;
  /** Nom attendu par la règle. Même valeur que `niveau`. */
  intensite: number;
  /** Nom historique. Même valeur que `intensite`. */
  niveau: number;
  type_douleur: string;
  moment: MomentDouleur | null;
  arret_conseille: boolean;
  a_retirer: number;
  a_alleger: number;
  /** Les appareils que la décision a touchés, pour relire l'épisode. */
  exercices_concernes: string[];
  /**
   * Ce que la règle a proposé de ménager. Vide quand elle n'a rien proposé.
   *
   * Persisté parce que la confirmation peut arriver plus tard — après un arrêt
   * de séance, depuis un autre écran — et parce qu'elle ne doit dépendre ni du
   * client ni d'un recalcul. Voir `PropositionPersistee`.
   */
  propositions: PropositionPersistee[];
  /**
   * La réponse de l'athlète, ou `null` tant qu'il n'a pas tranché.
   *
   * Elle rend la confirmation IDEMPOTENTE — une seconde requête ne réécrit
   * rien — et elle empêche une proposition refusée de revenir à chaque
   * ouverture de l'écran des contraintes.
   */
  protection: DecisionProtection | null;
}

export interface EntreesContexteDouleur {
  zones: string[];
  regions: RegionSignalee[];
  niveau: number;
  typeDouleur: string;
  moment?: MomentDouleur | null;
  arretConseille: boolean;
  aRetirer: string[];
  aAlleger: string[];
  /** Ce que la règle vient de décider. Le cliché qui fera foi. */
  propositions?: PropositionPersistee[];
}

/**
 * Le contexte d'un signalement, écrit une seule fois et pour tout le monde.
 *
 * Les muscles viennent des ZONES, pas des régions : c'est la garantie qu'une
 * précision visuelle nouvelle — le côté, la face — n'introduit jamais dans le
 * moteur un muscle qu'il ne connaît pas.
 */
export function construireContexteDouleur(e: EntreesContexteDouleur): ContexteDouleur {
  const muscles = [...new Set(e.zones.flatMap((z) => musclesDeLaZone(z)))];
  const niveau = Math.round(e.niveau);
  return {
    v: VERSION_CONTEXTE_DOULEUR,
    zones: e.zones,
    regions: e.regions,
    muscles,
    muscle: muscles[0] ?? null,
    intensite: niveau,
    niveau,
    type_douleur: e.typeDouleur,
    moment: e.moment ?? null,
    arret_conseille: e.arretConseille,
    a_retirer: e.aRetirer.length,
    a_alleger: e.aAlleger.length,
    exercices_concernes: [...new Set([...e.aRetirer, ...e.aAlleger])],
    propositions: e.propositions ?? [],
    // Rien n'est tranché à l'écriture : une contrainte ne naît que d'un « Oui ».
    protection: null,
  };
}

/**
 * Les propositions persistées d'un incident, relues sans confiance.
 *
 * Le contexte est un `jsonb` écrit par une version antérieure du code, ou par
 * un script : chaque champ est vérifié plutôt que casté. Une proposition dont
 * la liste de muscles serait vide est écartée — elle ne pourrait rien créer, et
 * la laisser passer afficherait une carte qui ne fait rien.
 */
export function propositionsDepuis(contexte: unknown): PropositionPersistee[] {
  if (!contexte || typeof contexte !== "object") return [];
  const brutes = (contexte as Record<string, unknown>).propositions;
  if (!Array.isArray(brutes)) return [];

  return brutes.flatMap((b) => {
    if (!b || typeof b !== "object") return [];
    const p = b as Record<string, unknown>;
    const muscles = versMuscles(
      Array.isArray(p.muscles) ? p.muscles.filter((m): m is string => typeof m === "string") : [],
    );
    const severite = nombreOuRien(p.severite);
    if (typeof p.zone !== "string" || muscles.length === 0 || severite === null) return [];
    return [{
      zone: p.zone,
      muscles,
      severite,
      motif: typeof p.motif === "string" ? p.motif : "",
    }];
  });
}

/** La décision déjà prise sur cet incident, ou `null` s'il en attend une. */
export function decisionDepuis(contexte: unknown): DecisionProtection | null {
  if (!contexte || typeof contexte !== "object") return null;
  const brut = (contexte as Record<string, unknown>).protection;
  if (!brut || typeof brut !== "object") return null;
  const d = (brut as Record<string, unknown>).decision;
  if (d !== "appliquee" && d !== "refusee") return null;
  const le = (brut as Record<string, unknown>).le;
  return { decision: d, le: typeof le === "string" ? le : "" };
}

// ---------------------------------------------------------------------------
// La relecture, toutes époques confondues
// ---------------------------------------------------------------------------

function nombreOuRien(valeur: unknown): number | null {
  const n = typeof valeur === "string" ? Number(valeur) : valeur;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function chaines(valeur: unknown): string[] {
  return Array.isArray(valeur) ? valeur.filter((v): v is string => typeof v === "string") : [];
}

/**
 * Les signalements portés par un contexte d'incident, quelle que soit sa forme.
 *
 * Rend UN signalement par muscle canonique impliqué : c'est l'unité du moteur
 * de contraintes, et c'est ce que `suiteASignalement` compare. Un incident sur
 * « Genou » produit donc deux entrées, `quadriceps` et `ischios`, exactement
 * comme l'adaptation immédiate le fait déjà.
 *
 * Rend un tableau vide plutôt que de deviner : sans intensité lisible, il n'y a
 * rien à comparer, et compter un incident sans intensité comme une répétition
 * fabriquerait une récurrence qui n'a pas été vécue.
 */
export function signalementsDepuis(
  contexte: unknown,
  dateISO: string,
): Signalement[] {
  if (!contexte || typeof contexte !== "object") return [];
  const ctx = contexte as Record<string, unknown>;

  // `intensite` d'abord — le nom que la règle a toujours lu —, `niveau`
  // ensuite : c'est celui que l'écran écrivait, et il porte le même nombre.
  const intensite = nombreOuRien(ctx.intensite) ?? nombreOuRien(ctx.niveau);
  if (intensite === null) return [];

  const vus = new Set<Muscle>();

  // Format canonique : les muscles sont déjà déduits, on ne les redéduit pas.
  for (const m of versMuscles(chaines(ctx.muscles))) vus.add(m);

  // Ancien écran : des ZONES, qui se convertissent par le référentiel.
  for (const zone of chaines(ctx.zones)) {
    for (const m of musclesDeLaZone(zone)) vus.add(m);
  }

  // Écritures serveur : un muscle unique, déjà canonique ou presque.
  if (typeof ctx.muscle === "string") {
    const m = versMuscle(ctx.muscle);
    if (m) vus.add(m);
  }

  return [...vus].map((muscle) => ({ muscle, intensite, dateISO }));
}
