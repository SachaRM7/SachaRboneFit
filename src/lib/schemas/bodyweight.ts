import { z } from "zod";

export const bodyWeightSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  poids: z.number().positive().max(300),
  notes: z.string().optional(),
});
