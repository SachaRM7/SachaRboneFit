/**
 * Classement de l'état du cycle.
 *
 * Le calcul est ici, l'interprétation ailleurs. Savoir si la fatigue monte,
 * si les performances tiennent et si une décharge s'impose relève de la mesure ;
 * décider quoi en faire relève du coaching. Confier le premier au modèle
 * reviendrait à lui demander d'estimer ce qui se compte.
 *
 * Une réserve délibérée sur l'overreaching : il ne se déclenche pas au
 * calendrier. Une semaine n'est « de surcharge » que si le programme l'a
 * prévue ; ce module ne l'invente jamais, il constate seulement si le corps
 * suit la charge qu'on lui impose.
 */

export type PhaseCycle = "accumulation" | "surcharge" | "decharge" | "hors_cycle";
export type StatutFatigue = "basse" | "attendue" | "elevee_attendue" | "elevee_anormale";
export type TendancePerformance = "hausse" | "stable" | "baisse";

export interface EntreeSeance {
  date: string;
  /** 1RM estimé le plus élevé de la séance, tous exercices confondus. */
  meilleur1RM: number | null;
  rpeMoyen: number | null;
  seriesRealisees: number;
}

export interface SignauxCorps {
  /** Heures de sommeil des derniers jours, du plus récent au plus ancien. */
  sommeilRecent: number[];
  /** Intensité maximale de courbature signalée récemment, 0-10. */
  courbatureMax: number;
  /** Une douleur inhabituelle a-t-elle été signalée ? */
  douleurSignalee: boolean;
}

export interface EtatCycle {
  phase: PhaseCycle;
  statutFatigue: StatutFatigue;
  tendancePerformance: TendancePerformance;
  dechargeConseillee: boolean;
  /** Ce qui a conduit à ce classement, pour que le coach puisse l'expliquer. */
  motifs: string[];
}

/** En deçà, le sommeil ne permet plus d'absorber une surcharge. */
const SOMMEIL_INSUFFISANT_HEURES = 6;

/** Nombre de nuits courtes consécutives à partir duquel la fatigue n'est plus normale. */
const NUITS_COURTES_ALARMANTES = 3;

/** Variation de 1RM en deçà de laquelle on parle de stabilité, pas de tendance. */
const BRUIT_PERFORMANCE = 0.02;

/** Semaines d'entraînement continu au-delà desquelles une décharge se justifie. */
const SEMAINES_AVANT_DECHARGE = 6;

export function tendancePerformance(seances: EntreeSeance[]): TendancePerformance {
  const valeurs = seances.map((s) => s.meilleur1RM).filter((v): v is number => v !== null && v > 0);
  if (valeurs.length < 4) return "stable";

  // Les séances arrivent de la plus récente à la plus ancienne : on compare la
  // moitié récente à la moitié précédente plutôt que deux points isolés, qu'un
  // mauvais jour suffirait à faire mentir.
  const moitie = Math.floor(valeurs.length / 2);
  const moyenne = (v: number[]) => v.reduce((t, x) => t + x, 0) / v.length;
  const recent = moyenne(valeurs.slice(0, moitie));
  const precedent = moyenne(valeurs.slice(moitie));
  if (precedent === 0) return "stable";

  const variation = (recent - precedent) / precedent;
  if (variation > BRUIT_PERFORMANCE) return "hausse";
  if (variation < -BRUIT_PERFORMANCE) return "baisse";
  return "stable";
}

export function classerEtatCycle(entrees: {
  phasePrevue: PhaseCycle;
  semainesSansDecharge: number;
  seancesRecentes: EntreeSeance[];
  signaux: SignauxCorps;
}): EtatCycle {
  const { phasePrevue, semainesSansDecharge, seancesRecentes, signaux } = entrees;
  const motifs: string[] = [];

  const tendance = tendancePerformance(seancesRecentes);

  const nuitsCourtes = signaux.sommeilRecent.filter((h) => h < SOMMEIL_INSUFFISANT_HEURES).length;
  const sommeilDegrade = nuitsCourtes >= NUITS_COURTES_ALARMANTES;
  if (sommeilDegrade) motifs.push(`${nuitsCourtes} nuits de moins de ${SOMMEIL_INSUFFISANT_HEURES} h`);

  if (tendance === "baisse") motifs.push("les performances reculent");
  if (signaux.douleurSignalee) motifs.push("une douleur inhabituelle est signalée");
  if (signaux.courbatureMax >= 8) motifs.push(`courbatures à ${signaux.courbatureMax}/10`);
  if (semainesSansDecharge >= SEMAINES_AVANT_DECHARGE) {
    motifs.push(`${semainesSansDecharge} semaines sans décharge`);
  }

  // La fatigue n'a pas le même sens selon ce que le programme demande : élevée
  // pendant une surcharge planifiée, elle est le but ; ailleurs, elle alerte.
  let statutFatigue: StatutFatigue;
  const signesDeFatigue = sommeilDegrade || tendance === "baisse" || signaux.courbatureMax >= 8;

  if (!signesDeFatigue) {
    statutFatigue = phasePrevue === "surcharge" ? "attendue" : "basse";
  } else if (phasePrevue === "surcharge" && tendance !== "baisse") {
    statutFatigue = "elevee_attendue";
  } else {
    statutFatigue = "elevee_anormale";
  }

  const dechargeConseillee =
    statutFatigue === "elevee_anormale" ||
    signaux.douleurSignalee ||
    semainesSansDecharge >= SEMAINES_AVANT_DECHARGE;

  return {
    phase: phasePrevue,
    statutFatigue,
    tendancePerformance: tendance,
    dechargeConseillee,
    motifs,
  };
}
