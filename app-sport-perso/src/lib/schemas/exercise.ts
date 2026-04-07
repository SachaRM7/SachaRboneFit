import { z } from "zod";

export const PILIERS = ["P1_poussee","P2_tirage","P3_squat","P4_hanche","epaules","bras_biceps","bras_triceps","jambes_iso","core"] as const;
export const PROFILS = ["stretch","contract","mi_range"] as const;
export const ROLES = ["pilier","substitut","accessoire"] as const;
export const TYPES = ["polyarticulaire","isolation"] as const;

export const exerciseSchema = z.object({
  nom: z.string().min(1),
  pilier: z.enum(PILIERS),
  profilTension: z.enum(PROFILS),
  type: z.enum(TYPES),
  categorieRole: z.enum(ROLES),
  musclesPrincipaux: z.array(z.string()).default([]),
});

export const exerciseInstanceSchema = z.object({
  exerciseId: z.string().uuid(),
  gymId: z.string().uuid(),
  machineNom: z.string().min(1),
  typePoulie: z.enum(["simple","double","na"]).default("na"),
  conventionCharge: z.enum(["disques_ajoutes","pile_affichee","poids_total"]),
  incrementsPossibles: z.array(z.number().positive()).min(1),
  poidsNonCompte: z.number().nullable().optional(),
  notesMachine: z.string().optional(),
});
