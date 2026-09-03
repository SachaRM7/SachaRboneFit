import { musclesDeLaZone, versMuscle, LIBELLES } from "@/lib/referentiels/muscles";
import type { ExerciceRestant } from "./types";

/**
 * Une gêne déclarée en pleine séance.
 *
 * L'ancienne version faisait exactement ce qu'il ne faut pas faire : à partir
 * de 4/10, elle retirait TOUS les exercices touchant la zone, sans distinguer
 * ce qui la travaille de ce qui la traverse. Une gêne au poignet supprimait
 * ainsi tous les tirages — alors que le poignet n'est pas ce qu'on entraîne
 * dans un tirage, il est un maillon de la chaîne. Le résultat était affiché
 * comme une décision prise, pas comme une proposition.
 *
 * Ce module ne retire plus rien. Il fait trois choses, et s'arrête là :
 *
 *   1. il croise la ou les zones déclarées avec les muscles de chaque exercice
 *      qui reste, en distinguant CIBLE et SECONDAIRE ;
 *   2. il gradue ce qu'il propose selon l'intensité et le type de douleur ;
 *   3. il dit POURQUOI, exercice par exercice.
 *
 * L'athlète décide. C'est la seule position tenable : l'application ne sait ni
 * ce qui fait mal exactement, ni depuis quand, ni ce qu'en dirait un médecin.
 * Une douleur aiguë ou qui irradie reste le seul cas où elle insiste — et même
 * là, elle propose, elle n'exécute pas.
 */

export type TypeDouleur = "sourde" | "aiguë" | "irradiation" | "raideur";

/** Comment un exercice touche la zone gênée. */
export type ImplicationZone =
  /** La zone est ce que l'exercice travaille. */
  | "cible"
  /** La zone participe sans être visée. */
  | "secondaire"
  /** Rien ne relie cet exercice à la zone. */
  | "non_concerne";

/** Ce qui est proposé pour un exercice, et jamais appliqué d'office. */
export type PropositionExercice = "retirer" | "alleger" | "poursuivre";

export interface ExerciceEvalue {
  exercise_instance_id: string;
  nom: string;
  implication: ImplicationZone;
  proposition: PropositionExercice;
  /** La phrase qui justifie, en citant la zone et le rôle du muscle. */
  pourquoi: string;
}

export interface EvaluationDouleur {
  /** Vrai seulement quand la nature de la douleur appelle à ne pas insister. */
  arretConseille: boolean;
  message: string;
  exercices: ExerciceEvalue[];
}

export interface ExerciceAvecMuscles extends ExerciceRestant {
  /** Muscles sollicités sans être visés. Absent = inconnu, pas « aucun ». */
  muscles_secondaires?: string[];
}

/**
 * Une douleur qui appelle à ne pas insister.
 *
 * Aiguë ou irradiante : ce ne sont pas des intensités mais des NATURES, et
 * aucune des deux ne s'accommode d'un allègement. Au-delà de 7/10, l'intensité
 * suffit. Ces trois cas viennent du corpus, pas d'un seuil choisi ici.
 */
export const INTENSITE_ARRET = 7;

function implicationDe(
  exercice: ExerciceAvecMuscles,
  musclesGenes: string[],
): ImplicationZone {
  const touche = (liste: string[] | undefined) =>
    (liste ?? []).some((m) => {
      const muscle = versMuscle(m);
      return muscle !== null && musclesGenes.includes(muscle);
    });

  if (touche(exercice.muscles_principaux)) return "cible";
  if (touche(exercice.muscles_secondaires)) return "secondaire";
  return "non_concerne";
}

/**
 * Ce qu'on propose, selon l'implication et l'intensité.
 *
 * La graduation est le cœur du sujet. Un exercice qui VISE la zone gênée n'a
 * pas le même statut qu'un exercice qui la sollicite en passant : le premier
 * se retire quand ça fait vraiment mal, le second s'allège. Et rien de tout
 * cela ne concerne un exercice qui n'a aucun lien avec la zone — c'était le
 * défaut d'origine.
 */
function propositionPour(implication: ImplicationZone, niveau: number): PropositionExercice {
  if (implication === "non_concerne") return "poursuivre";
  if (implication === "cible") return niveau >= 4 ? "retirer" : "alleger";
  // Secondaire : la zone participe, elle n'est pas ce qu'on entraîne.
  return niveau >= INTENSITE_ARRET ? "retirer" : niveau >= 4 ? "alleger" : "poursuivre";
}

function phrasePour(
  implication: ImplicationZone,
  proposition: PropositionExercice,
  zones: string[],
): string {
  const zone = zones.join(" et ");
  switch (implication) {
    case "cible":
      return proposition === "retirer"
        ? `Cet exercice travaille directement ${zone}.`
        : `Cet exercice travaille ${zone} : moins de charge, plus de réserve.`;
    case "secondaire":
      return proposition === "poursuivre"
        ? `${zone} participe sans être visée : à surveiller pendant la série.`
        : `${zone} participe sans être visée — un cran plus léger devrait suffire.`;
    case "non_concerne":
      return `Rien ne relie cet exercice à ${zone}.`;
  }
}

export function evaluerDouleur(
  zones: string[],
  niveau: number,
  type_douleur: TypeDouleur,
  exercices_restants: ExerciceAvecMuscles[],
): EvaluationDouleur {
  const musclesGenes = [...new Set(zones.flatMap((z) => musclesDeLaZone(z)))];
  const libelles = zones.length > 0 ? zones : ["cette zone"];

  const exercices: ExerciceEvalue[] = exercices_restants.map((ex) => {
    const implication = implicationDe(ex, musclesGenes);
    const proposition = propositionPour(implication, niveau);
    return {
      exercise_instance_id: ex.exercise_instance_id,
      nom: ex.nom,
      implication,
      proposition,
      pourquoi: phrasePour(implication, proposition, libelles),
    };
  });

  const natureInquietante = type_douleur === "aiguë" || type_douleur === "irradiation";
  if (natureInquietante || niveau >= INTENSITE_ARRET) {
    return {
      arretConseille: true,
      message: natureInquietante
        ? "Une douleur aiguë ou qui irradie ne s'accommode pas d'un allègement. "
          + "Mieux vaut arrêter là, et consulter si elle revient."
        : "À cette intensité, continuer risque d'aggraver. Arrêter est le choix prudent.",
      // Même ici, la liste reste une proposition : c'est toi qui décides.
      exercices,
    };
  }

  const concernes = exercices.filter((e) => e.implication !== "non_concerne");
  if (concernes.length === 0) {
    return {
      arretConseille: false,
      message: `Aucun des exercices qui restent ne sollicite ${libelles.join(" et ")}. `
        + "Tu peux continuer en restant attentif.",
      exercices,
    };
  }

  const aRetirer = concernes.filter((e) => e.proposition === "retirer").length;
  const aAlleger = concernes.filter((e) => e.proposition === "alleger").length;

  return {
    arretConseille: false,
    message: [
      aRetirer > 0 ? `${aRetirer} exercice${aRetirer > 1 ? "s" : ""} à retirer` : null,
      aAlleger > 0 ? `${aAlleger} à alléger` : null,
    ].filter(Boolean).join(", ") + ". Rien n'est appliqué tant que tu ne l'as pas choisi.",
    exercices,
  };
}

/** Les muscles d'une zone, en toutes lettres — pour expliquer sans jargon. */
export function musclesLisiblesDeLaZone(zone: string): string {
  return musclesDeLaZone(zone).map((m) => LIBELLES[m]).join(", ");
}
