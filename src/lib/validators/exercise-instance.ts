import { z } from "zod";
import { ETATS_INSTANCE, NATURES_CHARGE } from "@/lib/engine/charges";

export const LIBELLES_NATURE_CHARGE: Record<(typeof NATURES_CHARGE)[number], string> = {
  resistance: "Résistance — plus lourd, plus dur",
  assistance: "Assistance — l'appareil aide, et progresser c'est en demander moins",
};

export const LIBELLES_ETAT: Record<(typeof ETATS_INSTANCE)[number], string> = {
  disponible: "Disponible",
  temporairement_indisponible: "Hors service pour le moment",
};

export const CONVENTIONS_CHARGE = ["pile_affichee", "disques_ajoutes", "poids_total"] as const;
export const TYPES_POULIE = ["na", "simple", "double", "corde"] as const;

export const LIBELLES_CONVENTION: Record<(typeof CONVENTIONS_CHARGE)[number], string> = {
  pile_affichee: "Pile affichée",
  disques_ajoutes: "Disques ajoutés",
  poids_total: "Poids total",
};

/**
 * Ce qu'il faut saisir, en une phrase, pendant la séance.
 *
 * La convention était stockée et affichée nulle part au moment où elle sert :
 * face à un hack squat, personne ne sait s'il faut noter les disques ou le
 * total. Deux séances saisies différemment produisent alors une courbe qui
 * monte et descend sans qu'on ait changé d'effort.
 *
 * Pour une barre chargée, la convention est le POIDS TOTAL DÉPLACÉ, barre
 * comprise : 20 kg de barre et deux disques de 20 se saisissent 60. La barre
 * appartient à la description de l'appareil — elle sert à résoudre les charges
 * atteignables — et n'a pas à être ressaisie à chaque série.
 */
export const CONSIGNE_DE_SAISIE: Record<(typeof CONVENTIONS_CHARGE)[number], string> = {
  pile_affichee: "Note le nombre lu sur la pile.",
  disques_ajoutes: "Note les disques ajoutés, sans le chariot.",
  poids_total: "Note le poids total déplacé, barre comprise.",
};

/** La même phrase, quand l'appareil aide au lieu de résister. */
export const CONSIGNE_ASSISTANCE = "Note l'assistance affichée — moins, c'est mieux.";

export function consigneDeSaisie(
  conventionCharge: string | null | undefined,
  natureCharge: string | null | undefined,
): string | null {
  if (natureCharge === "assistance") return CONSIGNE_ASSISTANCE;
  const cle = conventionCharge as (typeof CONVENTIONS_CHARGE)[number];
  return CONSIGNE_DE_SAISIE[cle] ?? null;
}

export const LIBELLES_POULIE: Record<(typeof TYPES_POULIE)[number], string> = {
  na: "Sans poulie",
  simple: "Poulie simple",
  double: "Poulie double",
  corde: "Corde",
};

/**
 * Champs modifiables d'un exercice de salle.
 *
 * Le PATCH faisait auparavant `.set({ ...body })` sans validation : n'importe
 * quelle colonne pouvait etre ecrasee depuis le client, `userId` et `gymId`
 * compris. Ce schema fixe la liste exacte de ce qui est acceptable.
 *
 * Le nom sur place est facultatif. « Machine » etait une vulgarisation : une
 * salle contient aussi des barres, des halteres et une barre de traction, qui
 * ne portent aucun nom d'appareil. L'exiger rendait ces exercices impossibles
 * a declarer. Faute de nom, celui de l'exercice fait l'affaire.
 */
export const champsMachineSchema = z.object({
  machineNom: z.string().trim().max(120).optional(),
  typePoulie: z.enum(TYPES_POULIE).default("na"),
  conventionCharge: z.enum(CONVENTIONS_CHARGE),
  /**
   * Sauts mesurés, ou `null` quand on ne les a pas relevés.
   *
   * Le schéma exigeait au moins un incrément : impossible de déclarer une
   * machine sans regarder sa pile, donc on inventait un chiffre plausible. Un
   * appareil peut désormais entrer dans l'inventaire en disant honnêtement ce
   * qu'on ignore de lui — au prix de ne recevoir aucune charge suggérée tant
   * que ce n'est pas relevé.
   */
  incrementsPossibles: z.array(z.number().positive().max(100)).min(1).max(12).nullable().optional(),
  /** Charges réellement atteignables, quand elles forment une collection. */
  paliersCharges: z.array(z.number().min(0).max(1000)).min(1).max(60).nullable().optional(),
  chargeMinimale: z.number().min(0).max(1000).nullable().optional(),
  poidsNonCompte: z.number().min(0).max(500).nullable().optional(),
  chargeMax: z.number().positive().max(1000).nullable().optional(),
  natureCharge: z.enum(NATURES_CHARGE).default("resistance"),
  etat: z.enum(ETATS_INSTANCE).default("disponible"),
  quantite: z.number().int().min(1).max(99).nullable().optional(),
  notesMachine: z.string().trim().max(500).nullable().optional(),
});

/**
 * Des bornes qui se croisent ne décrivent aucun appareil : une pile qui
 * commence à 100 et plafonne à 50 ferait échouer toute résolution de charge,
 * silencieusement.
 */
const bornesCoherentes = (v: {
  chargeMinimale?: number | null;
  chargeMax?: number | null;
}) => v.chargeMinimale == null || v.chargeMax == null || v.chargeMinimale <= v.chargeMax;

const REFUS_BORNES = {
  message: "La charge minimale dépasse la charge maximale",
  path: ["chargeMinimale"],
};

/** Seuls un appareil ou une poulie portent un nom propre sur place. */
export const EQUIPEMENTS_NOMMES = ["machine", "poulie"] as const;

export const creationMachineSchema = champsMachineSchema
  .extend({
    exerciseId: z.string().uuid(),
    gymId: z.string().uuid(),
  })
  .refine(bornesCoherentes, REFUS_BORNES);

export const majMachineSchema = champsMachineSchema
  .partial()
  .refine(bornesCoherentes, REFUS_BORNES);

export type ChampsMachine = z.infer<typeof champsMachineSchema>;
