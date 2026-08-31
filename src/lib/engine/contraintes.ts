/**
 * Le cycle de vie d'une gêne physique.
 *
 * Jusqu'ici une contrainte entrait et ne sortait jamais. Elle était créée à
 * l'onboarding, toujours avec le type `zone_sensible`, et `date_fin` — la
 * colonne prévue pour la fin — n'était écrite par aucun chemin. La seule sortie
 * passait par le SQL.
 *
 * Ce module décide quand une gêne devient un état, et quand elle cesse de
 * l'être. Il ne décide rien de médical : il ne prédit pas de guérison, il
 * programme une question. Une échéance sert à redemander, jamais à déclarer
 * que c'est passé.
 *
 * Tout est pur : les seuils, les transitions et les libellés sont testables
 * sans base, et surtout ils sont ici plutôt que dispersés dans trois moteurs
 * comme c'était le cas.
 */

// ---------------------------------------------------------------------------
// Les seuils, enfin réunis
// ---------------------------------------------------------------------------

/**
 * Les seuils de sévérité, tels qu'ils étaient — pas tels qu'on les voudrait.
 *
 * Ils existaient en trois exemplaires : `SEVERITE_ECARTEMENT = 7` dans le
 * validateur de séance, un `>= 7` écrit à la main dans le constructeur de
 * séance, et un `>= 6` dans la route de calibration. Deux valeurs pour la même
 * notion, aucune nommée au même endroit.
 *
 * Les valeurs sont reprises telles quelles : ce chantier réunit, il ne
 * retouche pas. Ce qu'elles déclenchent est décrit ci-dessous, parce qu'aucun
 * des trois endroits ne le disait.
 */
export const SEVERITE = {
  /**
   * À partir d'ici, le muscle est écarté plutôt qu'allégé.
   *
   * Concrètement : le validateur de séance lève une anomalie bloquante, et le
   * constructeur de séance refuse de choisir un remplaçant qui sollicite ce
   * muscle. Attention — il n'enlève PAS l'exercice déjà prévu : `resoudrePourSalle`
   * garde l'exercice prévu quand il est disponible, avant même de regarder les
   * muscles à ménager.
   */
  ecartement: 7,
  /** À partir d'ici, la calibration ne mesure pas ce muscle. */
  calibrationEvitee: 6,
  /** En deçà, il ne reste rien à signaler : la contrainte se résout. */
  plancher: 2,
  minimum: 1,
  maximum: 10,
} as const;

/**
 * Ce que dure une contrainte avant qu'on repose la question.
 *
 * Deux semaines n'est pas un délai de guérison — c'est le moment où
 * l'application redemande. Une gêne peut très bien durer plus longtemps ; ce
 * qu'on refuse, c'est qu'elle dure sans que personne ne s'en assure.
 */
export const REEVALUATION_JOURS = 14;

/** Fenêtre sur laquelle on cherche une répétition avant de proposer un état. */
export const FENETRE_REPETITION_JOURS = 21;

/** Deux signalements sur la même zone, c'est une répétition. */
export const SIGNALEMENTS_POUR_REPETITION = 2;

/**
 * En deçà, un signalement isolé reste un incident.
 *
 * Une gêne à 4/10 ressentie une fois pendant une séance n'a aucune raison de
 * modifier le programme des trois prochaines semaines. Elle est notée, et
 * c'est tout.
 */
export const INTENSITE_PROPOSITION_IMMEDIATE = 7;

/** Sous ce niveau, même répétée, une gêne ne justifie rien de durable. */
export const INTENSITE_MINIMALE_REPETITION = 4;

/** De combien la sévérité baisse quand l'athlète répond « un peu ». */
export const BAISSE_SI_MIEUX = 3;

// ---------------------------------------------------------------------------
// Ce qu'un signalement déclenche
// ---------------------------------------------------------------------------

export interface Signalement {
  /** Muscle canonique du référentiel. */
  muscle: string;
  /** 1-10, telle que l'athlète l'a exprimée. */
  intensite: number;
  dateISO: string;
}

export type SuiteASignalement =
  | { suite: "incident_seul"; motif: string }
  | { suite: "proposer_contrainte"; severite: number; motif: string }
  | { suite: "deja_couvert"; motif: string };

function joursEntre(debutISO: string, finISO: string): number {
  return Math.round(
    (new Date(`${finISO}T00:00:00Z`).getTime() - new Date(`${debutISO}T00:00:00Z`).getTime()) /
      86_400_000,
  );
}

/**
 * Ce qu'il faut faire d'une gêne qu'on vient de signaler.
 *
 * La règle tient en trois cas, et le premier est le plus important : la plupart
 * des gênes ne donnent rien d'autre qu'un incident. Une séance où l'épaule tire
 * un peu est un fait, pas un état.
 *
 * Elle ne crée jamais rien elle-même. Au mieux elle dit « il y aurait lieu de
 * proposer » — et c'est encore l'athlète qui tranchera.
 */
export function suiteASignalement(entrees: {
  signalement: Signalement;
  /** Signalements antérieurs sur la même zone, tous âges confondus. */
  anterieurs: Signalement[];
  /** Une contrainte active existe-t-elle déjà sur cette zone ? */
  contrainteActive: boolean;
}): SuiteASignalement {
  const { signalement, anterieurs, contrainteActive } = entrees;

  if (contrainteActive) {
    return {
      suite: "deja_couvert",
      motif: "Une contrainte est déjà active sur cette zone.",
    };
  }

  if (signalement.intensite >= INTENSITE_PROPOSITION_IMMEDIATE) {
    return {
      suite: "proposer_contrainte",
      severite: signalement.intensite,
      motif: `Gêne signalée à ${signalement.intensite}/10.`,
    };
  }

  const recents = anterieurs.filter(
    (a) =>
      a.muscle === signalement.muscle &&
      a.intensite >= INTENSITE_MINIMALE_REPETITION &&
      joursEntre(a.dateISO, signalement.dateISO) <= FENETRE_REPETITION_JOURS &&
      joursEntre(a.dateISO, signalement.dateISO) >= 0,
  );

  const total = recents.length + (signalement.intensite >= INTENSITE_MINIMALE_REPETITION ? 1 : 0);
  if (total >= SIGNALEMENTS_POUR_REPETITION) {
    // La sévérité retenue est la plus forte observée : c'est ce que l'athlète
    // a vécu de pire, pas une moyenne qui lisserait l'épisode.
    const severite = Math.max(signalement.intensite, ...recents.map((r) => r.intensite));
    return {
      suite: "proposer_contrainte",
      severite,
      motif: `${total} signalements sur cette zone en ${FENETRE_REPETITION_JOURS} jours.`,
    };
  }

  return {
    suite: "incident_seul",
    motif: "Gêne isolée et modérée : notée, sans effet sur la programmation.",
  };
}

// ---------------------------------------------------------------------------
// Être active, être à réévaluer
// ---------------------------------------------------------------------------

export interface ContrainteLue {
  id: string;
  muscle: string;
  type: string;
  severite: number;
  dateDebut: string;
  /** Jour où elle cesse de s'appliquer. Nulle tant qu'elle vaut. */
  dateFin: string | null;
  /** Jour où reposer la question. Nulle pour une limitation assumée durable. */
  aReevaluerLe: string | null;
  notes: string | null;
}

/**
 * Une contrainte s'applique-t-elle aujourd'hui ?
 *
 * Définition unique, parce qu'il y en avait deux. Le constructeur de séance
 * acceptait une `date_fin` future — « elle court encore » — tandis que le
 * validateur, la calibration et le coach exigeaient `date_fin IS NULL`. Une
 * contrainte datée pour la semaine prochaine était donc active pour l'un,
 * terminée pour les autres.
 *
 * `date_fin` est le jour où elle a CESSÉ de s'appliquer, borne exclue. Dire
 * « ça va mieux » libère donc les exercices tout de suite : faire attendre le
 * lendemain viderait le geste de son sens. Aucune ligne existante ne porte de
 * date de fin — la colonne n'était jamais écrite — donc ce choix ne change
 * l'interprétation d'aucune donnée déjà là.
 */
export function estActive(c: Pick<ContrainteLue, "dateFin">, aujourdhuiISO: string): boolean {
  return c.dateFin === null || c.dateFin > aujourdhuiISO;
}

/** Faut-il reposer la question aujourd'hui ? */
export function aReevaluer(c: ContrainteLue, aujourdhuiISO: string): boolean {
  if (!estActive(c, aujourdhuiISO)) return false;
  // Nulle : l'athlète a demandé à la garder telle quelle. On ne le relance pas.
  if (c.aReevaluerLe === null) return false;
  return c.aReevaluerLe <= aujourdhuiISO;
}

/** Ce que le moteur doit écarter, et à partir de quelle sévérité. */
export function musclesSousContrainte(
  contraintes: ContrainteLue[],
  aujourdhuiISO: string,
  seuil: number = SEVERITE.ecartement,
): string[] {
  return [
    ...new Set(
      contraintes
        .filter((c) => estActive(c, aujourdhuiISO) && c.severite >= seuil)
        .map((c) => c.muscle),
    ),
  ];
}

// ---------------------------------------------------------------------------
// Les transitions
// ---------------------------------------------------------------------------

export type Reponse = "toujours" | "un_peu_mieux" | "resolu";

export interface Transition {
  severite: number;
  dateFin: string | null;
  aReevaluerLe: string | null;
  /** Ce qu'on dira à l'athlète, une fois la transition écrite. */
  resume: string;
}

export function decalerDe(dateISO: string, jours: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

/**
 * Ce que devient une contrainte quand on repose la question.
 *
 * Trois réponses, trois issues, et aucune n'est un pronostic. « Un peu mieux »
 * fait baisser la sévérité d'un cran et repousse la question : c'est une
 * observation reportée, pas une courbe de guérison. Si la baisse passe sous le
 * plancher, il ne reste rien à ménager et la contrainte se termine — ce qui
 * reste une déduction arithmétique, pas un avis.
 */
export function reevaluer(
  contrainte: ContrainteLue,
  reponse: Reponse,
  aujourdhuiISO: string,
): Transition {
  const prochaine = decalerDe(aujourdhuiISO, REEVALUATION_JOURS);

  if (reponse === "resolu") {
    return {
      severite: contrainte.severite,
      dateFin: aujourdhuiISO,
      aReevaluerLe: null,
      resume: "Contrainte levée.",
    };
  }

  if (reponse === "toujours") {
    return {
      severite: contrainte.severite,
      dateFin: null,
      aReevaluerLe: prochaine,
      resume: `Contrainte maintenue, question reposée dans ${REEVALUATION_JOURS} jours.`,
    };
  }

  const severite = Math.max(SEVERITE.minimum, contrainte.severite - BAISSE_SI_MIEUX);
  if (severite < SEVERITE.plancher) {
    return {
      severite,
      dateFin: aujourdhuiISO,
      aReevaluerLe: null,
      resume: "Plus rien à ménager : contrainte levée.",
    };
  }

  return {
    severite,
    dateFin: null,
    aReevaluerLe: prochaine,
    resume: `Sévérité ramenée à ${severite}/10, question reposée dans ${REEVALUATION_JOURS} jours.`,
  };
}

/**
 * Ce qui change pour l'entraînement quand une contrainte entre ou sort.
 *
 * Sert à l'aperçu montré avant confirmation. Le texte ne promet rien sur le
 * corps : il décrit ce que l'application fera, ce qui est la seule chose dont
 * elle réponde.
 */
export function effetSurLEntrainement(severite: number, sens: "entree" | "sortie"): string[] {
  const effets: string[] = [];
  if (severite >= SEVERITE.ecartement) {
    effets.push(
      sens === "entree"
        ? "Les exercices qui sollicitent cette zone en premier ne seront plus proposés en remplacement, et une séance qui en contient sera signalée."
        : "Les exercices qui sollicitent cette zone redeviennent proposables.",
    );
  } else {
    effets.push(
      sens === "entree"
        ? "La zone est notée comme sensible, sans exclusion : la programmation reste inchangée."
        : "La zone n'est plus notée comme sensible.",
    );
  }
  if (severite >= SEVERITE.calibrationEvitee) {
    effets.push(
      sens === "entree"
        ? "Une calibration ne mesurera pas cette zone."
        : "Une calibration pourra de nouveau mesurer cette zone.",
    );
  }
  return effets;
}
