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
  };
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
