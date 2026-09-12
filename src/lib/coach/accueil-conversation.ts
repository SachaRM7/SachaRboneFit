import type { Suggestion } from "./contexte-ecran";
export const QUESTIONS_PEDAGOGIQUES: Suggestion[] = [
  { libelle: "C’est quoi une série ?", message: "Explique simplement ce qu’est une série, avec un exemple." },
  { libelle: "Comprendre les répétitions en réserve", message: "RPE 7, ça fait combien de répétitions en réserve ?" },
  { libelle: "Comment choisir mon premier poids ?", message: "Comment trouver mon premier poids sans repère, sans inventer une charge personnelle ?" },
];
export interface AccueilCoach { repere: string | null; suggestions: Suggestion[] }
export function suggestionsVerifiees({ seance, historique, programme, exercice }: {
  seance: boolean; historique: boolean; programme: boolean; exercice: boolean;
}): Suggestion[] {
  const choix: Suggestion[] = [];
  if (exercice) choix.push({ libelle: "Pourquoi cette charge ?", message: "Explique la charge proposée pour cet exercice et cette série à partir du plan et des mesures disponibles." });
  if (seance) choix.push({ libelle: "Explique ma séance", message: "Explique la séance affichée, ou ma prochaine séance s’il n’y en a pas d’ouverte, à partir de mes données." });
  if (historique) choix.push({ libelle: "Comment je progresse ?", message: "Est-ce que je progresse ? Commence par ta conclusion à partir de mes vraies séances, puis les éléments utiles." });
  if (programme && !seance) choix.push({ libelle: "Comprendre mon programme", message: "Explique mon programme actuel et son objectif." });
  return [...choix, ...QUESTIONS_PEDAGOGIQUES].slice(0, 4);
}
