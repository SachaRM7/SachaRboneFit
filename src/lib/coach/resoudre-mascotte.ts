import type { EtatVisuelMascotte } from "./mascotte-assets";

/**
 * QUEL VISAGE DU COACH, POUR QUEL FAIT.
 *
 * LA CHAÎNE, ET SON SENS UNIQUE
 *
 *   FAIT RÉEL           le moteur, la base, un geste de l'utilisateur
 *        ↓
 *   SIGNAL              ce que la surface a constaté, pas ce qu'elle en pense
 *        ↓
 *   RÉSOLUTION          ici — déterministe, testable, sans effet de bord
 *        ↓
 *   ASSET               un des treize
 *
 * Elle ne remonte jamais. Aucune fonction de ce fichier ne décide d'une charge,
 * d'un volume, d'une substitution, d'une protection ou d'un arrêt : elle
 * REPRÉSENTE une décision déjà prise ailleurs. Le jour où l'on voudrait changer
 * ce qu'affiche le Coach, on changera ce fichier ; le jour où l'on voudrait
 * changer ce que fait l'application, on n'y touchera pas.
 *
 * POURQUOI PLUSIEURS RÉSOLVEURS ET NON UN SEUL
 *
 * Un unique `resoudreMascotte(tout)` finirait par connaître le Live, le
 * programme, la progression, le coach et les incidents — c'est-à-dire par
 * dépendre de la moitié du dépôt, et par devoir être modifié à chaque évolution
 * de n'importe laquelle de ces surfaces. Chaque surface a donc son résolveur,
 * qui ne reçoit que ce qu'elle sait. Ce qu'ils partagent est la PRIORITÉ, parce
 * qu'elle, elle doit être la même partout.
 *
 * IL Y A PLUS DE CONTEXTES QUE D'ASSETS, ET C'EST VOULU
 *
 * « Machine occupée », « changement de salle » et « modifier le programme » sont
 * trois faits distincts qui appellent la même image : le Coach montre le plan.
 * Fabriquer un asset par événement métier aurait donné une galerie que personne
 * ne sait plus lire.
 */

/**
 * L'ordre dans lequel les états se disputent une même surface.
 *
 * Le plus urgent d'abord. Cet ordre existe parce qu'une seule mascotte forte
 * s'affiche à la fois : sans lui, un écran pourrait montrer « repos » pendant
 * qu'une douleur vient d'être signalée.
 *
 * `beast` n'y figure pas — il n'entre jamais en concurrence, il est dormant.
 */
export const PRIORITE_MASCOTTE: EtatVisuelMascotte[] = [
  "attention",
  "intervention",
  "repos",
  "calibration",
  "progres",
  "encouragement",
  "debrief",
  "technique",
  "planification",
  "analyse",
  "training",
  "ready",
];

/**
 * Le plus prioritaire des états proposés.
 *
 * Les `null` et `undefined` sont ignorés : une surface propose ce qu'elle
 * constate, et « rien à signaler » est une réponse normale.
 */
export function plusPrioritaire(
  ...candidats: (EtatVisuelMascotte | null | undefined)[]
): EtatVisuelMascotte | null {
  let gagnant: EtatVisuelMascotte | null = null;
  let rang = Number.POSITIVE_INFINITY;

  for (const c of candidats) {
    if (!c) continue;
    const r = PRIORITE_MASCOTTE.indexOf(c);
    // Un état hors priorité — `beast` — ne gagne jamais une résolution.
    if (r === -1) continue;
    if (r < rang) {
      rang = r;
      gagnant = c;
    }
  }
  return gagnant;
}

// ---------------------------------------------------------------------------
// LE LIVE
// ---------------------------------------------------------------------------

/** Ce que l'écran de séance a constaté — rien de plus, rien d'interprété. */
export interface ContexteLive {
  /** Une douleur vient d'être signalée sur cette séance. */
  douleur?: boolean;
  /** Un symptôme général a été signalé — distinct d'une douleur d'exercice. */
  symptome?: boolean;
  /** Le check-in proactif est affiché (retour après une pause, par exemple). */
  checkin?: boolean;
  /** L'observateur a un fait à présenter, non encore écarté. */
  observation?: boolean;
  /** Le minuteur de repos est ouvert. */
  repos?: boolean;
  /** La phase du cycle demande une réserve de répétitions plutôt qu'un RPE. */
  calibration?: boolean;
  /** La validation qui vient d'avoir lieu a terminé l'exercice. */
  exerciceTermine?: boolean;
  /** La séance n'a pas encore commencé : on la prépare. */
  avantDemarrage?: boolean;
}

/**
 * Le visage du Coach pendant une séance.
 *
 * L'ordre des tests suit `PRIORITE_MASCOTTE`, et les deux doivent rester
 * d'accord — c'est ce que vérifie `resoudre-mascotte.test.ts`.
 *
 * DOULEUR ET SYMPTÔME NE SONT PAS FUSIONNÉS : ce sont deux faits distincts dans
 * le moteur, et ils le restent ici. Ils appellent la même image parce que le
 * Coach dit la même chose des deux — « attends, regardons ça » — pas parce
 * qu'ils seraient la même chose.
 */
export function resoudreMascotteLive(ctx: ContexteLive): EtatVisuelMascotte {
  if (ctx.douleur || ctx.symptome || ctx.checkin) return "attention";
  if (ctx.observation) return "intervention";
  if (ctx.repos) return "repos";

  /*
   * La calibration passe AVANT la fin d'exercice.
   *
   * Pendant une reprise, terminer un exercice ne prouve rien qu'on puisse
   * célébrer : la série servait à construire un repère. Féliciter ici
   * apprendrait à l'athlète que le Coach félicite tout.
   */
  if (ctx.calibration) return "calibration";
  if (ctx.exerciceTermine) return "encouragement";
  if (ctx.avantDemarrage) return "ready";
  return "training";
}

// ---------------------------------------------------------------------------
// LA FIN D'UNE SÉANCE
// ---------------------------------------------------------------------------

export interface ContexteFinDeSeance {
  /**
   * Une progression NOTABLE, établie par les règles existantes.
   *
   * Jamais un booléen calculé ici : c'est le moteur qui sait ce qu'est un
   * progrès, et lui seul. Voir `lib/engine/double-progression`.
   */
  progresConfirme?: boolean;
  /** La séance était une reprise ou une calibration. */
  calibration?: boolean;
  /** La séance a été écourtée ou fortement adaptée. */
  adaptee?: boolean;
}

/**
 * Le visage du bilan.
 *
 * `debrief` est le défaut, et c'est un choix : un bilan neutre est une réponse
 * honnête. Célébrer une séance écourtée, ou une baseline de calibration,
 * transformerait la mascotte en applaudissement automatique — et un
 * applaudissement automatique ne veut plus rien dire quand il compte vraiment.
 */
export function resoudreMascotteFinDeSeance(
  ctx: ContexteFinDeSeance,
): EtatVisuelMascotte {
  if (ctx.calibration) return "calibration";
  if (ctx.progresConfirme && !ctx.adaptee) return "progres";
  return "debrief";
}

// ---------------------------------------------------------------------------
// LE COACH LUI-MÊME
// ---------------------------------------------------------------------------

/**
 * Les sujets que le tiroir du Coach sait porter.
 *
 * C'est le CONTEXTE d'ouverture qui choisit l'image, jamais la réponse du
 * modèle : laisser un texte généré décider de l'illustration reviendrait à lui
 * confier une part du produit, et à voir l'image changer d'une exécution à
 * l'autre pour la même question.
 */
export type SujetCoach =
  | "observation_seance"
  | "expliquer_exercice"
  | "technique"
  | "modifier_programme"
  | "materiel"
  | "salle"
  | "adaptation_programme"
  | "stagnation"
  | "analyse_seance"
  | "live";

export function resoudreMascotteCoach(
  sujet: SujetCoach | null | undefined,
): EtatVisuelMascotte {
  switch (sujet) {
    case "observation_seance":
      return "intervention";
    case "expliquer_exercice":
    case "technique":
      return "technique";
    case "modifier_programme":
    case "materiel":
    case "salle":
    case "adaptation_programme":
      return "planification";
    case "stagnation":
    case "analyse_seance":
      return "analyse";
    case "live":
      return "training";
    default:
      // Sans contexte, le Coach réfléchit. C'est ce qu'il fait quand on
      // l'ouvre sans rien lui demander de précis.
      return "analyse";
  }
}

// ---------------------------------------------------------------------------
// LA PROGRESSION ET LE PROGRAMME
// ---------------------------------------------------------------------------

export interface ContexteProgression {
  /** Un progrès notable établi par le moteur, pas par cet écran. */
  progresConfirme?: boolean;
  /** Aucun repère comparable : la mesure est encore à construire. */
  sansRepere?: boolean;
}

/**
 * Le visage de l'écran de progression.
 *
 * `sansRepere` gagne sur `progresConfirme`, et c'est l'exception qui compte :
 * une première mesure produit mécaniquement un « meilleur résultat », puisqu'il
 * n'y en avait aucun avant. La saluer comme un progrès serait un faux record —
 * exactement ce que la calibration existe pour éviter.
 */
export function resoudreMascotteProgression(
  ctx: ContexteProgression,
): EtatVisuelMascotte {
  if (ctx.sansRepere) return "calibration";
  if (ctx.progresConfirme) return "progres";
  return "analyse";
}

/**
 * Le visage des écrans de programmation.
 *
 * Programme, cycle, matériel, salle, disponibilité : le Coach montre le plan.
 * Un asset distinct par sous-cas n'apporterait rien — c'est la même intention.
 */
export function resoudreMascotteProgramme(): EtatVisuelMascotte {
  return "planification";
}
