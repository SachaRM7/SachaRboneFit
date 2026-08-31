import type { DailyStateInput } from "@/lib/validators/daily-state";

export type FeuBiologique = "vert" | "orange" | "rouge";

export interface FeuJourResult {
  feu: FeuBiologique;
  criteresSommeil: boolean;
  criteresEnergie: boolean;
  criteresCourbatures: boolean;
  nbEchecs: number;
}

/**
 * Ce qu'on suppose quand une case de l'état du jour est restée vide.
 *
 * Quatre endroits construisaient cet objet à la main, et ils ne suppléaient
 * pas la même chose : l'énergie absente valait 7 pour l'écran de séance et le
 * tableau de bord, 5 pour le coach. Or le critère est `energieDepart >= 7` —
 * la même journée non renseignée passait donc le critère d'un côté et le
 * ratait de l'autre, et le feu pouvait être vert à l'écran et orange dans la
 * bouche du coach.
 *
 * La valeur retenue est celle du chemin qui décide vraiment : c'est lui qui
 * ajuste le volume et écrit `feu_biologique_jour` sur la séance. Le reste
 * s'aligne sur ce qui est persisté.
 *
 * Que l'absence de réponse vaille « journée correcte » reste discutable ; ce
 * n'est pas ce chantier qui doit en décider, et c'est noté en dette.
 */
export const ETAT_DU_JOUR_PAR_DEFAUT = {
  sommeilHeures: 7,
  energieDepart: 7,
  jeuneBool: false,
  shiftRecentBool: false,
  shiftType: "aucun" as const,
} as const;

/** Une ligne `daily_states`, telle que le moteur l'attend. */
export function etatPourLeMoteur(etat: {
  date: string;
  sommeilHeures?: number | null;
  jeuneBool?: boolean | null;
  shiftRecentBool?: boolean | null;
  shiftType?: string | null;
  energieDepart?: number | null;
  courbatures?: { muscle: string; intensite: number }[] | null;
}): DailyStateInput {
  return {
    date: etat.date,
    sommeilHeures: etat.sommeilHeures ?? ETAT_DU_JOUR_PAR_DEFAUT.sommeilHeures,
    jeuneBool: etat.jeuneBool ?? ETAT_DU_JOUR_PAR_DEFAUT.jeuneBool,
    shiftRecentBool: etat.shiftRecentBool ?? ETAT_DU_JOUR_PAR_DEFAUT.shiftRecentBool,
    shiftType: (etat.shiftType as DailyStateInput["shiftType"]) ?? ETAT_DU_JOUR_PAR_DEFAUT.shiftType,
    energieDepart: etat.energieDepart ?? ETAT_DU_JOUR_PAR_DEFAUT.energieDepart,
    courbatures: etat.courbatures ?? [],
  };
}

export function computeFeuJour(state: DailyStateInput): FeuJourResult {
  const criteresSommeil = state.sommeilHeures >= 6;
  const criteresEnergie = state.energieDepart >= 7;
  const maxCourbature =
    state.courbatures.length > 0
      ? Math.max(...state.courbatures.map((c) => c.intensite))
      : 0;
  const criteresCourbatures = maxCourbature < 5;

  const nbEchecs = [criteresSommeil, criteresEnergie, criteresCourbatures].filter(
    (c) => !c,
  ).length;

  let feu: FeuBiologique;
  if (state.energieDepart <= 3) {
    feu = "rouge";
  } else if (nbEchecs >= 2) {
    feu = "rouge";
  } else if (nbEchecs === 1) {
    feu = "orange";
  } else {
    feu = "vert";
  }

  return { feu, criteresSommeil, criteresEnergie, criteresCourbatures, nbEchecs };
}

// --- Tendance ---

export interface SessionPilierPerf {
  exerciseInstanceId: string;
  exerciseName: string;
  volumeTotal: number;
  estimated1RM: number;
}

export interface FeuTendanceInput {
  sessions: Array<{
    date: string;
    feuJour: FeuBiologique;
    pilierPerfs: SessionPilierPerf[];
  }>;
}

export interface FeuTendanceResult {
  feu: FeuBiologique;
  raison: string;
  contexteNormal: boolean;
}

/**
 * En deçà de cette variation relative, l'écart est du bruit de mesure, pas une
 * tendance. 2 % correspond à environ 2 kg sur un 1RM estimé à 100 kg.
 */
const SEUIL_VARIATION = 0.02;

// Ce module ne calcule aucun maximum : il reçoit `estimated1RM` déjà mesuré
// dans `SessionPilierPerf`. Une copie de la formule d'Epley vivait ici sans
// être appelée une seule fois — supprimée plutôt que branchée.

export function computeFeuTendance(input: FeuTendanceInput): FeuTendanceResult {
  if (input.sessions.length < 3) {
    return { feu: "vert", raison: "Pas assez de données", contexteNormal: true };
  }

  const [s1, s2, s3] = input.sessions as [typeof input.sessions[0], typeof input.sessions[0], typeof input.sessions[0]];
  const contexteNormal =
    [s1.feuJour, s2.feuJour, s3.feuJour].filter((f) => f === "vert").length >= 2;

  // Pour chaque pilier présent dans les 3 sessions, comparer 1RM
  // On groupe par exerciseInstanceId
  const pilierMap: Record<
    string,
    { name: string; sessions: [number, number, number] }
  > = {};

  for (const session of input.sessions) {
    for (const pilier of session.pilierPerfs) {
      if (!pilierMap[pilier.exerciseInstanceId]) {
        pilierMap[pilier.exerciseInstanceId] = { name: pilier.exerciseName, sessions: [0, 0, 0] };
      }
      const idx = input.sessions.indexOf(session);
      const targetSessions = pilierMap[pilier.exerciseInstanceId]!.sessions as number[];
      targetSessions[idx] = pilier.estimated1RM;
    }
  }

  let progres = 0;
  let stagnations = 0;
  let regressions = 0;

  for (const [, data] of Object.entries(pilierMap)) {
    const [ancien, , recent] = data.sessions;
    // Marge de bruit : un 1RM estimé bouge de quelques centaines de grammes d'une
    // séance à l'autre sans que rien n'ait changé. Sans cette marge, une baisse
    // de 1 kg sur 100 déclenchait un feu rouge, donc un deload.
    const variation = ancien > 0 ? (recent - ancien) / ancien : 0;
    if (variation > SEUIL_VARIATION) progres++;
    else if (variation < -SEUIL_VARIATION) regressions++;
    else stagnations++;
  }

  const total = progres + stagnations + regressions;
  if (total === 0) {
    return { feu: "vert", raison: "Pas assez de données", contexteNormal };
  }

  if (progres / total >= 0.5) {
    return { feu: "vert", raison: "Progression sur la majorité des piliers", contexteNormal };
  }

  if (regressions > 0 && contexteNormal) {
    return { feu: "rouge", raison: "Régression détectée sur un pilier", contexteNormal };
  }

  return {
    feu: "orange",
    raison:
      regressions > 0
        ? "Régression mais contexte dégradé"
        : "Stagnation generale",
    contexteNormal,
  };
}
