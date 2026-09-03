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
  /**
   * Le repos qui précède cette série a-t-il été écourté volontairement ?
   *
   * L'intervalle dit COMBIEN de temps s'est écoulé ; ceci dit si la personne a
   * décidé de ne pas attendre. Les deux sont nécessaires : un « Passer » suivi
   * de trois minutes d'attente n'écourte rien, et un intervalle court sans
   * prescription connue n'a rien à quoi se comparer.
   */
  reposIgnore?: boolean;
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
    const aPrescription = prescrit != null && prescrit > 0;
    const aMesure = reel != null && reel >= 0;

    if (aPrescription && aMesure) {
      if (reel! < prescrit! * PART_DU_REPOS_PRESCRIT_ECOURTE) {
        noter("repos_ecourte", serie.exerciseInstanceId, {
          prescrit: prescrit!, reel: reel!, ecart: reel! - prescrit!,
          delibere: serie.reposIgnore ? 1 : 0,
        });
      } else if (reel! > prescrit! * 2) {
        noter("repos_rallonge", serie.exerciseInstanceId, {
          prescrit: prescrit!, reel: reel!, ecart: reel! - prescrit!,
        });
      }
    } else if (serie.reposIgnore && aMesure) {
      /**
       * Un « Passer » sans repos prescrit.
       *
       * Il n'y a rien à quoi comparer la durée — mais l'intention, elle, est
       * explicite et se suffit. C'est le seul cas où le geste fait
       * l'événement : partout ailleurs, c'est la durée qui parle.
       */
      noter("repos_ecourte", serie.exerciseInstanceId, { reel: reel!, delibere: 1 });
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
      return m.prescrit == null
        ? `repos passé volontairement, ${m.reel} s entre les séries (${e.occurrences} fois)`
        : `repos prescrit ${m.prescrit} s, pris ${m.reel} s${m.delibere ? ", passé volontairement" : ""}`
          + ` (${e.occurrences} fois)`;
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

/**
 * Ce fait peut-il encore changer quelque chose ?
 *
 * La règle qui sépare un coach d'un commentateur. Signaler qu'un repos a été
 * écourté alors que la séance est finie ne sert à rien : c'est du récit, et le
 * débrief le fera mieux. Le même fait dit à la deuxième série sur cinq permet
 * encore de corriger la troisième.
 *
 * Deux conditions, et il faut les deux : le fait doit se répéter assez pour ne
 * pas être un accident (`meritentLeCoach`), et il doit rester de la séance sur
 * laquelle il porte.
 */
export interface RestantDeLaSeance {
  /** Séries encore à faire sur l'exercice concerné. */
  seriesRestantesSurLExercice: number;
  /** Exercices encore à faire après celui-ci. */
  exercicesRestants: number;
}

export function peutChangerLaSuite(e: EvenementSeance, restant: RestantDeLaSeance): boolean {
  switch (e.type) {
    // Ces trois-là portent sur l'exécution : ils ne valent que s'il reste des
    // séries à exécuter sur cette machine.
    case "repos_ecourte":
    case "effort_au_dela_de_la_cible":
    case "effort_en_deca_de_la_cible":
      return restant.seriesRestantesSurLExercice > 0;

    // Sous la fourchette, la charge de la SUITE est en question : la même
    // machine tout à l'heure, ou l'exercice suivant si celui-ci est fini.
    case "reps_sous_la_fourchette":
      return restant.seriesRestantesSurLExercice > 0 || restant.exercicesRestants > 0;

    // Un repos rallongé et des séries en plus pèsent sur le temps qui reste :
    // sans exercice après, il n'y a plus rien à arbitrer.
    case "repos_rallonge":
    case "series_hors_prescription":
      return restant.exercicesRestants > 0;
  }
}

/**
 * Ce que le Coach doit voir maintenant — la liste complète des conditions.
 *
 * Un seul point d'entrée, pour que la politique d'intervention ne se retrouve
 * pas dispersée entre le composant et le moteur. Elle est ici, testable, et ne
 * déclenche aucun appel au modèle : elle ne fait que choisir.
 */
export function interventionsUtiles(
  evenements: EvenementSeance[],
  restantParExercice: (exerciseInstanceId: string) => RestantDeLaSeance,
): EvenementSeance[] {
  return meritentLeCoach(evenements)
    .filter((e) => peutChangerLaSuite(e, restantParExercice(e.exerciseInstanceId)));
}
