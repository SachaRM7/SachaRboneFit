import type { ComponentProps } from "react";
import type { ContenuTableauDeBord } from "@/components/dashboard/ContenuTableauDeBord";
import type { EtatDuJour } from "@/lib/engine/etat-du-jour";
import type { ComplementTableauDeBord } from "@/services/tableau-de-bord";

/** Données exclusivement destinées aux tests et au contrôle visuel local. */
export const accueilTest: ComponentProps<typeof ContenuTableauDeBord>["data"] = {
  user: { nom: "Sacha", poidsActuel: 90.5 },
  etat: {
    etat: "calibration", salle: { id: "salle-test", nom: "Saint-Martin-du-Touch" },
    seance: { templateId: "modele-d", lettre: "D", nom: "Calibration D" },
    action: { type: "demarrer_seance", href: "/session/daily-state?date=2026-09-12&gymId=salle-test", templateId: "modele-d" },
    enAttenteDeDonnees: false,
  } as EtatDuJour,
  feuJour: "orange" as "vert" | "orange" | "rouge" | null,
  feuTendance: "vert" as "vert" | "orange" | "rouge" | null,
  poids30jours: [{ date: "2026-09-12", poids: 90.5 }, { date: "2026-09-01", poids: 91 }],
};

export const complementTest: ComplementTableauDeBord = {
  recuperation: {
    phase: "hors_cycle", seuil: 80, neutresMasques: 8,
    muscles: [
      { muscle: "quadriceps", libelle: "Quadriceps", etat: "pret", score: 100, joursDepuis: 3, seriesDerniereExposition: 4, rirMoyen: 3, courbature: 0, severiteContrainte: null, motifs: [] },
      { muscle: "biceps", libelle: "Biceps", etat: "en_cours", score: 60, joursDepuis: 1, seriesDerniereExposition: 3, rirMoyen: 2, courbature: 2, severiteContrainte: null, motifs: ["Sollicités hier"] },
    ],
  },
  blocActif: null,
  alertesPreSeance: [{ type: "fourchette_completee", timing: "pre_seance", exerciseName: "Cable Curl", message: "Cable Curl : +2 kg proposés.", priority: "info" }],
  precalcSession: { contenu: "Préparation de la prochaine séance : technique." },
  weeklyDebrief: null,
  recentSessions: [{ id: "historique-b", date: "2026-09-10", dureeMinutes: 45, energieFin: 7, templateNom: "Calibration B", templateLettre: "B", gymNom: "Salle test" }],
};
