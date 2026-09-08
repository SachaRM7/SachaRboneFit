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
  /**
   * Les lignées de slots, quand des substitutions ont eu lieu.
   *
   * Sans elles, l'exercice substitué afficherait « 0/3 » alors qu'une série a
   * été soulevée sur l'ancienne machine — et il contredirait l'en-tête du
   * tableau, qui compte le slot. Deux nombres pour la même chose, c'est
   * exactement ce que ce module existe pour empêcher.
   */
  lignees: LigneeSlot[] = [],
): AvancementExercice[] {
  const parInstance = new Map<string, number>();
  for (const s of series) {
    if (!serieCompte(s)) continue;
    parInstance.set(s.exerciseInstanceId, (parInstance.get(s.exerciseInstanceId) ?? 0) + 1);
  }

  return exercices.map((e) => {
    // Les séries de TOUTE la lignée comptent pour ce slot : celles de la
    // machine actuelle, et celles des machines qu'elle a remplacées.
    const membres = ligneeDe(lignees, e.id).instances;
    const faites = membres.reduce((t, id) => t + (parInstance.get(id) ?? 0), 0);
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

// ---------------------------------------------------------------------------
// Les slots de prescription, et ce qu'une substitution en fait
// ---------------------------------------------------------------------------

/**
 * La LIGNÉE d'un slot de prescription : les entrées qui l'ont occupé, dans
 * l'ordre.
 *
 * LE DÉFAUT QUE CETTE NOTION FERME
 *
 * Substituer remplaçait l'entrée affichée en gardant `seriesCibles` intact. Avec
 * trois séries prescrites, une faite sur A puis un passage sur B, l'écran
 * redemandait S1, S2, S3 sur B : quatre séries réalisées pour trois prescrites.
 *
 * Compter les séries de la nouvelle entrée ne suffit pas à corriger ça — B n'en
 * a aucune, il repart donc à zéro. Ce qu'il faut compter, ce sont les SLOTS DE
 * PRESCRIPTION déjà consommés, quelle que soit la machine qui les a remplis.
 *
 * La lignée est donc la clé : un slot vaut « l'exercice 2 de cette séance »,
 * pas « la machine A ». Les séries déjà faites restent attachées à leur entrée
 * réelle — l'historique dit la vérité — mais elles occupent le slot.
 */
export interface LigneeSlot {
  /** L'entrée d'origine : elle nomme le slot, et ne change jamais. */
  origine: string;
  /** Toutes les entrées ayant occupé ce slot, `origine` comprise, dans l'ordre. */
  instances: string[];
}

/** La lignée qui contient cette entrée, ou une lignée d'un seul élément. */
export function ligneeDe(lignees: LigneeSlot[], instanceId: string): LigneeSlot {
  return lignees.find((l) => l.instances.includes(instanceId))
    ?? { origine: instanceId, instances: [instanceId] };
}

/**
 * Les numéros de série que la machine COURANTE doit encore demander.
 *
 * Un slot est consommé dès qu'une série qui mesure quelque chose porte ce
 * numéro, sur n'importe quelle entrée de la lignée. On rend donc les numéros
 * libres, dans l'ordre, bornés par la prescription.
 *
 *   0/3 sur A, passage à B   → B demande 1, 2, 3
 *   1/3 sur A, passage à B   → B demande 2, 3
 *   2/3 sur A, passage à B   → B demande 3
 *   3/3 sur A, passage à B   → B ne demande rien
 *
 * Les numéros sont CONSERVÉS, pas renumérotés : la série 2 faite sur B reste la
 * série 2 de la prescription. Renuméroter à partir de 1 créerait deux « série
 * 1 » dans la même séance, et l'historique cesserait de se lire.
 */
export function slotsARemplir(
  lignee: LigneeSlot,
  series: SerieSaisie[],
  seriesCibles: number,
): number[] {
  const membres = new Set(lignee.instances);
  const consommes = new Set(
    series
      .filter((s) => membres.has(s.exerciseInstanceId) && serieCompte(s))
      .map((s) => s.numeroSerie),
  );

  const libres: number[] = [];
  for (let n = 1; n <= seriesCibles; n += 1) {
    if (!consommes.has(n)) libres.push(n);
  }
  return libres;
}

/**
 * Enregistrer une substitution dans les lignées.
 *
 * L'ancienne entrée n'est PAS retirée : elle porte les séries déjà faites, et
 * elle continue d'occuper les slots qu'elle a consommés. Repasser sur une
 * machine déjà employée ne la duplique pas dans la lignée.
 */
export function noterSubstitution(
  lignees: LigneeSlot[],
  ancienId: string,
  nouveauId: string,
): LigneeSlot[] {
  const existante = lignees.find((l) => l.instances.includes(ancienId));
  if (!existante) {
    return [...lignees, { origine: ancienId, instances: [ancienId, nouveauId] }];
  }
  if (existante.instances.includes(nouveauId)) return lignees;
  return lignees.map((l) =>
    l === existante ? { ...l, instances: [...l.instances, nouveauId] } : l,
  );
}

/**
 * L'avancement d'un slot, toutes entrées confondues.
 *
 * `avancement` compte par ENTRÉE, ce qui est juste tant qu'aucune substitution
 * n'a eu lieu. Après une substitution, l'exercice affiché doit dire « 1/3 »
 * même si la nouvelle machine n'a encore rien fait — sinon la séance semble
 * repartir de zéro alors qu'une série a bien été soulevée.
 */
export function avancementDeLaLignee(
  lignee: LigneeSlot,
  series: SerieSaisie[],
  seriesCibles: number,
): { faites: number; cibles: number } {
  const restants = slotsARemplir(lignee, series, seriesCibles);
  return { faites: seriesCibles - restants.length, cibles: seriesCibles };
}
