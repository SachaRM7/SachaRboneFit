/**
 * Ce qui évolue, dit sans rien inventer.
 *
 * L'écran Progression demandait de choisir un exercice avant de montrer quoi
 * que ce soit — et la liste des exercices n'était jamais remplie, donc il ne
 * montrait jamais rien. Ce module produit à la place une lecture d'ensemble.
 *
 * Sa règle unique : ne rien afficher qui ne soit interprétable. Un indicateur
 * calculé sur une semaine commencée mardi, une « stagnation » sur un exercice
 * fait deux fois, un « record » qui n'est que la première mesure — ce sont des
 * chiffres, pas des informations. Chaque grandeur ci-dessous porte donc sa
 * condition d'existence, et vaut `null` tant qu'elle n'est pas remplie.
 * L'écran dit alors ce qui manque, plutôt que d'afficher un zéro.
 */

import { lundiDe, semainesRevolues, joursEntre } from "@/lib/semaines";
import {
  recordsDeLExercice,
  recordsFranchis,
  type RecordFranchi,
  type SerieRealisee,
  type Plage,
} from "./records";
import { progressionDeLExercice, type ProgressionExercice } from "./score-progression";

// ---------------------------------------------------------------------------
// Seuils — centralisés, parce que ce sont eux qui décident de ce qu'on ose dire
// ---------------------------------------------------------------------------

export const SEUILS = {
  /** En dessous, un exercice n'a pas d'historique : ni progression ni stagnation. */
  seancesPourInterpreter: 3,
  /** Deux semaines révolues au minimum pour parler de tendance. */
  semainesPourTendance: 2,
  /** Semaines révolues examinées pour l'adhérence et le volume. */
  fenetreSemaines: 4,
  /** En deçà, une variation de volume relève du bruit et n'est pas commentée. */
  variationNegligeablePct: 10,
  /** Un muscle sous ce nombre de séries hebdomadaires n'est pas « travaillé ». */
  seriesMinPourCiter: 2,
  /** Part d'un muscle secondaire dans le volume. Convention assumée. */
  poidsMuscleSecondaire: 0.5,
} as const;

// ---------------------------------------------------------------------------
// Entrée
// ---------------------------------------------------------------------------

export interface SerieBilan {
  date: string;
  exerciseInstanceId: string;
  exerciceNom: string;
  charge: number;
  reps: number;
  rir: number | null;
  musclesPrincipaux: string[];
  musclesSecondaires: string[];
}

export interface SeanceBilan {
  date: string;
  dureeMinutes: number | null;
}

/** Stagnation brute, telle que le service la calcule déjà. */
export interface StagnationBrute {
  exerciseInstanceId: string;
  exerciseName: string;
  semainesSansProgression: number;
  semainesEmpechees?: number;
  contexteNormal: boolean;
}

export interface EntreeBilan {
  aujourdhui: string;
  seances: SeanceBilan[];
  series: SerieBilan[];
  stagnations: StagnationBrute[];
  /** Fourchette déclarée à l'onboarding. Absente tant qu'elle n'est pas connue. */
  frequenceMinParSemaine: number | null;
  frequenceCibleParSemaine: number | null;
  frequenceMaxParSemaine: number | null;
}

// ---------------------------------------------------------------------------
// Sortie
// ---------------------------------------------------------------------------

export type EtatBilan = "sans_donnees" | "premieres_references" | "en_route";

export interface Adherence {
  semainesObservees: number;
  semainesTenues: number;
  seancesParSemaine: number[];
  min: number;
  cible: number;
  max: number;
  statut: "sous_le_minimum" | "dans_la_fourchette" | "au_dessus_de_la_cible";
}

export interface TendanceVolume {
  seriesDerniereSemaine: number;
  seriesMoyenneAnterieure: number;
  semainesComparees: number;
  variationPct: number;
  /** Vrai quand la variation dépasse le bruit et mérite d'être lue. */
  significative: boolean;
  tonnageDerniereSemaine: number;
}

export interface RecordRecent {
  exerciseInstanceId: string;
  exerciceNom: string;
  plage: Plage;
  charge: number;
  reps: number;
  date: string;
  progressionPct: number;
}

/**
 * Un exercice qui progresse, avec de quoi le classer ET de quoi le montrer.
 *
 * Le score décide de l'ordre ; les métriques brutes qui l'accompagnent sont
 * ce qu'on affiche. On ne montre pas le score : ce serait présenter un choix
 * de pondération comme une mesure.
 */
export interface ExerciceEnProgression extends ProgressionExercice {
  exerciseInstanceId: string;
  exerciceNom: string;
}

export interface MuscleTravaille {
  muscle: string;
  series: number;
  tonnage: number;
}

export interface StagnationInterpretable {
  exerciseInstanceId: string;
  exerciceNom: string;
  semaines: number;
  seances: number;
}

export interface Bilan {
  etat: EtatBilan;
  periode: { debut: string; fin: string; jours: number } | null;
  seancesTotal: number;
  seancesDerniereSemaine: number | null;
  dureeMedianeMinutes: number | null;
  adherence: Adherence | null;
  volume: TendanceVolume | null;
  recordsRecents: RecordRecent[];
  enProgression: ExerciceEnProgression[];
  musclesDeLaPeriode: MuscleTravaille[];
  stagnations: StagnationInterpretable[];
  /** Ce qui n'est pas encore mesurable, et pourquoi. Jamais un zéro déguisé. */
  enAttente: string[];
}

// ---------------------------------------------------------------------------

const mediane = (valeurs: number[]): number | null => {
  if (valeurs.length === 0) return null;
  const tri = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(tri.length / 2);
  return tri.length % 2 === 1
    ? tri[milieu]!
    : Math.round(((tri[milieu - 1]! + tri[milieu]!) / 2) * 10) / 10;
};

function parInstance(series: SerieBilan[]): Map<string, SerieBilan[]> {
  const carte = new Map<string, SerieBilan[]>();
  for (const s of series) {
    carte.set(s.exerciseInstanceId, [...(carte.get(s.exerciseInstanceId) ?? []), s]);
  }
  return carte;
}

const versSerieRealisee = (s: SerieBilan): SerieRealisee => ({
  date: s.date,
  charge: s.charge,
  reps: s.reps,
  rir: s.rir,
});

/**
 * Séances par semaine révolue, la plus ancienne d'abord.
 *
 * Les semaines sans séance comptent pour zéro : les omettre transformerait
 * trois semaines d'arrêt en une moyenne intacte.
 */
function seancesParSemaineRevolue(
  dates: string[],
  aujourdhui: string,
  nombre: number,
): { lundi: string; seances: number }[] {
  const compte = new Map<string, Set<string>>();
  for (const d of dates) {
    const lundi = lundiDe(d);
    compte.set(lundi, (compte.get(lundi) ?? new Set()).add(d));
  }
  return semainesRevolues(aujourdhui, nombre).map((lundi) => ({
    lundi,
    seances: compte.get(lundi)?.size ?? 0,
  }));
}

/** Ne garde que les semaines révolues postérieures à la première séance. */
function semainesObservables(
  semaines: { lundi: string; seances: number }[],
  premiereSeance: string,
): { lundi: string; seances: number }[] {
  const lundiDebut = lundiDe(premiereSeance);
  return semaines.filter((s) => s.lundi >= lundiDebut);
}

function calculerAdherence(e: EntreeBilan, datesSeances: string[]): Adherence | null {
  const { frequenceMinParSemaine: min, frequenceCibleParSemaine: cible } = e;
  const max = e.frequenceMaxParSemaine;
  // Sans fourchette déclarée, « l'adhérence » n'aurait aucune référence : ce
  // serait un nombre de séances présenté comme un jugement.
  if (min == null || cible == null || max == null) return null;
  if (datesSeances.length === 0) return null;

  const toutes = seancesParSemaineRevolue(datesSeances, e.aujourdhui, SEUILS.fenetreSemaines);
  const observees = semainesObservables(toutes, datesSeances[0]!);
  if (observees.length === 0) return null;

  const seances = observees.map((s) => s.seances);
  const tenues = seances.filter((n) => n >= min).length;
  const moyenne = seances.reduce((t, n) => t + n, 0) / seances.length;

  return {
    semainesObservees: observees.length,
    semainesTenues: tenues,
    seancesParSemaine: seances,
    min,
    cible,
    max,
    statut:
      moyenne < min
        ? "sous_le_minimum"
        : moyenne > cible
          ? "au_dessus_de_la_cible"
          : "dans_la_fourchette",
  };
}

function calculerVolume(e: EntreeBilan): TendanceVolume | null {
  const semaines = semainesRevolues(e.aujourdhui, SEUILS.fenetreSemaines);
  const seriesParSemaine = new Map<string, { series: number; tonnage: number }>();
  for (const s of e.series) {
    const lundi = lundiDe(s.date);
    const actuel = seriesParSemaine.get(lundi) ?? { series: 0, tonnage: 0 };
    actuel.series += 1;
    actuel.tonnage += s.charge * s.reps;
    seriesParSemaine.set(lundi, actuel);
  }

  // Une semaine n'est comparable qu'à partir du moment où l'historique existe.
  const premiereSemaine = e.series.length > 0 ? lundiDe([...e.series].sort((a, b) => a.date.localeCompare(b.date))[0]!.date) : null;
  if (!premiereSemaine) return null;

  const observables = semaines.filter((l) => l >= premiereSemaine);
  if (observables.length < SEUILS.semainesPourTendance) return null;

  const derniere = observables[observables.length - 1]!;
  const anterieures = observables.slice(0, -1);

  const seriesDerniere = seriesParSemaine.get(derniere)?.series ?? 0;
  const moyenneAnterieure =
    anterieures.reduce((t, l) => t + (seriesParSemaine.get(l)?.series ?? 0), 0) / anterieures.length;

  if (moyenneAnterieure === 0) return null;

  const variation = Math.round(((seriesDerniere - moyenneAnterieure) / moyenneAnterieure) * 1000) / 10;

  return {
    seriesDerniereSemaine: seriesDerniere,
    seriesMoyenneAnterieure: Math.round(moyenneAnterieure * 10) / 10,
    semainesComparees: observables.length,
    variationPct: variation,
    significative: Math.abs(variation) >= SEUILS.variationNegligeablePct,
    tonnageDerniereSemaine: Math.round(seriesParSemaine.get(derniere)?.tonnage ?? 0),
  };
}

/**
 * Records franchis, en rejouant l'historique séance par séance.
 *
 * Prendre les records actuels ne dirait que l'état d'aujourd'hui : trois
 * dépassements successifs sur le même exercice se réduiraient au dernier.
 * On rejoue donc chaque séance contre ce qui la précédait — c'est la seule
 * façon de savoir ce qui a été battu, et quand.
 *
 * Une seule ligne par exercice et par jour : une série de douze répétitions
 * bat mécaniquement les plages 12, 10, 8, 5, 3 et 1. Les afficher toutes
 * ferait passer une performance pour six.
 */
function calculerRecords(series: SerieBilan[], depuis: string): RecordRecent[] {
  const recents: RecordRecent[] = [];

  for (const [instanceId, lignes] of parInstance(series)) {
    const nom = lignes[0]!.exerciceNom;
    const realisees = lignes.map(versSerieRealisee).sort((a, b) => a.date.localeCompare(b.date));
    const dates = [...new Set(realisees.map((s) => s.date))].sort();

    for (const date of dates) {
      if (date < depuis) continue;
      const anterieures = realisees.filter((s) => s.date < date);
      // Rien d'antérieur : ce jour-là on mesurait, on ne battait rien.
      if (anterieures.length === 0) continue;

      let meilleur: RecordFranchi | null = null;
      for (const s of realisees.filter((x) => x.date === date)) {
        for (const f of recordsFranchis(s, anterieures)) {
          if (!meilleur || f.plage > meilleur.plage) meilleur = f;
        }
      }
      if (!meilleur) continue;

      recents.push({
        exerciseInstanceId: instanceId,
        exerciceNom: nom,
        plage: meilleur.plage,
        charge: meilleur.charge,
        reps: meilleur.reps,
        date,
        progressionPct: meilleur.progressionPourcent,
      });
    }
  }

  return recents.sort((a, b) => b.date.localeCompare(a.date) || b.progressionPct - a.progressionPct);
}

/**
 * Exercices sur lesquels les données montrent le plus clairement une
 * amélioration récente.
 *
 * Le classement ne se fait PAS sur le pourcentage de gain : les incréments
 * disponibles ne sont pas proportionnels à la charge, donc le pourcentage
 * place mécaniquement les petits exercices devant. Le détail du score et de
 * ses pondérations vit dans `score-progression`.
 */
function calculerProgression(series: SerieBilan[], aujourdhui: string): ExerciceEnProgression[] {
  const resultat: ExerciceEnProgression[] = [];

  for (const [instanceId, lignes] of parInstance(series)) {
    const progression = progressionDeLExercice(
      lignes.map((l) => ({ ...versSerieRealisee(l), date: l.date })),
      aujourdhui,
    );
    if (!progression || progression.score <= 0) continue;

    resultat.push({
      ...progression,
      exerciseInstanceId: instanceId,
      exerciceNom: lignes[0]!.exerciceNom,
    });
  }

  return resultat.sort(
    (a, b) =>
      b.score - a.score ||
      // À score égal, l'historique le mieux documenté passe devant.
      b.seances - a.seances ||
      a.exerciceNom.localeCompare(b.exerciceNom),
  );
}

function calculerMuscles(series: SerieBilan[]): MuscleTravaille[] {
  const cumul = new Map<string, MuscleTravaille>();
  const ajouter = (muscle: string, series_: number, tonnage: number) => {
    const actuel = cumul.get(muscle) ?? { muscle, series: 0, tonnage: 0 };
    actuel.series += series_;
    actuel.tonnage += tonnage;
    cumul.set(muscle, actuel);
  };

  for (const s of series) {
    const tonnage = s.charge * s.reps;
    for (const m of s.musclesPrincipaux ?? []) ajouter(m, 1, tonnage);
    for (const m of s.musclesSecondaires ?? []) {
      ajouter(m, SEUILS.poidsMuscleSecondaire, tonnage * SEUILS.poidsMuscleSecondaire);
    }
  }

  return [...cumul.values()]
    .filter((m) => m.series >= SEUILS.seriesMinPourCiter)
    .map((m) => ({ ...m, series: Math.round(m.series * 2) / 2, tonnage: Math.round(m.tonnage) }))
    .sort((a, b) => b.series - a.series);
}

/**
 * Séances réellement effectuées sur un exercice depuis son dernier record.
 *
 * C'est la mesure qui compte pour parler de stagnation. Le calendrier ne dit
 * rien : six semaines sans record peuvent être six semaines d'essais infructueux
 * — une stagnation — ou six semaines où l'exercice n'a pas été fait une seule
 * fois, ce qui n'est pas la même chose et ne se corrige pas de la même façon.
 */
function seancesDepuisLeRecord(series: SerieBilan[]): Map<string, number> {
  const compte = new Map<string, number>();

  for (const [id, lignes] of parInstance(series)) {
    const records = recordsDeLExercice(lignes.map(versSerieRealisee));
    const dateRecord = records.meilleur1RM?.date;
    if (!dateRecord) {
      compte.set(id, 0);
      continue;
    }
    compte.set(id, new Set(lignes.filter((l) => l.date > dateRecord).map((l) => l.date)).size);
  }

  return compte;
}

/**
 * Stagnations qu'on peut réellement interpréter.
 *
 * Trois filtres, et chacun a une raison d'être :
 *
 * — le contexte doit être normal : stagner après trois nuits blanches n'est pas
 *   une stagnation d'entraînement ;
 * — l'exercice doit avoir été RETENTÉ au moins trois fois depuis son record.
 *   Un exercice absent n'a pas stagné, il n'a pas été fait — et les semaines
 *   d'empêchement déduites en amont ne couvrent que les absences expliquées
 *   par une substitution, pas celles où l'exercice n'a simplement pas été
 *   programmé ;
 * — le délai doit dépasser le seuil, empêchements déjà déduits.
 *
 * Ce qui reste est une vraie question à se poser, pas un reproche.
 */
function calculerStagnations(
  stagnations: StagnationBrute[],
  series: SerieBilan[],
  seuilSemaines: number,
): StagnationInterpretable[] {
  const depuisRecord = seancesDepuisLeRecord(series);

  return stagnations
    .filter((s) => s.contexteNormal)
    .filter((s) => s.semainesSansProgression >= seuilSemaines)
    .filter((s) => (depuisRecord.get(s.exerciseInstanceId) ?? 0) >= SEUILS.seancesPourInterpreter)
    .map((s) => ({
      exerciseInstanceId: s.exerciseInstanceId,
      exerciceNom: s.exerciseName,
      semaines: s.semainesSansProgression,
      seances: depuisRecord.get(s.exerciseInstanceId)!,
    }))
    .sort((a, b) => b.semaines - a.semaines);
}

// ---------------------------------------------------------------------------

export function bilanProgression(e: EntreeBilan): Bilan {
  const vide: Bilan = {
    etat: "sans_donnees",
    periode: null,
    seancesTotal: 0,
    seancesDerniereSemaine: null,
    dureeMedianeMinutes: null,
    adherence: null,
    volume: null,
    recordsRecents: [],
    enProgression: [],
    musclesDeLaPeriode: [],
    stagnations: [],
    enAttente: [],
  };

  const seances = [...e.seances].sort((a, b) => a.date.localeCompare(b.date));
  if (seances.length === 0) return vide;

  const datesSeances = [...new Set(seances.map((s) => s.date))].sort();
  const debut = datesSeances[0]!;
  const fin = datesSeances[datesSeances.length - 1]!;

  const semaines = seancesParSemaineRevolue(datesSeances, e.aujourdhui, SEUILS.fenetreSemaines);
  const observees = semainesObservables(semaines, debut);
  const derniereRevolue = observees.length > 0 ? observees[observees.length - 1]!.seances : null;

  const adherence = calculerAdherence(e, datesSeances);
  const volume = calculerVolume(e);
  const records = calculerRecords(e.series, debut);
  const enProgression = calculerProgression(e.series, e.aujourdhui);
  const muscles = calculerMuscles(e.series);
  const stagnations = calculerStagnations(e.stagnations, e.series, SEUILS.semainesPourTendance);

  // Une seule séance : les références existent, rien n'est encore comparable.
  const etat: EtatBilan = datesSeances.length === 1 ? "premieres_references" : "en_route";

  const enAttente: string[] = [];
  if (etat === "premieres_references") {
    enAttente.push("Tes premières références sont posées. La deuxième séance ouvrira les comparaisons.");
  } else {
    if (!volume) {
      enAttente.push("La tendance de volume demande deux semaines complètes d'historique.");
    }
    if (records.length === 0 && enProgression.length === 0) {
      enAttente.push("Aucun record franchi pour l'instant : il faut dépasser une performance déjà mesurée.");
    }
    if (!adherence && e.frequenceMinParSemaine == null) {
      enAttente.push("Renseigne ta fréquence d'entraînement pour suivre ton adhérence.");
    }
  }

  return {
    etat,
    periode: { debut, fin, jours: joursEntre(debut, e.aujourdhui) },
    seancesTotal: datesSeances.length,
    seancesDerniereSemaine: derniereRevolue,
    dureeMedianeMinutes: mediane(
      seances.map((s) => s.dureeMinutes).filter((d): d is number => d != null && d > 0),
    ),
    adherence,
    volume,
    recordsRecents: records,
    enProgression,
    musclesDeLaPeriode: muscles,
    stagnations,
    enAttente,
  };
}
