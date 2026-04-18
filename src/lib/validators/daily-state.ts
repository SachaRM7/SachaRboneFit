import { z } from "zod";

export const dailyStateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sommeilHeures: z.number().min(0).max(12),
  jeuneBool: z.boolean(),
  shiftRecentBool: z.boolean(),
  shiftType: z.enum(["jour", "nuit", "aucun"]),
  energieDepart: z.number().int().min(1).max(10),
  courbatures: z.array(z.object({
    muscle: z.string(),
    intensite: z.number().int().min(1).max(10),
  })),
  dernierRepasHeure: z.string().nullable().optional(),
  horaireSeancePrevu: z.string().nullable().optional(),
});

export type DailyStateInput = z.infer<typeof dailyStateSchema>;
