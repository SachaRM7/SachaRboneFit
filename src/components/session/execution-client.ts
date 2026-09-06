/**
 * Ce que le client connaît du contexte d'exécution.
 *
 * Réexporté depuis le moteur plutôt que redéclaré : les règles de validation
 * qui s'affichent sous un champ de saisie doivent être EXACTEMENT celles que le
 * serveur applique, sinon l'écran promet ce que la base refuse. Le serveur
 * revalide de toute façon — il fait autorité —, mais l'utilisateur mérite de
 * savoir avant l'aller-retour.
 */
export {
  messageDeRefus, PHASES_TEMPO, validerReglage,
} from "@/lib/engine/execution";
export type {
  DefinitionReglage, FicheTechnique, ReglageAffiche, TempoResolu, TypeReglage,
} from "@/lib/engine/execution";

/**
 * La déclaration suit la même discipline que la valeur : l'écran refuse
 * exactement ce que le serveur refuse, avec le même message. Sans quoi le
 * formulaire promettrait ce que la base rejette — ou, pire, laisserait partir
 * une requête pour une faute qu'on savait déjà.
 */
export {
  LIBELLES_COURANTS, LIMITE_LIBELLE_REGLAGE, LIMITE_OPTION_REGLAGE, LIMITE_UNITE_REGLAGE,
  MAX_OPTIONS_REGLAGE, MIN_OPTIONS_REGLAGE,
  cleDepuisLibelle, messageDeRefusDeclaration, validerDeclaration,
} from "@/lib/engine/declaration-reglage";
export type { DeclarationBrute, RefusDeclaration } from "@/lib/engine/declaration-reglage";

import type { ContexteExecution } from "@/services/execution";

/** Le contexte tel qu'il traverse le réseau : sérialisable, sans méthode. */
export type ContexteExecutionClient = ContexteExecution;
