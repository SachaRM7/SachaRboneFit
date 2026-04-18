import type { FeuBiologique } from "./feu-biologique";

export type AlertType =
  | "fourchette_completee"
  | "deload_recommande"
  | "stagnation"
  | "tendance_rouge";
export type AlertTiming = "pre_seance" | "post_seance";

export interface Alert {
  type: AlertType;
  timing: AlertTiming;
  exerciseName?: string;
  message: string;
  actionLabel?: string;
  priority: "info" | "warning" | "danger";
}

export interface AlertsInput {
  completedRanges: Array<{
    exerciseName: string;
    currentCharge: number;
    nextCharge: number;
  }>;
  semainesSansDeload: number;
  stagnations: Array<{
    exerciseName: string;
    semainesSansProgression: number;
    contexteNormal: boolean;
  }>;
  feuTendance: FeuBiologique | null;
}

export function computeAlerts(input: AlertsInput): Alert[] {
  const alerts: Alert[] = [];

  for (const cr of input.completedRanges) {
    alerts.push({
      type: "fourchette_completee",
      timing: "post_seance",
      exerciseName: cr.exerciseName,
      message: `Fourchette completion sur ${cr.exerciseName}. +${cr.nextCharge - cr.currentCharge} kg la prochaine fois ?`,
      actionLabel: `Passer a ${cr.nextCharge} kg`,
      priority: "info",
    });
  }

  if (input.semainesSansDeload >= 5) {
    alerts.push({
      type: "deload_recommande",
      timing: "pre_seance",
      message: `Pas de deload depuis ${input.semainesSansDeload} semaines. Deload conseille.`,
      priority: "warning",
    });
  }

  for (const stag of input.stagnations) {
    if (stag.semainesSansProgression >= 2 && stag.contexteNormal) {
      alerts.push({
        type: "stagnation",
        timing: "pre_seance",
        exerciseName: stag.exerciseName,
        message: `Pas de progression sur ${stag.exerciseName} depuis ${stag.semainesSansProgression} semaines. Revoir nutrition/sommeil ou changer d'exo ?`,
        priority: "warning",
      });
    }
  }

  if (input.feuTendance === "rouge") {
    alerts.push({
      type: "tendance_rouge",
      timing: "post_seance",
      message: "Tendance a la baisse. Deload recommande.",
      priority: "danger",
    });
  }

  return alerts;
}
