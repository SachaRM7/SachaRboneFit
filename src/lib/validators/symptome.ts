import { z } from "zod";
import {
  MOMENTS_SYMPTOME, NOTE_SYMPTOME_MAX, SYMPTOMES_GENERAUX, type SymptomeGeneral,
} from "@/lib/referentiels/symptomes";

/*
 * Le tuple que `z.enum` attend, sans perdre les littéraux.
 *
 * Un `.map()` nu rend `string[]`, et le schéma produirait alors `symptome:
 * string` — donc un type inconnu pourrait traverser la validation jusqu'à la
 * colonne. L'annotation garde l'union du référentiel.
 */
const VALEURS = SYMPTOMES_GENERAUX.map((s) => s.valeur) as [SymptomeGeneral, ...SymptomeGeneral[]];

/**
 * La forme acceptée d'un symptôme, aux DEUX portes d'entrée.
 *
 * L'état du jour (`/api/daily-state`) et l'incident de séance
 * (`/api/incidents`) reçoivent la même chose et doivent la valider pareil. Deux
 * schémas recopiés auraient divergé — la note bornée d'un côté, libre de
 * l'autre, et c'est par la porte la plus permissive que passerait le récit de
 * trois cents mots.
 *
 * Le type vient du référentiel : une valeur inconnue est refusée ici plutôt
 * que stockée pour être découverte plus tard par un écran qui ne sait pas
 * l'afficher.
 */
export const symptomeDeclareSchema = z.object({
  symptome: z.enum(VALEURS),
  intensite: z.number().int().min(1).max(10),
  /*
   * Bornée, et absente plutôt que vide.
   *
   * `transform` ramène une note blanche à `undefined` : une chaîne de deux
   * espaces stockée dans le `jsonb` finirait dans le contexte du modèle comme
   * une note existante mais illisible.
   */
  note: z.string().max(NOTE_SYMPTOME_MAX).optional()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined)),
  moment: z.enum(MOMENTS_SYMPTOME),
});

/**
 * Combien de symptômes on accepte pour une même déclaration.
 *
 * Cinq, ce qui laisse de la marge sur les six types sans qu'un client fautif
 * puisse écrire une liste de mille lignes dans une colonne `jsonb`.
 */
export const MAX_SYMPTOMES = 5;

export const symptomesDeclaresSchema = z.array(symptomeDeclareSchema).max(MAX_SYMPTOMES);
