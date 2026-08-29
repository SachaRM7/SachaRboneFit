import { versMuscle, type Muscle } from "@/lib/referentiels/muscles";

/**
 * Contrôle déterministe d'une séance proposée.
 *
 * C'est la pièce qui permet de confier la génération à un modèle sans lui
 * confier la responsabilité : il propose, ce code refuse. Les vérifications
 * portent sur des faits — cette machine existe-t-elle dans cette salle, ce
 * muscle a-t-il eu le temps de récupérer, la durée tient-elle — jamais sur le
 * goût. Un modèle qui hallucine une machine ou ignore une blessure est arrêté
 * ici, avant l'affichage.
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

export interface ContexteValidation {
  /** Parc réel de la salle du jour. Rien d'autre n'est réalisable. */
  machinesDisponibles: MachineDisponible[];
  /** Jours écoulés depuis la dernière sollicitation, par muscle canonique. */
  joursDepuisDernierTravail: Record<string, number>;
  contraintes: ContrainteMuscle[];
  /** Minutes dont dispose réellement l'athlète. */
  dureeDisponibleMinutes: number;
  /** Muscles que la semaine attend encore, s'il y a un programme en cours. */
  musclesAttendus?: string[];
}

/** Au-delà, la contrainte écarte le muscle au lieu de l'alléger. */
const SEVERITE_ECARTEMENT = 7;

/** En deçà, un muscle re-sollicité n'a pas eu le temps de récupérer. */
const JOURS_RECUPERATION_MINIMUM = 2;

/** Durée d'une série, temps sous tension inclus, hors repos. */
const SECONDES_PAR_SERIE = 45;

/** Mise en place, réglage de la machine, déplacement dans la salle. */
const SECONDES_INSTALLATION_PAR_EXERCICE = 120;

export interface ResultatValidation {
  valide: boolean;
  anomalies: Anomalie[];
  dureeEstimeeMinutes: number;
  seriesTotales: number;
}

export function dureeEstimeeMinutes(exercices: ExercicePropose[]): number {
  const secondes = exercices.reduce((total, e) => {
    // Le dernier repos d'un exercice ne compte pas : on enchaîne sur le suivant.
    const repos = Math.max(0, e.series - 1) * e.reposSecondes;
    return total + SECONDES_INSTALLATION_PAR_EXERCICE + e.series * SECONDES_PAR_SERIE + repos;
  }, 0);
  return Math.round(secondes / 60);
}

export function validerSeance(
  exercices: ExercicePropose[],
  contexte: ContexteValidation,
): ResultatValidation {
  const anomalies: Anomalie[] = [];
  const duree = dureeEstimeeMinutes(exercices);
  const seriesTotales = exercices.reduce((t, e) => t + e.series, 0);

  if (exercices.length === 0) {
    anomalies.push({
      code: "seance_vide",
      gravite: "bloquant",
      message: "La séance ne contient aucun exercice.",
    });
    return { valide: false, anomalies, dureeEstimeeMinutes: 0, seriesTotales: 0 };
  }

  const disponibles = new Map(contexte.machinesDisponibles.map((m) => [m.exerciseInstanceId, m]));
  const ecartes = new Set(
    contexte.contraintes
      .filter((c) => c.severite >= SEVERITE_ECARTEMENT)
      .map((c) => versMuscle(c.muscle))
      .filter((m): m is Muscle => m !== null),
  );

  const vues = new Map<string, number>();

  exercices.forEach((e, index) => {
    // --- Équipement réellement présent ---
    if (!disponibles.has(e.exerciseInstanceId)) {
      anomalies.push({
        code: "machine_absente",
        gravite: "bloquant",
        index,
        message: `« ${e.nom} » ne correspond à aucune machine de cette salle.`,
      });
    }

    // --- Doublon ---
    const dejaVu = vues.get(e.exerciseInstanceId);
    if (dejaVu !== undefined) {
      anomalies.push({
        code: "doublon",
        gravite: "bloquant",
        index,
        message: `« ${e.nom} » apparaît déjà en position ${dejaVu + 1}.`,
      });
    } else {
      vues.set(e.exerciseInstanceId, index);
    }

    // --- Cohérence interne ---
    if (e.series < 1) {
      anomalies.push({
        code: "series_invalides",
        gravite: "bloquant",
        index,
        message: `« ${e.nom} » n'a aucune série.`,
      });
    }
    if (e.repsMin > e.repsMax) {
      anomalies.push({
        code: "fourchette_inversee",
        gravite: "bloquant",
        index,
        message: `« ${e.nom} » : fourchette ${e.repsMin}-${e.repsMax}, les bornes sont inversées.`,
      });
    }

    // --- Contraintes et récupération ---
    for (const brut of e.musclesPrincipaux) {
      const muscle = versMuscle(brut);
      if (!muscle) continue;

      if (ecartes.has(muscle)) {
        anomalies.push({
          code: "contrainte_ignoree",
          gravite: "bloquant",
          index,
          message: `« ${e.nom} » sollicite un muscle sous contrainte sévère.`,
        });
      }

      const jours = contexte.joursDepuisDernierTravail[muscle];
      if (jours !== undefined && jours < JOURS_RECUPERATION_MINIMUM) {
        anomalies.push({
          code: "recuperation_insuffisante",
          gravite: "avertissement",
          index,
          message: `« ${e.nom} » : ce muscle a été travaillé il y a ${jours} jour${jours > 1 ? "s" : ""}.`,
        });
      }
    }
  });

  // --- Durée ---
  if (duree > contexte.dureeDisponibleMinutes) {
    anomalies.push({
      code: "duree_depassee",
      gravite: "bloquant",
      message: `Séance estimée à ${duree} min pour ${contexte.dureeDisponibleMinutes} min disponibles.`,
    });
  }

  // --- Couverture attendue par la semaine ---
  if (contexte.musclesAttendus?.length) {
    const couverts = new Set(
      exercices.flatMap((e) => e.musclesPrincipaux.map(versMuscle)).filter((m): m is Muscle => m !== null),
    );
    const manquants = contexte.musclesAttendus
      .map(versMuscle)
      .filter((m): m is Muscle => m !== null && !couverts.has(m));

    if (manquants.length > 0) {
      anomalies.push({
        code: "couverture_incomplete",
        gravite: "avertissement",
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
  };
}
