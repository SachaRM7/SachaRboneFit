import { versMuscle, type Muscle } from "@/lib/referentiels/muscles";
import { scoreRecuperation, seuilDePhase, type EntreeRecuperation } from "./recuperation";
import type { PhaseCycle } from "./etat-cycle";

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
  /** RIR visé. Une décharge qui reste à RIR 1 ne décharge rien. */
  rirCible?: number | null;
}

export interface MachineDisponible {
  exerciseInstanceId: string;
  nom: string;
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

/** Au-delà, la contrainte écarte le muscle au lieu de l'alléger. */
const SEVERITE_ECARTEMENT = 7;

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
}

export function dureeEstimeeMinutes(exercices: ExercicePropose[]): number {
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
  const empreintes = new Map<string, number>();
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
    // Trois identifiants distincts peuvent désigner trois variantes du même
    // mouvement : même pilier, même profil de tension, mêmes muscles. Les
    // enchaîner n'apporte pas de stimulus supplémentaire.
    const muscles = e.musclesPrincipaux.map(versMuscle).filter((m): m is Muscle => m !== null);
    const empreinte = `${e.pilier}|${e.profilTension ?? ""}|${[...muscles].sort().join(",")}`;
    const jumeau = empreintes.get(empreinte);
    if (jumeau !== undefined && e.pilier) {
      anomalies.push({
        code: "redondance_biomecanique", gravite: "avertissement", index,
        message: `« ${e.nom} » reprend le même schéma que l'exercice en position ${jumeau + 1}.`,
      });
    } else {
      empreintes.set(empreinte, index);
    }

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

  return {
    // Un avertissement se discute, un bloquant se corrige : seuls les seconds
    // empêchent l'affichage.
    valide: !anomalies.some((a) => a.gravite === "bloquant"),
    anomalies,
    dureeEstimeeMinutes: duree,
    seriesTotales,
    chargeEstimee: charge,
    scoresRecuperation,
  };
}
