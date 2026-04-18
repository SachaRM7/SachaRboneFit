import type { EnergieChuteResult, ExerciceRestant } from "./types";

export function energieChute(
  energie: number,
  exercices_restants: ExerciceRestant[],
): EnergieChuteResult {
  if (energie <= 3) {
    return {
      suggestion: "stop",
      message: "Énergie très basse. Proposé d'arrêter la séance.",
      exercices_coupes: [],
      rpe_reduit_sur: [],
    };
  }

  if (energie >= 7) {
    return {
      suggestion: "rien",
      message: "Énergie correcte, pas d'ajustement nécessaire.",
      exercices_coupes: [],
      rpe_reduit_sur: [],
    };
  }

  // énergie 4-6
  const piliers = exercices_restants.filter(ex => ex.categorie_role === "pilier");
  const accessoires = exercices_restants.filter(ex => ex.categorie_role === "accessoire");

  return {
    suggestion: "alleger",
    message: `Garde les ${piliers.length} pilier(s), skip ${accessoires.length} accessoire(s). RPE réduit de 1 sur les piliers restants.`,
    exercices_coupes: accessoires.map(ex => ex.nom),
    rpe_reduit_sur: piliers.map(ex => ex.nom),
  };
}