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

export const CONVENTIONS_CHARGE = [
  "pile_affichee",
  "pile_par_cote",
  "disques_ajoutes",
  "poids_total",
  "poids_par_main",
  "sans_charge",
] as const;
export const TYPES_POULIE = ["na", "simple", "double", "corde"] as const;

export const LIBELLES_CONVENTION: Record<(typeof CONVENTIONS_CHARGE)[number], string> = {
  pile_affichee: "Pile affichée",
  pile_par_cote: "Pile affichée par côté",
  disques_ajoutes: "Disques ajoutés",
  poids_total: "Poids total",
  poids_par_main: "Poids par main",
  sans_charge: "Aucune charge externe",
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
  pile_par_cote: "Note la valeur affichée sur un côté, avec les deux côtés réglés pareil.",
  /*
   * « Note les disques ajoutés, sans le chariot » n'a pas suffi.
   *
   * Devant le hack squat de St-Martin, avec 10 kg d'un côté et 10 kg de
   * l'autre, la phrase ne répond pas à la seule question qui se pose : 10 ou
   * 20 ? Elle dit ce qu'il ne faut PAS compter, jamais comment additionner ce
   * qui reste. Un exemple chiffré le dit en une ligne, et une convention
   * hésitante est pire qu'une convention arbitraire : deux séances saisies
   * autrement font une courbe qui bouge sans effort supplémentaire.
   */
  disques_ajoutes:
    "Charge ajoutée totale, les deux côtés additionnés — 10 kg + 10 kg = 20 kg.",
  poids_total: "Note le poids total déplacé, barre comprise.",
  poids_par_main: "Note le poids d’UN haltère — ne multiplie pas par deux.",
  sans_charge: "Laisse la charge vide : seules les répétitions sont enregistrées.",
};

/**
 * Quand l'appareil aide au lieu de résister.
 *
 * Le sens du nombre s'inverse, et rien ne le disait. Sur le Dip/Chin Assist,
 * 64 kg d'assistance se sont révélés beaucoup trop faciles et ~50 kg
 * nettement plus justes : la valeur qui monte est celle qui allège.
 */
export const CONSIGNE_ASSISTANCE =
  "Assistance : plus la valeur est élevée, plus l’exercice est facile.";

/**
 * La longueur maximale d'une note d'exercice, côté champ ET côté serveur.
 *
 * Elle valait 280 des deux côtés, et c'était trop court : la note du hack
 * squat du 6 septembre en fait 240. On écrivait donc au bord de la limite sans
 * le savoir — le champ cessait d'accepter des caractères, en silence, ce qui
 * se ressent exactement comme « impossible d'enregistrer ».
 *
 * Une seule constante parce que deux limites qui divergent produisent le pire
 * des cas : un texte que l'écran accepte et que le serveur refuse.
 */
export const LIMITE_NOTE_EXERCICE = 500;

/** L'unité affichée à côté du champ de charge. */
export function libelleChampCharge(natureCharge: string | null | undefined): string {
  return natureCharge === "assistance" ? "Assistance (kg)" : "kg";
}

export function consigneDeSaisie(
  conventionCharge: string | null | undefined,
  natureCharge: string | null | undefined,
  /**
   * Ce que l'appareil pèse sans disque — chariot, plateau, contrepoids.
   *
   * Quand la valeur est connue, la nommer coupe court à l'hésitation : on sait
   * qu'elle existe, qu'elle n'est pas à saisir, et qu'elle n'a pas été
   * oubliée.
   */
  poidsNonCompte?: number | null,
): string | null {
  if (natureCharge === "assistance") return CONSIGNE_ASSISTANCE;
  const cle = conventionCharge as (typeof CONVENTIONS_CHARGE)[number];
  const base = CONSIGNE_DE_SAISIE[cle];
  if (!base) return null;
  if (cle === "disques_ajoutes" && poidsNonCompte != null && poidsNonCompte > 0) {
    const valeur = Number.isInteger(poidsNonCompte)
      ? String(poidsNonCompte)
      : String(poidsNonCompte).replace(".", ",");
    return `${base} Le chariot (${valeur} kg) n’est pas compté.`;
  }
  return base;
}

/**
 * Valeur persistée pour le champ SQL non nullable `set_logs.charge`.
 *
 * Une convention sans charge externe se note zéro : zéro kilogramme AJOUTÉ,
 * jamais le poids du corps. L'écran reste vide pour ne pas demander ce zéro à
 * l'utilisateur. Toute autre convention conserve la saisie telle quelle.
 */
export function chargeAEnregistrer(
  saisie: string,
  conventionCharge: string | null | undefined,
): number | null {
  if (conventionCharge === "sans_charge") return 0;
  const valeur = Number.parseFloat(saisie.replace(",", "."));
  return Number.isFinite(valeur) ? valeur : null;
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
