import { z } from "zod";

export const gymSchema = z.object({
  nom: z.string().min(1, "Nom requis"),
  horairesOuverture: z.string().optional(),
  est24h: z.boolean().default(false),
  notes: z.string().optional(),
});
export type GymInput = z.input<typeof gymSchema>;
