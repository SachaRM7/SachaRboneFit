import { z } from "zod";

export const CONVENTIONS_CHARGE = ["pile_affichee", "disques_ajoutes", "poids_total"] as const;
export const TYPES_POULIE = ["na", "simple", "double", "corde"] as const;

export const LIBELLES_CONVENTION: Record<(typeof CONVENTIONS_CHARGE)[number], string> = {
  pile_affichee: "Pile affichée",
  disques_ajoutes: "Disques ajoutés",
  poids_total: "Poids total",
};

export const LIBELLES_POULIE: Record<(typeof TYPES_POULIE)[number], string> = {
  na: "Sans poulie",
  simple: "Poulie simple",
  double: "Poulie double",
  corde: "Corde",
};

/**
 * Champs modifiables d'une machine.
 *
 * Le PATCH faisait auparavant `.set({ ...body })` sans validation : n'importe
 * quelle colonne pouvait etre ecrasee depuis le client, `userId` et `gymId`
 * compris. Ce schema fixe la liste exacte de ce qui est acceptable.
 */
export const champsMachineSchema = z.object({
  machineNom: z.string().trim().min(1).max(120),
  typePoulie: z.enum(TYPES_POULIE).default("na"),
  conventionCharge: z.enum(CONVENTIONS_CHARGE),
  incrementsPossibles: z.array(z.number().positive().max(100)).min(1).max(12),
  poidsNonCompte: z.number().min(0).max(500).nullable().optional(),
  chargeMax: z.number().positive().max(1000).nullable().optional(),
  notesMachine: z.string().trim().max(500).nullable().optional(),
});

export const creationMachineSchema = champsMachineSchema.extend({
  exerciseId: z.string().uuid(),
  gymId: z.string().uuid(),
});

export const majMachineSchema = champsMachineSchema.partial();

export type ChampsMachine = z.infer<typeof champsMachineSchema>;
