import type { IncidentType } from "./types";

export interface ExerciceRestant {
  exercise_instance_id: string;
  nom: string;
  muscles_principaux: string[];
  categorie_role: "pilier" | "substitut" | "accessoire";
  statut: "en_cours" | "à_venir";
}

export interface DouleurResult {
  action: "stop_seance" | "skip_zone" | "alleger";
  message: string;
  exercices_impactes: { exercise_instance_id: string; impact: "skip" | "alleger" }[];
}

export interface EnergieChuteResult {
  suggestion: "stop" | "alleger" | "rien";
  message: string;
  exercices_coupes: string[];
  rpe_reduit_sur: string[];
}

export interface TempsDepasseResult {
  exercices_coupes: string[];
  temps_estime_apres_coupe_min: number;
  message: string;
}

export interface SubstituteInfo {
  exerciseInstanceId: string;
  exerciseName: string;
  machineNom: string | null;
  raisonCompatibilite: string;
}

export type { IncidentType };