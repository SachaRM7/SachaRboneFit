import type { DouleurResult, ExerciceRestant } from "./types";

import { musclesDeLaZone, versMuscle } from "@/lib/referentiels/muscles";

/**
 * L'ancienne table ZONE_MAPPING utilisait un troisieme vocabulaire musculaire
 * ("deltoide anterieur", "vaste medial"...) qui ne correspondait ni a la base
 * ni a la saisie. Aucun exercice n'etait donc jamais retenu : les actions
 * skip_zone et alleger s'appliquaient a une liste vide, en affichant malgre
 * tout un message de succes. La resolution passe desormais par le referentiel.
 */

export function douleur(
  zone: string,
  niveau: number,
  type_douleur: "sourde" | "aiguë" | "irradiation" | "raideur",
  exercices_restants: ExerciceRestant[],
): DouleurResult {
  // Cascade logique déterministe
  if (niveau >= 7 || type_douleur === "aiguë" || type_douleur === "irradiation") {
    return {
      action: "stop_seance",
      message: "Douleur sévère. Arrête la séance et consulte si ça persiste.",
      exercices_impactes: [],
    };
  }

  // Exercices qui sollicitent la zone douloureuse.
  const musclesZone = musclesDeLaZone(zone);
  const exercicesZone = exercices_restants.filter((ex) =>
    ex.muscles_principaux.some((m) => {
      const muscle = versMuscle(m);
      return muscle !== null && musclesZone.includes(muscle);
    }),
  );

  if (niveau >= 4 && niveau <= 6) {
    return {
      action: "skip_zone",
      message: `Exercices sur ${zone} retirés de la séance.`,
      exercices_impactes: exercicesZone.map(ex => ({
        exercise_instance_id: ex.exercise_instance_id,
        impact: "skip" as const,
      })),
    };
  }

  // niveau 1-3
  return {
    action: "alleger",
    message: `RPE réduit sur ${exercicesZone.length} exo(s). Si ça empire, arrête.`,
    exercices_impactes: exercicesZone.map(ex => ({
      exercise_instance_id: ex.exercise_instance_id,
      impact: "alleger" as const,
    })),
  };
}