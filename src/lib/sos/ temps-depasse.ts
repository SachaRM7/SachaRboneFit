import type { TempsDepasseResult, ExerciceRestant } from "./types";

const TEMPS_SERIE_SEC = 45;

export function tempsDepasse(
  duree_actuelle_min: number,
  duree_cible_min: number,
  exercices_restants: ExerciceRestant[],
  repos_secondes_by_exercice: Record<string, number> = {},
): TempsDepasseResult {
  const temps_disponible = duree_cible_min - duree_actuelle_min;

  if (temps_disponible >= 0) {
    return {
      exercices_coupes: [],
      temps_estime_apres_coupe_min: duree_actuelle_min,
      message: "Temps OK, pas de coupe nécessaire.",
    };
  }

  // Estimer temps restant pour chaque exo
  interface WithTimeEx {
    exercise_instance_id: string;
    nom: string;
    muscles_principaux: string[];
    categorie_role: "pilier" | "substitut" | "accessoire";
    statut: "en_cours" | "à_venir";
    ordre: number;
    temps_estime_sec: number;
  }
  const mapped: WithTimeEx[] = exercices_restants.map(ex => {
    const repos = repos_secondes_by_exercice[ex.exercise_instance_id] || 120;
    const temps_estime = TEMPS_SERIE_SEC + repos; // série + repos
    return {
      exercise_instance_id: ex.exercise_instance_id,
      nom: ex.nom,
      muscles_principaux: ex.muscles_principaux,
      categorie_role: ex.categorie_role,
      statut: ex.statut,
      ordre: ex.ordre ?? 0,
      temps_estime_sec: temps_estime,
    };
  });
  const compareOrdre = (a: WithTimeEx, b: WithTimeEx): number => a.ordre - b.ordre;
  const withTime = mapped.slice().sort(compareOrdre);

  const temps_restant_sec = withTime.reduce((sum, ex) => sum + ex.temps_estime_sec, 0);
  const temps_restant_min = Math.ceil(temps_restant_sec / 60);

  if (temps_restant_min <= Math.abs(temps_disponible)) {
    return {
      exercices_coupes: [],
      temps_estime_apres_coupe_min: duree_actuelle_min + temps_restant_min,
      message: "Temps OK après recalcul.",
    };
  }

  // Coupe : d'abord accessoires (en commençant par la fin), puis core
  let coupes: string[] = [];
  let temps_estime_sec = temps_restant_sec;

  const accessoires = withTime.filter(ex => ex.categorie_role === "accessoire").reverse();
  for (const acc of accessoires) {
    if (temps_estime_sec <= Math.abs(temps_disponible) * 60) break;
    coupes.push(acc.nom);
    temps_estime_sec -= acc.temps_estime_sec;
  }

  // Puis core/gainage si encore trop long
  const cores = withTime.filter(ex => ex.categorie_role === "accessoire" && /core|gainage|plank/i.test(ex.nom));
  for (const core of cores.reverse()) {
    if (temps_estime_sec <= Math.abs(temps_disponible) * 60) break;
    coupes.push(core.nom);
    temps_estime_sec -= core.temps_estime_sec;
  }

  const temps_apres_coupe = Math.ceil((duree_actuelle_min * 60 + temps_estime_sec) / 60);

  return {
    exercices_coupes: coupes,
    temps_estime_apres_coupe_min: temps_apres_coupe,
    message: coupes.length > 0
      ? `Coupe ${coupes.length} exo(s) : ${coupes.join(", ")}`
      : "Temps encore dépassé, mais pas d'autres coupes possibles sans retirer les piliers.",
  };
}
