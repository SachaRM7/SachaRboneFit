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
  DefinitionReglage, FicheTechnique, ReglageAffiche, TempoResolu,
} from "@/lib/engine/execution";

import type { ContexteExecution } from "@/services/execution";

/** Le contexte tel qu'il traverse le réseau : sérialisable, sans méthode. */
export type ContexteExecutionClient = ContexteExecution;
