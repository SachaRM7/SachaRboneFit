import type { NomEtat } from "@/lib/engine/etat-du-jour";
import {
  resoudreMascotteAccueil,
  type ContexteAccueil,
} from "./resoudre-mascotte";
import type { EtatVisuelMascotte } from "./mascotte-assets";

/**
 * DE L'ÉTAT DU JOUR AU VISAGE DU COACH — la traduction, et rien d'autre.
 *
 * POURQUOI CE FICHIER EXISTE
 *
 * `resoudreMascotteAccueil` ne connaît que des faits nommés : « une séance
 * attend », « il y a un bilan à lire ». Il ignore délibérément `NomEtat`, qui
 * appartient au moteur — sans quoi chaque évolution de l'état du jour irait
 * modifier le résolveur d'images, et la moitié du dépôt finirait par dépendre
 * de la mascotte.
 *
 * Ce module fait le pont, et c'est TOUT ce qu'il fait. Il ne lit pas la base,
 * ne compte rien, ne compare rien. Chaque ligne ci-dessous traduit une valeur
 * que le moteur a déjà décidée. Le jour où `NomEtat` gagne un cas, TypeScript
 * casse ici — le `Record` est exhaustif — plutôt que de laisser l'accueil
 * choisir silencieusement une image par défaut.
 *
 * L'import du moteur est un import de TYPE : aucun code moteur n'entre dans le
 * paquet du Coach.
 */

/** Ce que chaque état du jour dit au Coach. Exhaustif par construction. */
const FAIT_DE_L_ETAT: Record<NomEtat, keyof ContexteAccueil> = {
  // L'application ne peut rien préparer tant que le lieu n'est pas décidé ou
  // décrit : ce sont des questions d'organisation, pas d'entraînement.
  sans_salle: "organisationRequise",
  salle_vide: "organisationRequise",
  // Les premiers repères sont à construire — la carte le dit déjà en toutes
  // lettres : « On mesure tes premières charges. »
  calibration: "calibration",
  prete: "seancePrete",
  // La journée d'entraînement est derrière : ce qui reste à faire est la lire.
  deja_entraine: "bilanDisponible",
  semaine_complete: "bilanDisponible",
};

export interface EntreeAccueilMascotte {
  etat: NomEtat;
  /**
   * Le feu du jour, tel que `computeFeuJour` l'a rendu.
   *
   * Seul le rouge compte ici, et son sens est celui que l'écran affiche déjà
   * à côté : « Récupérer ». L'orange dit « à adapter » — l'entraînement a lieu,
   * il est simplement ajusté — et transformer cette nuance en mascotte
   * d'alerte ferait passer pour un avertissement ce qui est une adaptation
   * normale.
   */
  feuJour: "vert" | "orange" | "rouge" | null;
}

/**
 * Le visage du Coach à l'accueil, ou `null` s'il n'a rien à dire.
 *
 * Déterministe et sans effet de bord : mêmes entrées, même image. Aucun tirage,
 * aucune date, aucun appel réseau.
 */
export function mascotteDeLAccueil(
  e: EntreeAccueilMascotte,
): EtatVisuelMascotte | null {
  return resoudreMascotteAccueil({
    // Le seul signal qui passe devant l'état du jour : un jour où le corps
    // demande à récupérer n'est pas un jour où le Coach dit « on y va ».
    recuperationRequise: e.feuJour === "rouge",
    [FAIT_DE_L_ETAT[e.etat]]: true,
  });
}
