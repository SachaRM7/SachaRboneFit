/**
 * Ce que les deux vues du Live ont en commun — c'est-à-dire tout sauf le rendu.
 *
 * POURQUOI CE MODULE EXISTE
 *
 * Focus et Liste montrent LA MÊME séance. La tentation, en ajoutant une
 * seconde vue, est de lui donner sa propre notion d'exercice courant, sa propre
 * façon de compter les séries faites, son propre « terminé ». Deux vues qui
 * calculent séparément finissent par se contredire : l'une montre 2/3, l'autre
 * 3/3, et personne ne sait laquelle croire.
 *
 * Tout ce qui se DÉDUIT de la séance vit donc ici, hors de React, et les deux
 * vues lisent le même résultat. Ce qui reste dans les composants, c'est la mise
 * en page.
 *
 * CE MODULE NE DÉCIDE RIEN DE MÉTIER. Il ne choisit pas une charge, ne valide
 * pas une série, ne classe pas une substitution — le moteur le fait déjà. Il
 * répond à des questions de NAVIGATION : où en est-on, que reste-t-il, quel
 * exercice montrer.
 */

/** Ce qu'une vue a besoin de savoir d'un exercice, et rien de plus. */
export interface ExercicePourLaVue {
  id: string;
  nom: string;
  seriesCibles: number;
}

/** Une série du brouillon, réduite à ce qui compte pour l'avancement. */
export interface SerieSaisie {
  exerciseInstanceId: string;
  numeroSerie: number;
  repsEffectuees: number | null;
  charge: number | null;
}

export const STATUTS_EXERCICE = ["a_faire", "en_cours", "termine"] as const;
export type StatutExercice = (typeof STATUTS_EXERCICE)[number];

export interface AvancementExercice {
  id: string;
  nom: string;
  faites: number;
  cibles: number;
  statut: StatutExercice;
}

/**
 * Une série ne compte que si elle mesure quelque chose.
 *
 * Une ligne ouverte, à moitié saisie, ne fait pas avancer la séance — et c'est
 * exactement le critère que la clôture applique déjà pour refuser une série
 * vide. Compter autrement ici afficherait « 3/3 » sur un exercice que la base
 * refuserait d'enregistrer.
 */
export function serieCompte(s: SerieSaisie): boolean {
  return s.repsEffectuees !== null && s.charge !== null;
}

/**
 * L'avancement de chaque exercice, dans l'ordre de la séance.
 *
 * `faites` est borné par `cibles` : ajouter une quatrième série à un exercice
 * qui en prescrit trois ne doit pas afficher « 4/3 ».
 */
export function avancement(
  exercices: ExercicePourLaVue[],
  series: SerieSaisie[],
): AvancementExercice[] {
  const parInstance = new Map<string, number>();
  for (const s of series) {
    if (!serieCompte(s)) continue;
    parInstance.set(s.exerciseInstanceId, (parInstance.get(s.exerciseInstanceId) ?? 0) + 1);
  }

  return exercices.map((e) => {
    const faites = parInstance.get(e.id) ?? 0;
    const statut: StatutExercice = e.seriesCibles > 0 && faites >= e.seriesCibles
      ? "termine"
      : faites > 0 ? "en_cours" : "a_faire";
    return { id: e.id, nom: e.nom, faites: Math.min(faites, e.seriesCibles), cibles: e.seriesCibles, statut };
  });
}

/**
 * Le premier exercice qui reste à faire, ou `null` si la séance est finie.
 *
 * C'est la règle que l'écran appliquait déjà implicitement, extraite pour
 * qu'elle cesse d'être une expression enfouie dans le rendu.
 */
export function premierNonTermine(etats: AvancementExercice[]): number | null {
  const i = etats.findIndex((e) => e.statut !== "termine");
  return i === -1 ? null : i;
}

/**
 * L'exercice à AFFICHER, à partir de celui que l'utilisateur a demandé.
 *
 * TOUT L'ENJEU DE `currentExerciseIndex` EST ICI.
 *
 * Il redevient une vraie navigation : ce que la personne a choisi de regarder.
 * Il ne dit pas où en est la séance — `avancement` le dit — et il ne doit donc
 * PAS être déplacé automatiquement dès qu'un exercice se termine. Quelqu'un qui
 * ouvre le 4, revient au 2 pour corriger une série, et repart au 4, ne doit
 * rien voir bouger sous ses doigts.
 *
 * Trois corrections seulement, et aucune n'est une préférence :
 *
 *   — un index hors bornes (la séance a raccourci, un exercice a été retiré)
 *     retombe sur le premier exercice à faire ;
 *   — un index qui désigne un exercice SAUTÉ, donc invisible, aussi ;
 *   — une séance dont tout est terminé garde le dernier exercice affiché
 *     plutôt que de renvoyer nulle part.
 *
 * `null` en entrée — première ouverture, reprise sans mémoire — vaut « choisis
 * pour moi » : on montre le premier exercice à faire.
 */
export function exerciceAffiche(
  etats: AvancementExercice[],
  demande: number | null,
): number {
  if (etats.length === 0) return 0;
  const dernier = etats.length - 1;

  if (demande === null || !Number.isInteger(demande) || demande < 0 || demande > dernier) {
    return premierNonTermine(etats) ?? dernier;
  }
  return demande;
}

/** Combien de séries la séance compte, et combien sont faites. */
export function progressionSeance(etats: AvancementExercice[]): {
  faites: number; cibles: number; exercicesTermines: number;
} {
  return {
    faites: etats.reduce((t, e) => t + e.faites, 0),
    cibles: etats.reduce((t, e) => t + e.cibles, 0),
    exercicesTermines: etats.filter((e) => e.statut === "termine").length,
  };
}

/**
 * Le numéro de la prochaine série d'un exercice.
 *
 * Le maximum saisi plus un, et non « nombre de séries plus un » : une série
 * décochée au milieu laisserait sinon deux lignes portant le même numéro, et le
 * triplet qui identifie une série en base cesserait d'être unique.
 */
export function prochainNumeroSerie(
  series: SerieSaisie[],
  exerciseInstanceId: string,
): number {
  const numeros = series
    .filter((s) => s.exerciseInstanceId === exerciseInstanceId)
    .map((s) => s.numeroSerie);
  return numeros.length === 0 ? 1 : Math.max(...numeros) + 1;
}

export const VUES_LIVE = ["focus", "liste"] as const;
export type VueLive = (typeof VUES_LIVE)[number];

/** La clé de la préférence locale. Par appareil, pas par compte. */
export const CLE_VUE_LIVE = "rbonefit:vue-live";

/**
 * La vue à ouvrir, sur mobile comme ailleurs.
 *
 * Focus par défaut : c'est la vue faite pour un téléphone tenu d'une main entre
 * deux séries, et c'est là que la séance se vit. La Liste reste à un appui,
 * pour scanner ce qui reste ou corriger plusieurs séries d'affilée.
 *
 * La préférence est retenue LOCALEMENT — elle décrit un appareil et un moment,
 * pas une personne. La stocker côté serveur en ferait un réglage de compte, à
 * synchroniser et à migrer, pour une valeur qui change quand on passe du
 * téléphone à l'ordinateur.
 */
export function vueParDefaut(preferenceLue: string | null | undefined): VueLive {
  return preferenceLue === "liste" ? "liste" : "focus";
}
