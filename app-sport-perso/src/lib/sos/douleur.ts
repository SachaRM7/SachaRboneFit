import type { DouleurResult, ExerciceRestant } from "./types";

// Zone matching map for approximate muscle matching
const ZONE_MAPPING: Record<string, string[]> = {
  "épaule": ["deltoïde antérieur", "deltoïde moyen", "deltoïde postérieur", "trapèze"],
  "bas du dos": ["lombaires", "érearque spinae", "grand dorsal"],
  "genou": ["quadriceps", "ischios", "vaste médiaux", "vaste latéral"],
  "poignet": ["avant-bras", "fléchisseurs", "extenseurs"],
  "coude": ["biceps", "triceps", " brachial"],
  "cou": ["trapèze", "sterno-cléido-mastoïdien"],
  "hanche": ["psoas", "glutéal", "fascia lata"],
  "cheville": ["mollet", "gastrocnémien", "soléaire"],
  "quadriceps": ["quadriceps", "vaste médiaux", "vaste latéral", "droit fémoral"],
  "ischios": ["ischios", "biceps fémoral", "semi-tendineux", "semi-membraneux"],
  "pectoraux": ["grand pectoral", "petit pectoral", "pectoralis"],
  "dorsaux": ["grand dorsal", "rhomboïde", "trapèze moyen"],
};

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

  // Trouver les exercices qui touchent cette zone
  const matchedMuscles = ZONE_MAPPING[zone.toLowerCase()] || [zone.toLowerCase()];
  const exercicesZone = exercices_restants.filter(ex => {
    return ex.muscles_principaux.some(m => {
      const lowerM = m.toLowerCase();
      return matchedMuscles.some(mz => lowerM.includes(mz) || mz.includes(lowerM));
    });
  });

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