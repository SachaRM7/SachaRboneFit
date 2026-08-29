/**
 * Records personnels, à partir d'un historique reparti de zéro.
 *
 * Deux principes gouvernent ce module.
 *
 * Le premier : une première mesure n'est pas un record. C'est un point de
 * référence, et le présenter comme un exploit reviendrait à féliciter quelqu'un
 * d'être monté sur la machine. Le record commence à la deuxième performance
 * comparable — celle qui dépasse quelque chose.
 *
 * Le second : un record ne se réduit pas à une charge. 70 kg × 12 vaut un
 * record même quand 80 kg × 8 existe déjà, parce que ce n'est pas la même
 * qualité qu'on mesure. Les records sont donc tenus par plage de répétitions,
 * chacun capable d'être battu indépendamment des autres.
 */

export interface SerieRealisee {
  date: string;
  charge: number;
  reps: number;
  /** Répétitions restantes. Sert au maximum estimé, facultatif. */
  rir?: number | null;
}

/**
 * Plages suivies.
 *
 * Un record de plage est la meilleure charge portée pour *au moins* ce nombre
 * de répétitions. Suivre le nombre exact rendrait les records trop rares pour
 * signifier quoi que ce soit : une série de 11 informerait sur 11 et sur rien
 * d'autre.
 */
export const PLAGES_SUIVIES = [1, 3, 5, 8, 10, 12, 15, 20] as const;
export type Plage = (typeof PLAGES_SUIVIES)[number];

export type NatureMesure = "baseline" | "record";

export interface MesurePlage {
  plage: Plage;
  charge: number;
  reps: number;
  date: string;
  nature: NatureMesure;
  /** Progression depuis la première mesure de cette plage, en pourcentage. */
  progressionDepuisDebut: number | null;
}

export interface RecordsExercice {
  /** Meilleure charge, toutes répétitions confondues. */
  meilleureCharge: { charge: number; reps: number; date: string } | null;
  /** Meilleur maximum estimé, la mesure la plus comparable entre plages. */
  meilleur1RM: { valeur: number; charge: number; reps: number; date: string } | null;
  /** Meilleur tonnage sur une séance. */
  meilleurVolumeSeance: { volume: number; date: string } | null;
  parPlage: MesurePlage[];
  /** Date de la toute première série enregistrée : le début du parcours. */
  debutDuParcours: string | null;
}

/** Répétitions au-delà desquelles l'estimation d'un maximum dérive. */
const REPS_EFFECTIVES_MAXIMALES = 20;

/** Variation en deçà de laquelle deux charges ne se distinguent pas vraiment. */
const BRUIT_CHARGE = 0.001;

function estimer1RM(serie: SerieRealisee): number {
  const effectives = Math.min(serie.reps + (serie.rir ?? 0), REPS_EFFECTIVES_MAXIMALES);
  if (serie.charge <= 0 || effectives <= 0) return 0;
  return effectives === 1 ? serie.charge : serie.charge * (1 + effectives / 30);
}

/** Ordre chronologique, du plus ancien au plus récent. */
function parDate(series: SerieRealisee[]): SerieRealisee[] {
  return [...series].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Records d'un exercice, reconstitués depuis le début.
 *
 * On rejoue l'historique dans l'ordre plutôt que de prendre des maxima : c'est
 * la seule façon de savoir si une performance était une première mesure ou un
 * dépassement, et depuis quand elle tient.
 */
export function recordsDeLExercice(series: SerieRealisee[]): RecordsExercice {
  const valides = parDate(series.filter((s) => s.charge > 0 && s.reps > 0));

  if (valides.length === 0) {
    return {
      meilleureCharge: null, meilleur1RM: null, meilleurVolumeSeance: null,
      parPlage: [], debutDuParcours: null,
    };
  }

  const debutDuParcours = valides[0]!.date;

  let meilleureCharge = valides[0]!;
  let meilleur1RM = valides[0]!;
  const volumeParSeance = new Map<string, number>();

  // Première et meilleure mesure de chaque plage, dans l'ordre où elles arrivent.
  const premiere = new Map<Plage, SerieRealisee>();
  const meilleure = new Map<Plage, SerieRealisee>();

  for (const serie of valides) {
    if (serie.charge > meilleureCharge.charge) meilleureCharge = serie;
    if (estimer1RM(serie) > estimer1RM(meilleur1RM)) meilleur1RM = serie;

    volumeParSeance.set(
      serie.date,
      (volumeParSeance.get(serie.date) ?? 0) + serie.charge * serie.reps,
    );

    for (const plage of PLAGES_SUIVIES) {
      // « Au moins » cette plage : une série de 12 informe aussi sur 10, 8, 5…
      if (serie.reps < plage) continue;
      if (!premiere.has(plage)) premiere.set(plage, serie);
      const actuelle = meilleure.get(plage);
      if (!actuelle || serie.charge > actuelle.charge * (1 + BRUIT_CHARGE)) {
        meilleure.set(plage, serie);
      }
    }
  }

  const parPlage: MesurePlage[] = [];
  for (const plage of PLAGES_SUIVIES) {
    const best = meilleure.get(plage);
    const first = premiere.get(plage);
    if (!best || !first) continue;

    // Tant que la meilleure mesure est la première, il n'y a rien eu à battre.
    const estBaseline = best === first;

    parPlage.push({
      plage,
      charge: best.charge,
      reps: best.reps,
      date: best.date,
      nature: estBaseline ? "baseline" : "record",
      progressionDepuisDebut: estBaseline
        ? null
        : Math.round(((best.charge - first.charge) / first.charge) * 1000) / 10,
    });
  }

  const [dateVolume, volume] = [...volumeParSeance.entries()].reduce(
    (max, entree) => (entree[1] > max[1] ? entree : max),
  );

  return {
    meilleureCharge: {
      charge: meilleureCharge.charge, reps: meilleureCharge.reps, date: meilleureCharge.date,
    },
    meilleur1RM: {
      valeur: Math.round(estimer1RM(meilleur1RM) * 10) / 10,
      charge: meilleur1RM.charge, reps: meilleur1RM.reps, date: meilleur1RM.date,
    },
    meilleurVolumeSeance: { volume: Math.round(volume), date: dateVolume },
    parPlage,
    debutDuParcours,
  };
}

export interface RecordFranchi {
  plage: Plage;
  charge: number;
  reps: number;
  chargePrecedente: number;
  progressionPourcent: number;
}

/**
 * Ce qu'une nouvelle série vient de battre, s'il y a lieu.
 *
 * Appelée au moment de la validation, elle permet d'annoncer un record pendant
 * la séance plutôt qu'après coup. Elle ne renvoie rien pour une première
 * mesure : il n'y a pas de quoi célébrer un point de départ.
 */
export function recordsFranchis(
  nouvelle: SerieRealisee,
  historique: SerieRealisee[],
): RecordFranchi[] {
  if (nouvelle.charge <= 0 || nouvelle.reps <= 0) return [];

  const anterieures = historique.filter((s) => s.charge > 0 && s.reps > 0);
  const franchis: RecordFranchi[] = [];

  for (const plage of PLAGES_SUIVIES) {
    if (nouvelle.reps < plage) continue;

    const comparables = anterieures.filter((s) => s.reps >= plage);
    // Aucune performance antérieure sur cette plage : c'est une baseline.
    if (comparables.length === 0) continue;

    const meilleure = Math.max(...comparables.map((s) => s.charge));
    if (nouvelle.charge > meilleure * (1 + BRUIT_CHARGE)) {
      franchis.push({
        plage,
        charge: nouvelle.charge,
        reps: nouvelle.reps,
        chargePrecedente: meilleure,
        progressionPourcent: Math.round(((nouvelle.charge - meilleure) / meilleure) * 1000) / 10,
      });
    }
  }

  // La plage la plus exigeante d'abord : battre son record à 12 répétitions dit
  // plus que de l'avoir battu à 1.
  return franchis.sort((a, b) => b.plage - a.plage);
}

export type EtapeParcours =
  | "pas_de_donnees"
  | "calibration"
  | "reference_etablie"
  | "progression";

/**
 * Où en est un exercice dans le parcours.
 *
 * Sert à choisir ce que l'écran raconte : on ne parle pas de progression à
 * quelqu'un qui n'a qu'une mesure, et on ne recalibre pas indéfiniment.
 */
export function etapeDuParcours(series: SerieRealisee[]): EtapeParcours {
  const seances = new Set(series.filter((s) => s.charge > 0).map((s) => s.date));
  if (seances.size === 0) return "pas_de_donnees";
  if (seances.size === 1) return "calibration";
  if (seances.size === 2) return "reference_etablie";
  return "progression";
}
