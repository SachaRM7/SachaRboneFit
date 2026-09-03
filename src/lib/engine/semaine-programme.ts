/**
 * Où en est-on dans le cycle, et où en est la semaine.
 *
 * Ce module n'affiche rien et n'invente rien. Il porte surtout des REFUS,
 * parce que le modèle en dit moins qu'un écran de programmation ne voudrait
 * en montrer :
 *
 * — `programme_blocs.semaine_actuelle` est une colonne écrite deux fois dans
 *   toute l'application, avec la valeur littérale 1, et jamais incrémentée.
 *   Elle est pourtant affichée comme une vérité sur le tableau de bord et
 *   transmise au coach. On ne la lit plus : la semaine se DÉDUIT de la date de
 *   début, qui est obligatoire et fiable.
 * — `programme_blocs.date_fin_prevue` est facultative et n'est renseignée par
 *   aucun écran. Sans elle, un cycle n'a pas de durée totale : « semaine 3 / 6 »
 *   ne peut pas être affiché, et « semaine 3 » sera dit seul.
 * — `seance_templates` porte un `ordre_dans_semaine`, pas un jour. Rien dans le
 *   modèle ne dit qu'une séance a lieu le lundi. Aucun jour de la semaine n'est
 *   donc affiché, et aucune séance ne peut être déclarée « manquée » : il
 *   n'existe pas de date à laquelle elle aurait dû avoir lieu.
 */

import { lundiDe, joursEntre } from "@/lib/semaines";
import { dureeEstimeeMinutes } from "./validation-seance";

/** Une séance type du cycle, telle que la base la porte. */
export interface GabaritSeance {
  id: string;
  lettre: string;
  nom: string;
  ordreDansSemaine: number;
  exercices: Array<{
    series: number;
    reposSecondes: number | null;
    /** Piliers travaillés, pour dire de quoi la séance est faite. */
    pilier: string | null;
  }>;
}

/** Une séance réellement effectuée, rattachée ou non à un gabarit. */
export interface SeanceFaite {
  seanceTemplateId: string | null;
  date: string;
  /** Au moins un exercice a été remplacé par les circonstances. */
  adaptee: boolean;
}

/**
 * Où en est une séance de la semaine.
 *
 * Deux corrections par rapport à la première version, et les deux venaient de
 * la même cause : quatre faits différents étaient tassés dans un seul mot.
 *
 * `aujourdhui` s'appelle `faite_aujourdhui`. Le mot seul ne disait pas s'il
 * s'agissait d'une séance FAITE aujourd'hui ou d'une séance À FAIRE
 * aujourd'hui — et l'écran l'affichait dans le style le plus appuyé de la
 * liste, ce qui le faisait lire comme une consigne. Or rien dans le modèle
 * n'attribue un jour à une séance : « à faire aujourd'hui » ne peut pas être
 * dit, et c'est justement ce que le module refuse par ailleurs.
 *
 * Et `adaptee` n'est plus un état, mais un fait à part. Il en était un, placé
 * dans la même alternative que la date : une séance faite aujourd'hui ET
 * adaptée ressortait « aujourd'hui », l'adaptation disparaissait. Les deux
 * questions sont indépendantes — quand, et telle que prévue ou non.
 */
export type EtatSeance = "terminee" | "faite_aujourdhui" | "prochaine" | "a_venir";

export interface SeanceDeLaSemaine {
  templateId: string;
  lettre: string;
  nom: string;
  ordre: number;
  exercices: number;
  dureeEstimeeMinutes: number;
  /** Piliers dominants, du plus représenté au moins représenté. */
  piliers: string[];
  etat: EtatSeance;
  /**
   * Au moins un exercice a été remplacé par les circonstances.
   *
   * Indépendant de l'état : une séance peut être faite aujourd'hui ET adaptée.
   */
  adaptee: boolean;
  /** Date de réalisation, quand la séance a eu lieu cette semaine. */
  faiteLe: string | null;
}

export interface PositionDansLeCycle {
  /** Numéro de semaine déduit de la date de début. Commence à 1. */
  semaine: number;
  /**
   * Nombre total de semaines, uniquement si `date_fin_prevue` existe.
   * `null` le reste du temps — et alors l'écran dit « semaine 3 », pas
   * « semaine 3 sur ? ».
   */
  semainesTotal: number | null;
  /** Fraction parcourue, seulement quand le total est connu. */
  avancement: number | null;
  /** Vrai quand la date de fin est dépassée : le cycle demande une suite. */
  termine: boolean;
}

/**
 * Position dans le cycle, déduite des dates.
 *
 * On compte en semaines calendaires entamées : un cycle démarré un jeudi est
 * en semaine 2 le lundi suivant, pas cinq jours plus tard. C'est ainsi que se
 * lit un programme hebdomadaire.
 */
export function positionDansLeCycle(
  dateDebut: string,
  dateFinPrevue: string | null,
  aujourdhui: string,
): PositionDansLeCycle {
  const semainesEcoulees = Math.floor(
    joursEntre(lundiDe(dateDebut), lundiDe(aujourdhui)) / 7,
  );
  const semaine = Math.max(1, semainesEcoulees + 1);

  if (!dateFinPrevue) {
    return { semaine, semainesTotal: null, avancement: null, termine: false };
  }

  const total = Math.max(
    1,
    Math.floor(joursEntre(lundiDe(dateDebut), lundiDe(dateFinPrevue)) / 7) + 1,
  );

  return {
    semaine: Math.min(semaine, total),
    semainesTotal: total,
    avancement: Math.min(1, semaine / total),
    termine: aujourdhui > dateFinPrevue,
  };
}

/**
 * État de chaque séance type pour la semaine en cours.
 *
 * « Terminée » et « adaptée » se lisent dans les séances réellement
 * enregistrées cette semaine. « Aujourd'hui » n'est affirmé que si une séance
 * a effectivement été enregistrée aujourd'hui. La première séance non faite
 * est dite « prochaine » — et non « aujourd'hui » : rien dans le modèle ne
 * fixe le jour d'une séance.
 */
export function semaineDuProgramme(entrees: {
  gabarits: GabaritSeance[];
  seancesFaites: SeanceFaite[];
  aujourdhui: string;
}): SeanceDeLaSemaine[] {
  const { gabarits, seancesFaites, aujourdhui } = entrees;
  const lundi = lundiDe(aujourdhui);

  const deLaSemaine = seancesFaites.filter(
    (s) => lundiDe(s.date) === lundi && s.seanceTemplateId !== null,
  );

  const faitePour = new Map<string, SeanceFaite>();
  for (const s of deLaSemaine) {
    const actuelle = faitePour.get(s.seanceTemplateId!);
    // La plus récente fait foi si le gabarit a été refait dans la semaine.
    if (!actuelle || s.date > actuelle.date) faitePour.set(s.seanceTemplateId!, s);
  }

  const tries = [...gabarits].sort((a, b) => a.ordreDansSemaine - b.ordreDansSemaine);
  const premiereNonFaite = tries.find((g) => !faitePour.has(g.id))?.id ?? null;

  return tries.map((g) => {
    const faite = faitePour.get(g.id);

    let etat: EtatSeance;
    if (faite) {
      etat = faite.date === aujourdhui ? "faite_aujourdhui" : "terminee";
    } else {
      etat = g.id === premiereNonFaite ? "prochaine" : "a_venir";
    }

    // Les piliers les plus représentés disent de quoi la séance est faite,
    // sans avoir à déplier la liste des exercices.
    const compte = new Map<string, number>();
    for (const e of g.exercices) {
      if (!e.pilier) continue;
      compte.set(e.pilier, (compte.get(e.pilier) ?? 0) + 1);
    }

    return {
      templateId: g.id,
      lettre: g.lettre,
      nom: g.nom,
      ordre: g.ordreDansSemaine,
      exercices: g.exercices.length,
      dureeEstimeeMinutes: dureeEstimeeMinutes(
        g.exercices.map((e) => ({ series: e.series, reposSecondes: e.reposSecondes ?? 120 })),
      ),
      piliers: [...compte.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([p]) => p),
      etat,
      adaptee: faite?.adaptee ?? false,
      faiteLe: faite?.date ?? null,
    };
  });
}

/**
 * Une décharge est-elle recommandable, et pour une raison qui tienne ?
 *
 * `classerEtatCycle` conseille une décharge dès six semaines sans décharge,
 * indépendamment de tout signal corporel. Afficher cette recommandation telle
 * quelle reviendrait à décréter une décharge au calendrier — exactement ce
 * qu'on refuse. On exige donc au moins un motif qui vienne du corps ou des
 * performances ; l'ancienneté seule ne suffit pas à alerter, elle sera dite
 * autrement.
 */
export function dechargeJustifiee(entrees: {
  dechargeConseillee: boolean;
  statutFatigue: string;
  tendancePerformance: string;
  douleurSignalee: boolean;
}): boolean {
  if (!entrees.dechargeConseillee) return false;
  return (
    entrees.statutFatigue === "elevee_anormale" ||
    entrees.tendancePerformance === "baisse" ||
    entrees.douleurSignalee
  );
}
