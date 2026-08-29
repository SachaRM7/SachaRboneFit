import { z } from "zod";
import { MUSCLES } from "@/lib/referentiels/muscles";

/**
 * Ce que l'onboarding demande — et rien de plus.
 *
 * On ne demande jamais les anciennes charges ni les anciens records : cette
 * application est un nouveau départ, et l'expérience technique n'est pas la
 * performance actuelle. Ce qui est demandé est exactement ce que l'application
 * ne peut pas déduire : une intention, une contrainte, une disponibilité.
 */

/**
 * Le vocabulaire des objectifs est défini ici et nulle part ailleurs. Il vivait
 * en trois exemplaires — l'écran de profil, la route de mise à jour et
 * l'onboarding — sur une colonne texte sans contrainte : deux écrans auraient
 * écrit deux valeurs différentes dans le même champ.
 */
export const OBJECTIFS = [
  "perte_de_poids",
  "prise_de_muscle",
  "recomposition",
  "gain_de_force",
  "cardio",
  "reprise",
  "maintien",
] as const;

export type Objectif = (typeof OBJECTIFS)[number];

export const NIVEAUX = ["debutant", "intermediaire", "avance"] as const;

export const PREFERENCES_MATERIEL = ["machines", "poids_libres", "melange", "aucune"] as const;

export const LIBELLES_OBJECTIF: Record<Objectif, string> = {
  perte_de_poids: "Perdre du poids",
  prise_de_muscle: "Prendre du muscle",
  recomposition: "Me recomposer",
  gain_de_force: "Gagner en force",
  cardio: "Améliorer mon cardio",
  reprise: "Reprendre le sport",
  maintien: "Maintenir",
};

export const LIBELLES_NIVEAU: Record<(typeof NIVEAUX)[number], string> = {
  debutant: "Débutant",
  intermediaire: "Intermédiaire",
  avance: "Avancé",
};

export const LIBELLES_MATERIEL: Record<(typeof PREFERENCES_MATERIEL)[number], string> = {
  machines: "Plutôt machines",
  poids_libres: "Plutôt poids libres",
  melange: "Un mélange",
  aucune: "Peu importe",
};

const contrainteSchema = z.object({
  muscle: z.enum(MUSCLES as unknown as [string, ...string[]]),
  severite: z.number().int().min(1).max(10),
  notes: z.string().max(300).optional(),
});

export const onboardingSchema = z
  .object({
    objectifType: z.enum(OBJECTIFS),
    musclesPrioritaires: z.array(z.enum(MUSCLES as unknown as [string, ...string[]])).max(4).default([]),

    niveauExperience: z.enum(NIVEAUX),
    anneesDePratique: z.number().int().min(0).max(60).default(0),
    // Zéro signifie « je m'entraîne actuellement », pas « je débute ».
    moisDInterruption: z.number().int().min(0).max(600).default(0),

    contraintes: z.array(contrainteSchema).max(10).default([]),

    frequenceCibleParSemaine: z.number().int().min(1).max(7),
    frequenceMinParSemaine: z.number().int().min(1).max(7),
    frequenceMaxParSemaine: z.number().int().min(1).max(7),
    dureeSeanceCibleMinutes: z.number().int().min(15).max(180),
    dureeSeanceMaxMinutes: z.number().int().min(15).max(240),

    preferenceMateriel: z.enum(PREFERENCES_MATERIEL).default("aucune"),
    exercicesRefuses: z.array(z.string().max(80)).max(20).default([]),

    /** Salle du jour, existante ou à créer. Le parc peut rester vide. */
    salleId: z.string().uuid().optional(),
    nouvelleSalleNom: z.string().min(2).max(80).optional(),

    taille: z.number().int().min(100).max(250).optional(),
    poids: z.number().min(30).max(300).optional(),
  })
  .refine((d) => d.frequenceMinParSemaine <= d.frequenceCibleParSemaine, {
    message: "Le minimum ne peut pas dépasser l'objectif",
    path: ["frequenceMinParSemaine"],
  })
  .refine((d) => d.frequenceCibleParSemaine <= d.frequenceMaxParSemaine, {
    message: "L'objectif ne peut pas dépasser le maximum",
    path: ["frequenceMaxParSemaine"],
  })
  .refine((d) => d.dureeSeanceCibleMinutes <= d.dureeSeanceMaxMinutes, {
    message: "La durée idéale ne peut pas dépasser le maximum",
    path: ["dureeSeanceMaxMinutes"],
  })
  .refine((d) => Boolean(d.salleId) || Boolean(d.nouvelleSalleNom), {
    message: "Indique une salle",
    path: ["nouvelleSalleNom"],
  });

export type OnboardingInput = z.infer<typeof onboardingSchema>;

/** Au-delà, la programmation part en reprise plutôt qu'en continuité. */
export const MOIS_AVANT_REPRISE = 2;

export function estUneReprise(moisDInterruption: number): boolean {
  return moisDInterruption >= MOIS_AVANT_REPRISE;
}
