import { z } from "zod";

/**
 * Champs modifiables d'une salle.
 *
 * La mise à jour faisait `.set({ ...body })` : n'importe quelle colonne était
 * modifiable depuis le client, `userId` compris — n'importe qui pouvait donc
 * se réattribuer une salle, et avec elle le droit d'en gérer les exercices.
 * Cette liste fixe ce qui est réellement modifiable.
 */
export const champsSalleSchema = z.object({
  nom: z.string().trim().min(2).max(80),
  horairesOuverture: z.string().trim().max(200).nullable().optional(),
  est24h: z.boolean().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const majSalleSchema = champsSalleSchema.partial();

export type ChampsSalle = z.infer<typeof champsSalleSchema>;
