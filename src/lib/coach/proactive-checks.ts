export interface ProactiveCheckResult {
  type: "pause_longue" | "rpe_eleve";
  minutes_ecoulees?: number;
  rpe_effectif?: number;
  rpe_cible?: number;
  exercice_nom?: string;
}

export function checkPauseLongue(
  lastActionTimestamp: number,
  currentTimestamp: number = Date.now(),
): ProactiveCheckResult | null {
  const diffMs = currentTimestamp - lastActionTimestamp;
  const diffMin = Math.floor(diffMs / (60 * 1000));

  if (diffMin >= 5) {
    return { type: "pause_longue", minutes_ecoulees: diffMin };
  }
  return null;
}

export function checkRpeEleve(
  rpeEffectif: number,
  rpeCible: number,
  exerciceNom: string,
): ProactiveCheckResult | null {
  if (rpeEffectif > rpeCible + 1) {
    return { type: "rpe_eleve", rpe_effectif: rpeEffectif, rpe_cible: rpeCible, exercice_nom: exerciceNom };
  }
  return null;
}

export function shouldShowAlert(
  checkType: string,
  shownAlerts: string[],
  lastActionTimestamp: number,
  currentTimestamp: number = Date.now(),
): boolean {
  // Don't show same alert twice without action
  if (shownAlerts.includes(checkType)) return false;

  // For pause_longue, we need at least 5 min
  if (checkType === "pause_longue") {
    return (currentTimestamp - lastActionTimestamp) >= 5 * 60 * 1000;
  }

  return false;
}