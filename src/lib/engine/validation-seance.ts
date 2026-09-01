import { versMuscle, type Muscle } from "@/lib/referentiels/muscles";
import { scoreRecuperation, seuilDePhase, type EntreeRecuperation } from "./recuperation";
import type { PhaseCycle } from "./etat-cycle";
import { SEVERITE } from "./contraintes";

/**
 * Contrôle déterministe d'une séance proposée.
 *
 * C'est la pièce qui permet de confier la génération à un modèle sans lui
 * confier la responsabilité : il propose, ce code refuse. Les vérifications
 * portent sur des faits — cette machine existe-t-elle dans cette salle, ce
 * muscle a-t-il remboursé sa dette, cette séance tient-elle dans le temps
 * disponible — jamais sur le goût. Un modèle qui hallucine une machine ou
 * ignore une blessure est arrêté ici, avant l'affichage.
 *
 * Les anomalies sont rendues, pas corrigées : la correction appartient à celui
 * qui a proposé, et il a besoin de savoir précisément ce qui coince.
 */

export type Gravite = "bloquant" | "avertissement";

export interface Anomalie {
  code: string;
  gravite: Gravite;
  message: string;
  /** Position dans la séance, quand l'anomalie vise un exercice précis. */
  index?: number;
}

export interface ExercicePropose {
  exerciseInstanceId: string;
  nom: string;
  series: number;
  repsMin: number;
  repsMax: number;
  reposSecondes: number;
  musclesPrincipaux: string[];
  pilier: string;
  /** stretch | mi_range | contract. Sert à repérer les quasi-doublons. */
  profilTension?: string;
  /** pilier | substitut | accessoire. Décide de l'ordre attendu. */
  categorieRole?: string;
  /**
   * polyarticulaire | isolation.
   *
   * Nature du mouvement, INDÉPENDANTE du rôle : une isolation peut être un
   * pilier si le programme le décide, et rien ici ne le lui reproche. Le type
   * sert à distinguer deux exercices que le pilier et le profil confondaient.
   */
  type?: string;
  /** RIR visé. Une décharge qui reste à RIR 1 ne décharge rien. */
  rirCible?: number | null;
}

export interface MachineDisponible {
  exerciseInstanceId: string;
  nom: string;
  /**
   * Ce que la machine permet de travailler, et comment.
   *
   * Sans ces trois champs, on ne peut pas dire « tout le volume de ce muscle
   * est sur un seul profil ALORS QU'UN AUTRE EXISTE ICI » — et sans cette
   * seconde moitié, l'avertissement reprocherait à l'athlète une salle qui ne
   * permet pas mieux.
   */
  profilTension?: string;
  type?: string;
  musclesPrincipaux?: string[];
}

export interface ContrainteMuscle {
  muscle: string;
  /** 1-10. Au-delà du seuil, le muscle est écarté et non simplement allégé. */
  severite: number;
}

/** État de récupération d'un muscle, tel que mesuré avant la séance. */
export interface EtatMuscle {
  joursDepuis: number | null;
  seriesDerniereExposition: number;
  rirMoyen: number | null;
  courbature: number;
}

export interface ContexteValidation {
  /** Parc réel de la salle du jour. Rien d'autre n'est réalisable. */
  machinesDisponibles: MachineDisponible[];
  /** Par muscle canonique, de quoi calculer un score de récupération. */
  etatMuscles: Record<string, EtatMuscle>;
  contraintes: ContrainteMuscle[];
  /** Minutes dont dispose réellement l'athlète. */
  dureeDisponibleMinutes: number;
  phase: PhaseCycle;
  tendancePerformance: "hausse" | "stable" | "baisse";
  /** Séries déjà faites cette semaine, par muscle. */
  seriesSemaineParMuscle?: Record<string, number>;
  /** Cible hebdomadaire par muscle, quand le programme en fixe une. */
  cibleHebdoParMuscle?: Record<string, number>;
  /** Muscles que la semaine attend encore. */
  musclesAttendus?: string[];
}

/**
 * Au-delà, la contrainte écarte le muscle au lieu de l'alléger.
 *
 * La valeur vit désormais avec les autres seuils de contrainte : elle était
 * ici, réécrite à la main dans le constructeur de séance, et à 6 dans la
 * calibration.
 */
const SEVERITE_ECARTEMENT = SEVERITE.ecartement;

/**
 * Ce qu'il faut d'un exercice pour juger s'il en double un autre.
 */
interface SignatureExercice {
  index: number;
  pilier: string;
  profil?: string;
  type?: string;
  muscles: Muscle[];
}

/** L'un des deux ensembles contient-il l'autre, sans être vide ? */
function sEmboitent(a: Muscle[], b: Muscle[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const [petit, grand] = a.length <= b.length ? [a, b] : [b, a];
  return petit.every((m) => grand.includes(m));
}

/**
 * Deux exercices sont-ils deux façons de faire la même chose ?
 *
 * Quatre conditions, toutes nécessaires : même patron de mouvement, même
 * moment de tension, même nature, et des muscles principaux qui s'emboîtent.
 * Aucune n'est un modèle biomécanique — ce sont les quatre attributs déjà
 * présents, lus ensemble plutôt qu'à moitié.
 */
function sontQuasiIdentiques(
  a: Omit<SignatureExercice, "index">,
  b: Omit<SignatureExercice, "index">,
): boolean {
  return a.pilier === b.pilier
    && a.profil === b.profil
    && a.type === b.type
    && sEmboitent(a.muscles, b.muscles);
}

/**
 * Nombre d'exercices sur un même muscle et un même profil à partir duquel la
 * concentration mérite d'être signalée.
 *
 * Trois, et pas deux. Deux exercices d'un même profil sur un muscle est banal
 * et souvent voulu — un lourd et un plus léger. Avertir à deux produirait du
 * bruit sur presque chaque séance, et un avertissement bruyant est un
 * avertissement ignoré.
 */
const EXERCICES_AVANT_MONOTONIE = 3;

/** Durée d'une série, temps sous tension inclus, hors repos. */
const SECONDES_PAR_SERIE = 45;

/** Mise en place, réglage de la machine, déplacement dans la salle. */
const SECONDES_INSTALLATION_PAR_EXERCICE = 120;

/** Dépassement toléré de la cible hebdomadaire avant de parler d'excès. */
const DEPASSEMENT_HEBDO_TOLERE = 1.3;

/** En décharge, part maximale du volume habituel. */
const VOLUME_MAXIMAL_EN_DECHARGE = 0.7;

/** En décharge, RIR minimal attendu : rester à 1 ne décharge rien. */
const RIR_MINIMAL_EN_DECHARGE = 3;

/** Séries totales au-delà desquelles une séance devient difficile à absorber. */
const SERIES_MAXIMALES_PAR_SEANCE = 30;

export interface ResultatValidation {
  valide: boolean;
  anomalies: Anomalie[];
  dureeEstimeeMinutes: number;
  seriesTotales: number;
  /** Volume pondéré par la proximité de l'échec : la durée seule ne dit rien de l'effort. */
  chargeEstimee: number;
  scoresRecuperation: Record<string, number>;
  /**
   * Ce que vaut la COMPOSITION, une fois écartée la question de savoir si elle
   * est réalisable.
   *
   * Un niveau, pas un score sur cent : rien ne fonde une graduation fine ici,
   * et un nombre inventerait une précision que les trois signaux disponibles
   * — redondance, monotonie de profil, variété — ne portent pas.
   */
  qualiteComposition: QualiteComposition;
}

export type QualiteComposition = "correcte" | "perfectible" | "pauvre";

/**
 * Durée estimée d'une séance.
 *
 * Le paramètre ne demande que ce qui est réellement lu : l'écran Programme
 * estime la durée de gabarits, qui n'ont ni muscles ni pilier à fournir.
 */
export function dureeEstimeeMinutes(
  exercices: Array<Pick<ExercicePropose, "series" | "reposSecondes">>,
): number {
  const secondes = exercices.reduce((total, e) => {
    // Le dernier repos d'un exercice ne compte pas : on enchaîne sur le suivant.
    const repos = Math.max(0, e.series - 1) * e.reposSecondes;
    return total + SECONDES_INSTALLATION_PAR_EXERCICE + e.series * SECONDES_PAR_SERIE + repos;
  }, 0);
  return Math.round(secondes / 60);
}

/**
 * Charge d'une séance : des séries pondérées par leur proximité de l'échec.
 *
 * Vingt séries à RIR 4 et vingt séries à RIR 0 occupent le même temps et ne
 * coûtent pas la même chose. La durée seule ne capte pas la difficulté.
 */
export function chargeEstimee(exercices: ExercicePropose[]): number {
  return Math.round(
    exercices.reduce((total, e) => {
      const rir = e.rirCible ?? 2;
      // RIR 0 pèse 1,5 fois une série à RIR 3 ; au-delà, le coût plafonne.
      const facteur = 1 + Math.max(0, 3 - rir) * 0.17;
      return total + e.series * facteur;
    }, 0) * 10,
  ) / 10;
}

export function validerSeance(
  exercices: ExercicePropose[],
  contexte: ContexteValidation,
): ResultatValidation {
  const anomalies: Anomalie[] = [];
  const duree = dureeEstimeeMinutes(exercices);
  const charge = chargeEstimee(exercices);
  const seriesTotales = exercices.reduce((t, e) => t + e.series, 0);
  const scoresRecuperation: Record<string, number> = {};

  if (exercices.length === 0) {
    anomalies.push({
      code: "seance_vide",
      gravite: "bloquant",
      message: "La séance ne contient aucun exercice.",
    });
    return {
      valide: false, anomalies, dureeEstimeeMinutes: 0,
      seriesTotales: 0, chargeEstimee: 0, scoresRecuperation,
      // Une séance vide n'a pas de composition à juger.
      qualiteComposition: "correcte",
    };
  }

  const disponibles = new Map(contexte.machinesDisponibles.map((m) => [m.exerciseInstanceId, m]));
  const ecartes = new Set(
    contexte.contraintes
      .filter((c) => c.severite >= SEVERITE_ECARTEMENT)
      .map((c) => versMuscle(c.muscle))
      .filter((m): m is Muscle => m !== null),
  );

  const vues = new Map<string, number>();
  const profils: SignatureExercice[] = [];
  const seriesParMuscle = new Map<Muscle, number>();

  exercices.forEach((e, index) => {
    if (!disponibles.has(e.exerciseInstanceId)) {
      anomalies.push({
        code: "machine_absente", gravite: "bloquant", index,
        message: `« ${e.nom} » ne correspond à aucune machine de cette salle.`,
      });
    }

    const dejaVu = vues.get(e.exerciseInstanceId);
    if (dejaVu !== undefined) {
      anomalies.push({
        code: "doublon", gravite: "bloquant", index,
        message: `« ${e.nom} » apparaît déjà en position ${dejaVu + 1}.`,
      });
    } else {
      vues.set(e.exerciseInstanceId, index);
    }

    // --- Redondance biomécanique ---
    //
    // Deux identifiants distincts peuvent désigner deux variantes du même
    // mouvement. L'empreinte précédente — pilier, profil, muscles EXACTEMENT
    // égaux — se trompait dans les deux sens.
    //
    // Faux positif : un développé et un écarté partagent pilier, profil et
    // « pectoraux », et étaient déclarés redondants alors que l'un est global
    // et l'autre local. Le type les sépare.
    //
    // Faux négatif : deux variantes réellement jumelles dont l'une déclare
    // [pectoraux] et l'autre [pectoraux, triceps] ne se voyaient pas.
    // L'inclusion les rapproche là où l'égalité stricte les manquait.
    const muscles = e.musclesPrincipaux.map(versMuscle).filter((m): m is Muscle => m !== null);
    const jumeau = e.pilier
      ? profils.find((p) => sontQuasiIdentiques(p, { pilier: e.pilier, profil: e.profilTension, type: e.type, muscles }))
      : undefined;
    if (jumeau) {
      anomalies.push({
        code: "redondance_biomecanique", gravite: "avertissement", index,
        message: `« ${e.nom} » reprend le même schéma que l'exercice en position ${jumeau.index + 1}.`,
      });
    }
    profils.push({ index, pilier: e.pilier, profil: e.profilTension, type: e.type, muscles });

    if (e.series < 1) {
      anomalies.push({
        code: "series_invalides", gravite: "bloquant", index,
        message: `« ${e.nom} » n'a aucune série.`,
      });
    }
    if (e.repsMin > e.repsMax) {
      anomalies.push({
        code: "fourchette_inversee", gravite: "bloquant", index,
        message: `« ${e.nom} » : fourchette ${e.repsMin}-${e.repsMax}, les bornes sont inversées.`,
      });
    }

    for (const muscle of muscles) {
      seriesParMuscle.set(muscle, (seriesParMuscle.get(muscle) ?? 0) + e.series);

      if (ecartes.has(muscle)) {
        anomalies.push({
          code: "contrainte_ignoree", gravite: "bloquant", index,
          message: `« ${e.nom} » sollicite un muscle sous contrainte sévère.`,
        });
      }

      // --- Récupération : un score, pas une horloge ---
      const etat = contexte.etatMuscles[muscle];
      if (etat) {
        const entree: EntreeRecuperation = {
          ...etat,
          tendancePerformance: contexte.tendancePerformance,
          phase: contexte.phase,
        };
        const { score, pret, motifs } = scoreRecuperation(entree);
        scoresRecuperation[muscle] = score;

        if (!pret) {
          anomalies.push({
            code: "recuperation_insuffisante",
            // Un muscle très entamé n'est plus une nuance : c'est une erreur de
            // programmation, qu'aucune douleur n'a besoin de signaler.
            gravite: score < seuilDePhase(contexte.phase) / 2 ? "bloquant" : "avertissement",
            index,
            message: `« ${e.nom} » : ${muscle} récupéré à ${score}/100 (${motifs.join(", ")}).`,
          });
        }
      }
    }
  });

  // --- Ordre des exercices ---
  // Un accessoire épuisant placé avant le mouvement prioritaire abîme ce
  // dernier : la fatigue accumulée s'y paie en charge et en technique.
  const premierPilier = exercices.findIndex((e) => e.categorieRole === "pilier");
  if (premierPilier > 0) {
    const avant = exercices.slice(0, premierPilier).filter((e) => e.categorieRole === "accessoire");
    if (avant.length > 0) {
      anomalies.push({
        code: "ordre_defavorable", gravite: "avertissement", index: premierPilier,
        message: `« ${exercices[premierPilier]!.nom} » est prioritaire mais arrive après ${avant.length} accessoire(s).`,
      });
    }
  }

  // --- Volume hebdomadaire ---
  if (contexte.cibleHebdoParMuscle) {
    for (const [muscle, seriesDuJour] of seriesParMuscle) {
      const cible = contexte.cibleHebdoParMuscle[muscle];
      if (cible === undefined) continue;
      const deja = contexte.seriesSemaineParMuscle?.[muscle] ?? 0;
      const total = deja + seriesDuJour;
      if (total > cible * DEPASSEMENT_HEBDO_TOLERE) {
        anomalies.push({
          code: "volume_hebdo_depasse", gravite: "avertissement",
          message: `${muscle} : ${total} séries sur la semaine pour une cible de ${cible}.`,
        });
      }
    }
  }

  // --- Cohérence avec la phase ---
  if (contexte.phase === "decharge") {
    // Une décharge qui garde volume, intensité et proximité de l'échec au
    // niveau habituel n'est pas une décharge : c'est une séance normale.
    const cibleVolume = Object.values(contexte.cibleHebdoParMuscle ?? {}).reduce((t, v) => t + v, 0);
    if (cibleVolume > 0 && seriesTotales > cibleVolume * VOLUME_MAXIMAL_EN_DECHARGE) {
      anomalies.push({
        code: "decharge_non_respectee", gravite: "bloquant",
        message: `Phase de décharge : ${seriesTotales} séries, soit un volume proche de l'habituel.`,
      });
    }

    const tropIntenses = exercices.filter((e) => (e.rirCible ?? 2) < RIR_MINIMAL_EN_DECHARGE);
    if (tropIntenses.length > 0) {
      anomalies.push({
        code: "decharge_non_respectee", gravite: "bloquant",
        message: `Phase de décharge : ${tropIntenses.length} exercice(s) sous RIR ${RIR_MINIMAL_EN_DECHARGE}.`,
      });
    }
  }

  if (seriesTotales > SERIES_MAXIMALES_PAR_SEANCE) {
    anomalies.push({
      code: "charge_excessive", gravite: "avertissement",
      message: `${seriesTotales} séries dans une seule séance : la qualité chutera avant la fin.`,
    });
  }

  if (duree > contexte.dureeDisponibleMinutes) {
    anomalies.push({
      code: "duree_depassee", gravite: "bloquant",
      message: `Séance estimée à ${duree} min pour ${contexte.dureeDisponibleMinutes} min disponibles.`,
    });
  }

  if (contexte.musclesAttendus?.length) {
    const couverts = new Set(seriesParMuscle.keys());
    const manquants = contexte.musclesAttendus
      .map(versMuscle)
      .filter((m): m is Muscle => m !== null && !couverts.has(m));

    if (manquants.length > 0) {
      anomalies.push({
        code: "couverture_incomplete", gravite: "avertissement",
        message: `Muscles attendus cette semaine et non couverts : ${manquants.join(", ")}.`,
      });
    }
  }

  // --- Monotonie de profil ---
  //
  // Tout le travail d'un muscle concentré sur un seul moment de tension, alors
  // que la salle permet autre chose. Trois conditions, toutes nécessaires :
  // sans la dernière, on reprocherait à l'athlète un parc qui ne permet pas
  // mieux, et l'avertissement serait faux.
  //
  // Ce n'est pas une règle de composition : rien n'exige qu'un muscle voie les
  // trois profils. On signale une concentration manifeste, rien de plus.
  const parMuscle = new Map<Muscle, SignatureExercice[]>();
  for (const p of profils) {
    for (const m of p.muscles) parMuscle.set(m, [...(parMuscle.get(m) ?? []), p]);
  }

  for (const [muscle, liste] of parMuscle) {
    if (liste.length < EXERCICES_AVANT_MONOTONIE) continue;
    const profilsVus = new Set(liste.map((p) => p.profil).filter(Boolean));
    if (profilsVus.size !== 1) continue;

    const seul = [...profilsVus][0]!;
    const autreExiste = contexte.machinesDisponibles.some(
      (m) =>
        m.profilTension
        && m.profilTension !== seul
        && (m.musclesPrincipaux ?? []).map(versMuscle).includes(muscle),
    );
    if (!autreExiste) continue;

    anomalies.push({
      code: "monotonie_profil", gravite: "avertissement",
      message:
        `${liste.length} exercices de ${muscle} tous en tension « ${seul} », `
        + "alors que cette salle en propose un autre profil.",
    });
  }

  const redondances = anomalies.filter((a) => a.code === "redondance_biomecanique").length;
  const monotonies = anomalies.filter((a) => a.code === "monotonie_profil").length;
  const qualiteComposition: QualiteComposition =
    redondances + monotonies === 0 ? "correcte"
      : redondances >= 2 || (redondances >= 1 && monotonies >= 1) ? "pauvre"
        : "perfectible";

  return {
    // Un avertissement se discute, un bloquant se corrige : seuls les seconds
    // empêchent l'affichage.
    valide: !anomalies.some((a) => a.gravite === "bloquant"),
    anomalies,
    dureeEstimeeMinutes: duree,
    seriesTotales,
    chargeEstimee: charge,
    scoresRecuperation,
    qualiteComposition,
  };
}
