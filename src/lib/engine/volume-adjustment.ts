import type { DailyStateInput } from "@/lib/validators/daily-state";
import { memeMuscle } from "@/lib/referentiels/muscles";

export interface VolumeAdjustment {
  totalPct: number; // ex: -25. 0 = pas d'ajustement. Plafond à -40.
  raisons: string[]; // ex: ["Sommeil 4h → -25%"]
  proposeDeloadImprovise: boolean; // true si énergie ≤ 4
  proposeReport: boolean; // true si courbatures > 7 sur muscle ciblé
  musclesAReporter: string[]; // muscles avec courbatures > 7
}

export function computeVolumeAdjustment(
  state: DailyStateInput,
  musclesCiblesSéance: string[],
): VolumeAdjustment {
  const raisons: string[] = [];
  let totalPct = 0;

  if (state.sommeilHeures <= 5) {
    totalPct -= 25;
    raisons.push(`Sommeil ${state.sommeilHeures}h → -25%`);
  }

  if (state.jeuneBool === true) {
    totalPct -= 15;
    raisons.push("Jeûne → -15%");
  }

  if (state.shiftRecentBool && state.shiftType === "nuit") {
    totalPct -= 20;
    raisons.push("Shift nuit → -20%");
  }

  // Plafonner à -40%
  if (totalPct < -40) {
    totalPct = -40;
  }

  const proposeDeloadImprovise = state.energieDepart <= 4;

  // Courbatures > 7 sur muscles cibles.
  // La comparaison passe par le referentiel : les courbatures sont saisies dans le
  // vocabulaire de l'interface et les muscles cibles viennent de la base, qui
  // utilisait historiquement un vocabulaire different. Une egalite stricte ne
  // matchait jamais, ce qui rendait ce report inoperant.
  const musclesAReporter = musclesCiblesSéance.filter((muscle) =>
    state.courbatures.some((c) => c.intensite > 7 && memeMuscle(c.muscle, muscle)),
  );

  const proposeReport = musclesAReporter.length > 0;

  return { totalPct, raisons, proposeDeloadImprovise, proposeReport, musclesAReporter };
}
