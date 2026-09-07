import {
  estSymptomeGeneral, libelleSymptome,
  type SymptomeDeclare, type SymptomeGeneral,
} from "@/lib/referentiels/symptomes";

/**
 * Que faire d'un symptôme général — une règle, petite, explicite, et une seule.
 *
 * CE QU'ELLE N'EST PAS
 *
 * Elle ne diagnostique rien. Elle ne nomme aucune cause, ne suggère aucun
 * traitement, et ne prétend pas savoir si quelqu'un « peut » s'entraîner : elle
 * lit une intensité que la personne a elle-même déclarée et propose une conduite
 * d'entraînement. La décision reste à l'athlète — l'écran propose, il n'impose
 * pas, et « je continue » est toujours disponible.
 *
 * Le modèle de langage n'entre nulle part ici. Demander à un LLM s'il faut
 * arrêter une séance reviendrait à lui confier une décision de sécurité sur
 * une base non déterministe, différente d'un appel à l'autre.
 *
 * POURQUOI UNE SEULE RÈGLE POUR DEUX MOMENTS
 *
 * Le symptôme déclaré le matin dans l'état du jour et celui signalé en pleine
 * séance passent par cette fonction. Deux barèmes auraient divergé au premier
 * ajustement, et l'application aurait dit « allège » avant la séance et « rien
 * à signaler » pendant, pour la même déclaration.
 *
 * Ce que le MOMENT change, c'est ce qu'on fait de la conduite — pas la conduite
 * elle-même. Avant la séance, « alléger » propose de partir sur moins ; pendant,
 * il coupe la suite. Ça se décide dans les écrans, pas ici.
 */

export const CONDUITES = ["continuer", "alleger", "arreter"] as const;
export type ConduiteSymptome = (typeof CONDUITES)[number];

/** Du plus permissif au plus prudent — pour retenir le pire de plusieurs. */
const RANG: Record<ConduiteSymptome, number> = { continuer: 0, alleger: 1, arreter: 2 };

/**
 * Les seuils ordinaires, en intensité déclarée.
 *
 *   1-3   continuer     un mal de tête à 2/10 ne justifie pas de toucher à la
 *                       séance. C'est le cas du 6 septembre, et le consigner
 *                       sans rien changer est exactement le bon comportement.
 *   4-6   alléger       proposer de réduire la suite.
 *   7-10  arrêter       proposer de terminer.
 */
const SEUILS_ORDINAIRES = { alleger: 4, arreter: 7 } as const;

/**
 * Trois symptômes où l'on descend d'un cran, et seulement trois.
 *
 * Un vertige, un malaise ou un essoufflement inhabituel se distinguent des
 * autres sur un point qui ne demande aucune compétence médicale à constater :
 * ils dégradent la capacité à tenir une charge en sécurité. Continuer un
 * développé couché en vertige à 5/10 n'est pas une question de tolérance à
 * l'inconfort.
 *
 * Le cran est unique, écrit ici, et testé. C'est la seule exception au barème :
 * multiplier les cas particuliers reviendrait à écrire une médecine
 * algorithmique dans un moteur d'entraînement.
 */
const SEUILS_PRUDENTS = { alleger: 3, arreter: 5 } as const;

const SYMPTOMES_PRUDENTS = new Set<SymptomeGeneral>([
  "vertige", "malaise", "essoufflement_inhabituel",
]);

export interface PrudenceSymptome {
  conduite: ConduiteSymptome;
  /** Une phrase, sans cause ni diagnostic. Vide si rien n'a été déclaré. */
  motif: string;
  /** Le symptôme qui a décidé, quand plusieurs sont déclarés. */
  decisif: SymptomeDeclare | null;
}

/** La conduite pour UN symptôme, sans regarder les autres. */
export function conduitePourUn(s: SymptomeDeclare): ConduiteSymptome {
  const seuils = SYMPTOMES_PRUDENTS.has(s.symptome) ? SEUILS_PRUDENTS : SEUILS_ORDINAIRES;
  if (s.intensite >= seuils.arreter) return "arreter";
  if (s.intensite >= seuils.alleger) return "alleger";
  return "continuer";
}

const PHRASES: Record<ConduiteSymptome, string> = {
  continuer: "Signalé. Rien à changer à la séance.",
  alleger: "Proposé d'alléger la suite.",
  arreter: "Proposé de terminer la séance.",
};

/**
 * La conduite pour un ensemble de symptômes : la plus prudente l'emporte.
 *
 * Un mal de tête à 2 et un vertige à 6 déclarés ensemble ne se moyennent pas.
 * Faire la moyenne rendrait « alléger » pour une situation où l'un des deux
 * signaux dit « arrêter » — c'est exactement l'endroit où une arithmétique
 * séduisante produirait une mauvaise décision.
 *
 * Une liste vide rend `continuer` sans motif : ne rien avoir déclaré n'est pas
 * un état à commenter.
 */
export function prudenceSymptomes(symptomes: SymptomeDeclare[]): PrudenceSymptome {
  if (symptomes.length === 0) {
    return { conduite: "continuer", motif: "", decisif: null };
  }

  let decisif = symptomes[0]!;
  let conduite = conduitePourUn(decisif);

  for (const s of symptomes.slice(1)) {
    const c = conduitePourUn(s);
    // À conduite égale, le plus intense parle : c'est celui qu'on cite.
    if (RANG[c] > RANG[conduite] || (RANG[c] === RANG[conduite] && s.intensite > decisif.intensite)) {
      conduite = c;
      decisif = s;
    }
  }

  return {
    conduite,
    motif: `${libelleSymptome(decisif.symptome)} ${decisif.intensite}/10. ${PHRASES[conduite]}`,
    decisif,
  };
}

// ---------------------------------------------------------------------------
// Relire ce qui a été consigné
// ---------------------------------------------------------------------------

/**
 * Le symptôme porté par un incident, ou `null` si l'incident n'en porte pas.
 *
 * UN SEUL LECTEUR, comme pour la douleur au lot 13. Le débrief hebdomadaire, le
 * coach et l'historique lisent la même colonne `jsonb` ; trois relectures
 * écrites séparément auraient fini par ne pas s'accorder sur ce qui compte
 * comme un signalement — c'est exactement le défaut qui avait rendu la chaîne
 * de la douleur muette pendant des mois.
 *
 * Tolérante sur ce qu'elle ignore, stricte sur ce qu'elle accepte : un type
 * inconnu du référentiel ou une intensité hors bornes rend `null` plutôt
 * qu'un objet à moitié valide qui partirait vers un modèle.
 */
export function lireSymptomeIncident(contexte: unknown): SymptomeDeclare | null {
  if (!contexte || typeof contexte !== "object") return null;
  const c = contexte as Record<string, unknown>;

  if (!estSymptomeGeneral(c.symptome)) return null;

  const intensite = typeof c.intensite === "number" ? Math.round(c.intensite) : NaN;
  if (!Number.isFinite(intensite) || intensite < 1 || intensite > 10) return null;

  const note = typeof c.note === "string" && c.note.trim().length > 0
    ? c.note.trim() : undefined;

  return {
    symptome: c.symptome,
    intensite,
    ...(note ? { note } : {}),
    // Un incident de séance vient forcément de la séance. Le champ est relu
    // quand il est là, et supposé sinon : les toutes premières écritures
    // pourraient ne pas le porter.
    moment: c.moment === "avant_seance" ? "avant_seance" : "pendant_seance",
  };
}

/** Un symptôme agrégé sur une période, tel qu'un débrief le commente. */
export interface SymptomeAgrege {
  symptome: SymptomeGeneral;
  libelle: string;
  fois: number;
  intensiteMax: number;
}

/**
 * Regrouper des signalements pour en dire quelque chose.
 *
 * « 3 incidents » ne se commente pas ; « un mal de tête léger signalé deux
 * fois » se commente. On rend le type, le nombre et l'intensité la plus haute.
 *
 * LES NOTES NE SORTENT PAS. Elles sont écrites pour un humain qui relit sa
 * séance, pas pour être empaquetées dans un contexte envoyé à un modèle : le
 * type et l'intensité suffisent à ce qu'un débrief a le droit de dire.
 */
export function agregerSymptomes(signalements: SymptomeDeclare[]): SymptomeAgrege[] {
  const parType = new Map<SymptomeGeneral, SymptomeAgrege>();

  for (const s of signalements) {
    const actuel = parType.get(s.symptome);
    if (actuel) {
      actuel.fois += 1;
      actuel.intensiteMax = Math.max(actuel.intensiteMax, s.intensite);
    } else {
      parType.set(s.symptome, {
        symptome: s.symptome,
        libelle: libelleSymptome(s.symptome),
        fois: 1,
        intensiteMax: s.intensite,
      });
    }
  }

  // Le plus intense d'abord : c'est celui qui mérite la phrase.
  return [...parType.values()].sort(
    (a, b) => b.intensiteMax - a.intensiteMax || a.libelle.localeCompare(b.libelle),
  );
}
