import { z } from "zod";
import { MATERIEL_PORTABLE } from "@/lib/referentiels/capacites";

export const dailyStateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // La salle du jour conditionne le materiel disponible : elle doit etre persistee,
  // pas seulement transmise en parametre d'URL.
  gymId: z.string().uuid().nullable().optional(),
  sommeilHeures: z.number().min(0).max(12),
  jeuneBool: z.boolean(),
  shiftRecentBool: z.boolean(),
  shiftType: z.enum(["jour", "nuit", "aucun"]),
  energieDepart: z.number().int().min(1).max(10),
  materielApporte: z.array(z.enum(MATERIEL_PORTABLE)).max(MATERIEL_PORTABLE.length).optional(),
  courbatures: z.array(z.object({
    muscle: z.string(),
    intensite: z.number().int().min(1).max(10),
  })),
  dernierRepasHeure: z.string().nullable().optional(),
  horaireSeancePrevu: z.string().nullable().optional(),
});

export type DailyStateInput = z.infer<typeof dailyStateSchema>;
