import { z } from "zod";
import { MATERIEL_PORTABLE } from "@/lib/referentiels/capacites";
import { symptomesDeclaresSchema } from "./symptome";

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
  /*
   * Facultatif, et il doit le rester.
   *
   * Le rendre obligatoire casserait tous les appelants existants et, surtout,
   * transformerait l'état du jour en questionnaire : on déclare son sommeil et
   * son énergie en trois gestes, et c'est ce qui fait qu'on le déclare.
   * Absent et vide veulent tous deux dire « rien à signaler ».
   */
  symptomesGeneraux: symptomesDeclaresSchema.optional(),
  dernierRepasHeure: z.string().nullable().optional(),
  horaireSeancePrevu: z.string().nullable().optional(),
});

export type DailyStateInput = z.infer<typeof dailyStateSchema>;
