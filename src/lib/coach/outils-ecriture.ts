import {
  lireSeanceProgrammee, preparerProposition, PropositionRefusee,
} from "@/services/propositions-coach";
import { BORNES, apercuEnTexte, prescription, type Operation } from "./propositions";
import type { CoachTool, ToolExecutor, ToolExecutionResult } from "./tools";

/**
 * Les outils par lesquels le coach peut modifier le programme.
 *
 * Ils ne modifient rien. Chacun décrit une opération, et le serveur en calcule
 * l'effet pour le soumettre à l'athlète : ce que l'outil renvoie au modèle,
 * c'est un aperçu et un identifiant de proposition, jamais un « c'est fait ».
 *
 * Le partage des rôles est le même que pour `validate_session`, poussé d'un
 * cran : le modèle sait quoi proposer et pourquoi, le code sait ce que ça
 * donnerait et si c'est acceptable, l'athlète décide. Aucun des trois ne peut
 * se passer des deux autres.
 *
 * Il n'y a pas d'outil qui prendrait le programme entier en JSON. Un tel outil
 * n'aurait pas de bornes lisibles : sa validation devrait couvrir tout ce que
 * le modèle peut écrire. Ici chaque opération porte les siennes, et ce qui
 * n'est pas listé est impossible plutôt que refusé.
 */

function echec(raison: string): ToolExecutionResult {
  return { success: false, output: raison };
}

/**
 * Le gabarit visé.
 *
 * Il vient du contexte d'écran quand l'athlète en regarde un, sinon le modèle
 * le nomme — mais dans les deux cas, la propriété est vérifiée en base par le
 * service. Aucun identifiant d'utilisateur ne traverse jamais le modèle : il
 * vient de la session authentifiée, et de là seulement.
 */
const DEPUIS_L_ECRAN =
  "Omets cet identifiant pour désigner la séance actuellement affichée.";

async function proposer(
  operation: Operation,
  userId: string,
  seanceTemplateId: string | null | undefined,
): Promise<ToolExecutionResult> {
  if (!seanceTemplateId) {
    return echec(
      "Aucune séance désignée. Appelle get_current_session pour savoir laquelle est concernée, " +
        "ou demande à l'athlète de quelle séance il parle.",
    );
  }

  try {
    const proposition = await preparerProposition({ userId, seanceTemplateId, operation });
    return {
      success: true,
      output: JSON.stringify({
        propositionId: proposition.id,
        seance: proposition.nomSeance,
        apercu: apercuEnTexte(proposition.apercu),
        etat: "en_attente_de_confirmation",
        // Le modèle doit savoir qu'il n'a rien changé, sans quoi il l'annoncera
        // comme fait — et l'athlète découvrira l'écart à la séance suivante.
        consigne:
          "Rien n'est modifié. L'athlète voit cet aperçu et décide. Présente le changement " +
          "et sa raison en une ou deux phrases, sans annoncer qu'il est appliqué, et sans " +
          "répéter le détail chiffré : il est déjà affiché.",
      }),
    };
  } catch (erreur) {
    if (erreur instanceof PropositionRefusee) return echec(erreur.raison);
    throw erreur;
  }
}

function nombre(valeur: unknown): number | undefined {
  const n = Number(valeur);
  return Number.isFinite(n) ? n : undefined;
}

function texte(valeur: unknown): string | null {
  return typeof valeur === "string" && valeur.trim() ? valeur.trim() : null;
}

export const DEFINITIONS_ECRITURE: CoachTool[] = [
  {
    name: "get_session_exercises",
    description:
      "Contenu d'une séance programmée : chaque exercice, sa prescription, et l'identifiant de " +
      "ligne à utiliser pour proposer une modification. À appeler avant toute proposition. " +
      DEPUIS_L_ECRAN,
    input_schema: {
      type: "object",
      properties: { seanceTemplateId: { type: "string", description: DEPUIS_L_ECRAN } },
    },
  },
  {
    name: "propose_exercise_swap",
    description:
      "Propose de remplacer un exercice d'une séance programmée par un autre. Ne modifie rien : " +
      "l'athlète voit l'avant/après et confirme. Le remplaçant doit venir de get_gym_equipment. " +
      DEPUIS_L_ECRAN,
    input_schema: {
      type: "object",
      properties: {
        ligneId: {
          type: "string",
          description: "Identifiant de la ligne à remplacer, issu de get_session_exercises",
        },
        versExerciseInstanceId: {
          type: "string",
          description: "Identifiant de la machine qui prend sa place, issu de get_gym_equipment",
        },
        seanceTemplateId: { type: "string", description: DEPUIS_L_ECRAN },
      },
      required: ["ligneId", "versExerciseInstanceId"],
    },
  },
  {
    name: "propose_volume_adjustment",
    description:
      "Propose d'ajuster les séries ou la fourchette de répétitions d'un exercice programmé. " +
      "Ne modifie rien : l'athlète voit l'avant/après et confirme. Ne renseigne que ce qui change. " +
      DEPUIS_L_ECRAN,
    input_schema: {
      type: "object",
      properties: {
        ligneId: {
          type: "string",
          description: "Identifiant de la ligne concernée, issu de get_session_exercises",
        },
        seriesCibles: {
          type: "number",
          description: `Nombre de séries, entre ${BORNES.seriesMin} et ${BORNES.seriesMax}`,
        },
        repsMin: { type: "number", description: "Bas de la fourchette de répétitions" },
        repsMax: { type: "number", description: "Haut de la fourchette de répétitions" },
        seanceTemplateId: { type: "string", description: DEPUIS_L_ECRAN },
      },
      required: ["ligneId"],
    },
  },
  {
    name: "propose_exercise_removal",
    description:
      "Propose de retirer un exercice d'une séance programmée. Ne modifie rien : l'athlète voit " +
      "l'avant/après et confirme. L'exercice cesse d'être programmé ; les séances déjà faites " +
      "gardent leur contenu. " + DEPUIS_L_ECRAN,
    input_schema: {
      type: "object",
      properties: {
        ligneId: {
          type: "string",
          description: "Identifiant de la ligne à retirer, issu de get_session_exercises",
        },
        seanceTemplateId: { type: "string", description: DEPUIS_L_ECRAN },
      },
      required: ["ligneId"],
    },
  },
  {
    name: "propose_exercise_addition",
    description:
      "Propose d'ajouter un exercice à une séance programmée. Ne modifie rien : l'athlète voit " +
      "l'avant/après et confirme. L'exercice doit venir de get_gym_equipment. " +
      DEPUIS_L_ECRAN,
    input_schema: {
      type: "object",
      properties: {
        exerciseInstanceId: {
          type: "string",
          description: "Identifiant de la machine, issu de get_gym_equipment",
        },
        seriesCibles: { type: "number" },
        repsMin: { type: "number" },
        repsMax: { type: "number" },
        seanceTemplateId: { type: "string", description: DEPUIS_L_ECRAN },
      },
      required: ["exerciseInstanceId", "seriesCibles", "repsMin", "repsMax"],
    },
  },
];

export const EXECUTEURS_ECRITURE: Record<string, ToolExecutor> = {
  get_session_exercises: async (params, userId, contexte) => {
    const id = texte(params.seanceTemplateId) ?? contexte?.seanceTemplateId;
    if (!id) return echec("Aucune séance désignée.");
    const seance = await lireSeanceProgrammee(userId, id);
    if (!seance) return echec("Séance introuvable.");
    return {
      success: true,
      output: JSON.stringify({
        seance: seance.nomSeance,
        seanceTemplateId: seance.seanceTemplateId,
        exercices: seance.lignes.map((l) => ({
          ligneId: l.id,
          ordre: l.ordre,
          exercice: l.nom,
          exerciseInstanceId: l.exerciseInstanceId,
          prescription: prescription(l),
        })),
      }),
    };
  },

  propose_exercise_swap: async (params, userId, contexte) => {
    const ligneId = texte(params.ligneId);
    const vers = texte(params.versExerciseInstanceId);
    if (!ligneId || !vers) return echec("ligneId et versExerciseInstanceId sont requis.");
    return proposer(
      { type: "remplacer_exercice", ligneId, versInstanceId: vers },
      userId,
      texte(params.seanceTemplateId) ?? contexte?.seanceTemplateId,
    );
  },

  propose_volume_adjustment: async (params, userId, contexte) => {
    const ligneId = texte(params.ligneId);
    if (!ligneId) return echec("ligneId est requis.");
    const seriesCibles = nombre(params.seriesCibles);
    const repsMin = nombre(params.repsMin);
    const repsMax = nombre(params.repsMax);
    if (seriesCibles === undefined && repsMin === undefined && repsMax === undefined) {
      return echec("Indique au moins une valeur à changer : seriesCibles, repsMin ou repsMax.");
    }
    return proposer(
      { type: "ajuster_volume", ligneId, seriesCibles, repsMin, repsMax },
      userId,
      texte(params.seanceTemplateId) ?? contexte?.seanceTemplateId,
    );
  },

  propose_exercise_removal: async (params, userId, contexte) => {
    const ligneId = texte(params.ligneId);
    if (!ligneId) return echec("ligneId est requis.");
    return proposer(
      { type: "retirer_exercice", ligneId },
      userId,
      texte(params.seanceTemplateId) ?? contexte?.seanceTemplateId,
    );
  },

  propose_exercise_addition: async (params, userId, contexte) => {
    const instance = texte(params.exerciseInstanceId);
    const seriesCibles = nombre(params.seriesCibles);
    const repsMin = nombre(params.repsMin);
    const repsMax = nombre(params.repsMax);
    if (!instance || seriesCibles === undefined || repsMin === undefined || repsMax === undefined) {
      return echec("exerciseInstanceId, seriesCibles, repsMin et repsMax sont requis.");
    }
    return proposer(
      { type: "ajouter_exercice", exerciseInstanceId: instance, seriesCibles, repsMin, repsMax },
      userId,
      texte(params.seanceTemplateId) ?? contexte?.seanceTemplateId,
    );
  },
};
