import { z } from "zod";
import { TYPES_REGLAGE } from "@/lib/engine/execution";

/**
 * Le schéma de bordure pour la déclaration d'un réglage.
 *
 * Il ne redit PAS les règles métier — `validerDeclaration` en est la seule
 * autorité, et la dupliquer ici garantirait de les voir diverger. Il ne fait
 * que borner ce qui entre : des longueurs, un type connu, un tableau qui ne
 * gonfle pas. Le service refuse ensuite ce qui n'a pas de sens, avec un message
 * destiné à la personne.
 *
 * Ce fichier existe pour que la route ne dépende pas directement du moteur
 * pour une simple énumération, et pour que les limites soient importables des
 * deux côtés du réseau — l'écran affiche les mêmes.
 */

export {
  LIMITE_LIBELLE_REGLAGE, LIMITE_OPTION_REGLAGE, LIMITE_UNITE_REGLAGE,
  MAX_OPTIONS_REGLAGE, MIN_OPTIONS_REGLAGE,
} from "@/lib/engine/declaration-reglage";

/** `z.enum` demande un tuple non vide : `TYPES_REGLAGE` en est un. */
export const TYPES_REGLAGE_SCHEMA = z.enum(TYPES_REGLAGE);

/** Ce qu'on montre en face de chaque type, au moment de choisir. */
export const LIBELLES_TYPE_REGLAGE: Record<(typeof TYPES_REGLAGE)[number], string> = {
  cran: "Cran numéroté",
  degres: "Angle en degrés",
  choix: "Liste de positions",
  texte: "Texte libre",
};

/**
 * Une phrase par type, au moment où l'on choisit — pas une définition.
 *
 * « Liste de positions » ne dit pas quand la préférer à « Texte libre ». Ces
 * exemples, eux, viennent tous d'appareils réels et disent la différence en
 * une lecture.
 */
export const EXEMPLES_TYPE_REGLAGE: Record<(typeof TYPES_REGLAGE)[number], string> = {
  cran: "Siège 5, dossier 2 — un numéro lu sur l'appareil.",
  degres: "Banc à 30° — un angle gradué.",
  choix: "Poignée verticale ou neutre — quelques positions nommées.",
  texte: "Placement, distance — ce qui ne se numérote pas.",
};
