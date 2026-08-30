/**
 * Ce que l'application se souvient des exercices qu'on n'a pas pu faire.
 *
 * Le piège qu'on évite ici a un nom : la dette d'exercice. Il serait facile de
 * tenir un compte de ce qui a été manqué et de le rembourser — deux séries de
 * développé en plus la semaine prochaine, parce qu'on les « doit ». Ce serait
 * faux. Le volume d'une semaine se décide par ce que le corps peut absorber,
 * pas par ce qu'un carnet réclame. Une séance manquée est passée ; elle ne
 * revient pas.
 *
 * Ce module produit donc une information, jamais une obligation :
 *
 *   — il dit ce qui a été empêché, combien de fois, et où ;
 *   — il distingue l'incident du changement durable ;
 *   — il permet de FAVORISER un retour quand l'occasion se présente et que
 *     tous les garde-fous sont d'accord ;
 *   — il n'ajoute jamais une série ni un exercice.
 *
 * La différence tient en une phrase : le planificateur choisit mieux DANS les
 * places dont il dispose. Il n'en crée pas de nouvelles.
 */

import type { ContexteAdaptation } from "./tracabilite";

export interface SeuilsMemoire {
  /** Au-delà, un empêchement est trop ancien pour peser sur aujourd'hui. */
  fenetreJours: number;
  /** À partir de combien d'occurrences on ne parle plus d'incident. */
  occurrencesRepete: number;
  /** À partir de combien on soupçonne un changement de contexte durable. */
  occurrencesDurable: number;
}

export const SEUILS_MEMOIRE: SeuilsMemoire = {
  // Trois semaines : au-delà, le contexte a probablement changé pour d'autres
  // raisons, et insister sur un exercice ancien n'informe plus.
  fenetreJours: 21,
  occurrencesRepete: 2,
  occurrencesDurable: 3,
};

export type StatutEmpechement = "ponctuel" | "repete" | "durable";

export interface EmpechementBrut {
  exerciceId: string;
  instanceId: string;
  nom: string;
  date: string;
  contexte: ContexteAdaptation | null;
}

export interface EmpechementClasse {
  exerciceId: string;
  instanceId: string;
  nom: string;
  statut: StatutEmpechement;
  occurrences: number;
  dates: string[];
  /** Lieux où l'empêchement s'est produit, du plus récent au plus ancien. */
  lieux: Array<{ id: string; nom: string }>;
  /** Vrai quand toutes les occurrences pointent le même nouveau lieu. */
  memeLieu: boolean;
}

const joursEntre = (a: string, b: string) =>
  Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);

export function classerEmpechements(entrees: {
  empechements: EmpechementBrut[];
  aujourdhui: string;
  seuils?: SeuilsMemoire;
}): EmpechementClasse[] {
  const s = entrees.seuils ?? SEUILS_MEMOIRE;

  const recents = entrees.empechements.filter(
    (e) => joursEntre(e.date, entrees.aujourdhui) <= s.fenetreJours,
  );

  const parExercice = new Map<string, EmpechementBrut[]>();
  for (const e of recents) {
    parExercice.set(e.exerciceId, [...(parExercice.get(e.exerciceId) ?? []), e]);
  }

  const classes: EmpechementClasse[] = [];
  for (const [exerciceId, liste] of parExercice) {
    const tri = [...liste].sort((a, b) => b.date.localeCompare(a.date));
    const lieux: Array<{ id: string; nom: string }> = [];
    for (const e of tri) {
      const id = e.contexte?.lieuApresId;
      const nom = e.contexte?.lieuApresNom;
      if (id && nom && !lieux.some((l) => l.id === id)) lieux.push({ id, nom });
    }

    const memeLieu = lieux.length === 1 && tri.every((e) => Boolean(e.contexte?.lieuApresId));
    const occurrences = tri.length;

    // Un changement durable, c'est la répétition ET la constance : trois fois
    // le même exercice empêché dans trois lieux différents dit autre chose que
    // trois fois au même endroit.
    let statut: StatutEmpechement = "ponctuel";
    if (occurrences >= s.occurrencesDurable && memeLieu) statut = "durable";
    else if (occurrences >= s.occurrencesRepete) statut = "repete";

    classes.push({
      exerciceId,
      instanceId: tri[0]!.instanceId,
      nom: tri[0]!.nom,
      statut,
      occurrences,
      dates: tri.map((e) => e.date),
      lieux,
      memeLieu,
    });
  }

  return classes.sort((a, b) => b.occurrences - a.occurrences || a.nom.localeCompare(b.nom));
}

/**
 * Les conditions qui doivent toutes être réunies pour favoriser un retour.
 *
 * Aucune n'est optionnelle. Remettre un exercice parce qu'il a été manqué,
 * alors que le muscle n'est pas récupéré ou que la semaine est déjà pleine,
 * remplacerait une bonne décision par un remords.
 */
export interface GardeFousRetour {
  realisableAujourdhui: boolean;
  recuperationSuffisante: boolean;
  /** Séries encore absorbables cette semaine sur les muscles visés. */
  seriesHebdoRestantes: number;
  frequenceMusculaireRespectee: boolean;
  phaseCompatible: boolean;
  dureeDisponibleSuffisante: boolean;
}

export interface DecisionRetour {
  exerciceId: string;
  favorise: boolean;
  /** Phrase courte destinée à l'athlète, quand le retour est favorisé. */
  explication: string | null;
  /** Ce qui a empêché de favoriser, quand ce n'est pas le cas. */
  motif: string | null;
}

const fois = (n: number) => `${n} fois`;

/**
 * « Je remets X aujourd'hui : il avait été remplacé lors de tes deux dernières
 * séances à domicile. »
 *
 * Le ton est un constat, pas un reproche : l'exercice a été remplacé, personne
 * n'a échoué. Aucun mot de dette, de retard ou de rattrapage.
 */
export function expliquerRetour(e: EmpechementClasse): string {
  const ou = e.lieux[0]?.nom;
  const seances =
    e.occurrences === 1
      ? "ta dernière séance"
      : `tes ${e.occurrences} dernières séances`;
  const lieu = ou ? ` à ${ou}` : "";
  return `Je remets ${e.nom} aujourd'hui : il avait été remplacé lors de ${seances}${lieu}.`;
}

export function deciderRetour(
  e: EmpechementClasse,
  g: GardeFousRetour,
  seriesDemandees: number,
): DecisionRetour {
  const refus = (motif: string): DecisionRetour => ({
    exerciceId: e.exerciceId,
    favorise: false,
    explication: null,
    motif,
  });

  if (!g.realisableAujourdhui) return refus("Toujours indisponible ici.");
  if (!g.recuperationSuffisante) return refus("Le muscle n'est pas assez récupéré.");
  if (!g.phaseCompatible) return refus("La phase du cycle ne s'y prête pas.");
  if (!g.frequenceMusculaireRespectee) return refus("Ce muscle a déjà été travaillé assez souvent cette semaine.");
  if (!g.dureeDisponibleSuffisante) return refus("Pas assez de temps aujourd'hui.");
  // Le retour occupe une place existante ; il ne doit pas pour autant faire
  // franchir la cible hebdomadaire du muscle.
  if (g.seriesHebdoRestantes < seriesDemandees) {
    return refus("La semaine est déjà servie sur ce muscle.");
  }

  return {
    exerciceId: e.exerciceId,
    favorise: true,
    explication: expliquerRetour(e),
    motif: null,
  };
}

export interface SuggestionProgramme {
  exerciceId: string;
  nom: string;
  /** Lieu devenu habituel, quand il y en a un. */
  lieu: { id: string; nom: string } | null;
  message: string;
}

/**
 * Ce qui mérite qu'on revoie le programme, pas la séance.
 *
 * Un empêchement durable n'appelle pas un rattrapage mais un constat : le
 * programme vise un matériel qui n'est plus là. Continuer à le planifier
 * revient à produire une substitution de plus à chaque séance, et à faire
 * croire que le programme tient encore alors qu'il est réécrit chaque fois.
 *
 * La suggestion est une suggestion : rien n'est modifié automatiquement.
 */
export function suggestionsProgramme(classes: EmpechementClasse[]): SuggestionProgramme[] {
  return classes
    .filter((e) => e.statut === "durable")
    .map((e) => ({
      exerciceId: e.exerciceId,
      nom: e.nom,
      lieu: e.lieux[0] ?? null,
      message: e.lieux[0]
        ? `${e.nom} a été remplacé ${fois(e.occurrences)} d'affilée à ${e.lieux[0].nom}. Ton programme vise encore du matériel que tu n'as plus sous la main.`
        : `${e.nom} a été remplacé ${fois(e.occurrences)} d'affilée. Il vaut mieux revoir le programme que le réécrire à chaque séance.`,
    }));
}
