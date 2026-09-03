import { rpeDansLEchelle } from "./serie-realisee";

/**
 * Ce que la séance donne à voir, pendant qu'elle a lieu.
 *
 * Le Coach n'intervenait qu'à deux moments : quand on lui écrivait, et au
 * débrief. Entre les deux, l'application enregistrait des séries sans que rien
 * ne les regarde — un repos systématiquement écourté, un effort très au-delà
 * de la cible, trois séries ajoutées : autant de faits mesurés et perdus.
 *
 * Ce module est la couche du milieu, et il tient une seule règle : il MESURE,
 * il ne juge pas. Chaque événement est un fait vérifiable, avec ses nombres.
 * Ce qu'il faut en penser appartient au Coach ; ce qui doit changer dans la
 * séance appartient au moteur de progression. Rien ici n'appelle de modèle, ne
 * modifie de plan, ni ne décide à la place de personne.
 *
 * Le découpage évite le piège inverse : déclencher un appel au modèle à chaque
 * série validée coûterait cher et noierait l'utile. La détection est donc
 * séparée de l'intervention — `evenementsDeLaSeance` observe tout,
 * `meritentLeCoach` choisit le peu qui vaut d'être dit.
 */

export type TypeEvenement =
  | "repos_ecourte"
  | "repos_rallonge"
  | "effort_au_dela_de_la_cible"
  | "effort_en_deca_de_la_cible"
  | "series_hors_prescription"
  | "reps_sous_la_fourchette";

export interface EvenementSeance {
  type: TypeEvenement;
  exerciseInstanceId: string;
  /** Les nombres qui fondent le constat, pour que le Coach cite au lieu d'affirmer. */
  mesure: Record<string, number>;
  /** Combien de fois ce fait s'est répété dans la séance. */
  occurrences: number;
}

export interface SerieObservee {
  exerciseInstanceId: string;
  numeroSerie: number;
  repsEffectuees: number | null;
  charge: number | null;
  rpeEffectif?: number | null;
  /** Intervalle réel depuis la série précédente, en secondes. */
  reposReelSecondes?: number | null;
}

export interface PrescriptionObservee {
  exerciseInstanceId: string;
  seriesCibles: number;
  fourchetteRepsMin: number;
  fourchetteRepsMax: number;
  rpeCible?: number | null;
  reposSecondes?: number | null;
}

/**
 * Un repos est-il « écourté » ?
 *
 * Pas de seuil inventé : la comparaison se fait au repos PRESCRIT pour cet
 * exercice. En dessous de la moitié, l'intervalle ne contient plus le repos —
 * il contient à peine la série suivante. C'est la seule borne du module, et
 * elle vient de la prescription, pas d'une constante choisie au hasard.
 */
export const PART_DU_REPOS_PRESCRIT_ECOURTE = 0.5;

/**
 * Au-delà de quel écart un effort mérite-t-il d'être relevé ?
 *
 * Un point entier sur l'échelle. En deçà, l'écart est dans le bruit de la
 * perception : personne ne distingue un 7,5 d'un 8 d'une série à l'autre.
 */
export const ECART_EFFORT_NOTABLE = 1;

export function evenementsDeLaSeance(
  series: SerieObservee[],
  prescriptions: PrescriptionObservee[],
): EvenementSeance[] {
  const parInstance = new Map(prescriptions.map((p) => [p.exerciseInstanceId, p]));
  const accumulateur = new Map<string, EvenementSeance>();

  const noter = (
    type: TypeEvenement,
    exerciseInstanceId: string,
    mesure: Record<string, number>,
  ) => {
    const cle = `${type}:${exerciseInstanceId}`;
    const deja = accumulateur.get(cle);
    if (deja) {
      deja.occurrences += 1;
      // La dernière mesure l'emporte : c'est la plus proche de maintenant.
      deja.mesure = mesure;
      return;
    }
    accumulateur.set(cle, { type, exerciseInstanceId, mesure, occurrences: 1 });
  };

  for (const serie of series) {
    const prescrite = parInstance.get(serie.exerciseInstanceId);
    if (!prescrite) continue;

    // --- Le repos réellement pris ---
    const prescrit = prescrite.reposSecondes;
    const reel = serie.reposReelSecondes;
    if (prescrit != null && prescrit > 0 && reel != null && reel >= 0) {
      if (reel < prescrit * PART_DU_REPOS_PRESCRIT_ECOURTE) {
        noter("repos_ecourte", serie.exerciseInstanceId, { prescrit, reel, ecart: reel - prescrit });
      } else if (reel > prescrit * 2) {
        noter("repos_rallonge", serie.exerciseInstanceId, { prescrit, reel, ecart: reel - prescrit });
      }
    }

    // --- L'effort ressenti face à l'effort visé ---
    const cible = prescrite.rpeCible;
    const reelEffort = serie.rpeEffectif;
    if (cible != null && rpeDansLEchelle(reelEffort)) {
      const ecart = reelEffort! - cible;
      if (ecart >= ECART_EFFORT_NOTABLE) {
        noter("effort_au_dela_de_la_cible", serie.exerciseInstanceId, { cible, reel: reelEffort!, ecart });
      } else if (ecart <= -ECART_EFFORT_NOTABLE) {
        noter("effort_en_deca_de_la_cible", serie.exerciseInstanceId, { cible, reel: reelEffort!, ecart });
      }
    }

    // --- Les répétitions face à la fourchette ---
    if (serie.repsEffectuees != null && serie.repsEffectuees < prescrite.fourchetteRepsMin) {
      noter("reps_sous_la_fourchette", serie.exerciseInstanceId, {
        minimum: prescrite.fourchetteRepsMin,
        reel: serie.repsEffectuees,
        ecart: serie.repsEffectuees - prescrite.fourchetteRepsMin,
      });
    }
  }

  // --- Ce qui a été fait en plus de ce qui était prescrit ---
  for (const prescrite of prescriptions) {
    const faites = series.filter((s) => s.exerciseInstanceId === prescrite.exerciseInstanceId).length;
    if (faites > prescrite.seriesCibles) {
      accumulateur.set(`series_hors_prescription:${prescrite.exerciseInstanceId}`, {
        type: "series_hors_prescription",
        exerciseInstanceId: prescrite.exerciseInstanceId,
        mesure: { prescrites: prescrite.seriesCibles, faites, ecart: faites - prescrite.seriesCibles },
        occurrences: faites - prescrite.seriesCibles,
      });
    }
  }

  return [...accumulateur.values()];
}

/**
 * Ce qui mérite que le Coach ouvre la bouche — et rien de plus.
 *
 * Un fait isolé ne justifie pas d'interrompre quelqu'un au milieu de sa série.
 * Un fait qui SE RÉPÈTE, si : c'est là qu'il cesse d'être un accident et
 * devient une tendance de la séance, donc quelque chose qui se corrige encore.
 *
 * Deux occurrences suffisent : la première peut arriver à tout le monde, la
 * deuxième forme une régularité. Descendre à une occurrence rendrait le Coach
 * bavard, monter à trois lui ferait parler quand la séance est finie.
 */
export const OCCURRENCES_AVANT_INTERVENTION = 2;

/** Les faits dont une seule occurrence suffit à mériter d'être dite. */
const DES_LA_PREMIERE: ReadonlySet<TypeEvenement> = new Set<TypeEvenement>([
  // Une charge nettement trop dure sur une seule série est déjà un signal :
  // la suivante se prépare maintenant, pas au débrief.
  "effort_au_dela_de_la_cible",
]);

export function meritentLeCoach(evenements: EvenementSeance[]): EvenementSeance[] {
  return evenements.filter((e) =>
    DES_LA_PREMIERE.has(e.type) || e.occurrences >= OCCURRENCES_AVANT_INTERVENTION,
  );
}

/**
 * Le fait, en une phrase, sans interprétation.
 *
 * Le Coach reçoit ces phrases comme CONTEXTE, pas comme message à répéter :
 * c'est lui qui décide quoi en dire. Les écrire ici garantit qu'elles citent
 * les mêmes nombres que ceux mesurés, plutôt qu'une reformulation approximative.
 */
export function libelleFactuel(e: EvenementSeance): string {
  const m = e.mesure;
  switch (e.type) {
    case "repos_ecourte":
      return `repos prescrit ${m.prescrit} s, pris ${m.reel} s (${e.occurrences} fois)`;
    case "repos_rallonge":
      return `repos prescrit ${m.prescrit} s, pris ${m.reel} s (${e.occurrences} fois)`;
    case "effort_au_dela_de_la_cible":
      return `effort visé ${m.cible}, ressenti ${m.reel} (${e.occurrences} série(s))`;
    case "effort_en_deca_de_la_cible":
      return `effort visé ${m.cible}, ressenti ${m.reel} (${e.occurrences} série(s))`;
    case "reps_sous_la_fourchette":
      return `fourchette à partir de ${m.minimum} répétitions, ${m.reel} réalisées (${e.occurrences} fois)`;
    case "series_hors_prescription":
      return `${m.prescrites} séries prescrites, ${m.faites} réalisées`;
  }
}
