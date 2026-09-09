import { configurationDe, type ConfigurationCharge } from "@/lib/engine/charges";

export const VERSION_MODELE_COLD_START = "cold-start-v1.0.0";

export type OriginePremiereCharge =
  | "serie_courante"
  | "historique_instance"
  | "minimum_materiel"
  | "indisponible";

export type ConfiancePremiereCharge = "haute" | "moyenne" | "faible" | "aucune";

export interface EstimationPremiereCharge {
  charge: number | null;
  confiance: ConfiancePremiereCharge;
  origine: OriginePremiereCharge;
  explication: string;
  versionModele: typeof VERSION_MODELE_COLD_START;
}

export interface ProfilColdStart {
  dateNaissance: string | null;
  sexe: string | null;
  tailleCm: number | null;
  poidsKg: number | null;
  poidsMesureLe: string | null;
  poidsAgeJours: number | null;
  niveauExperience: string | null;
  anneesDePratique: number | null;
  moisDInterruption: number | null;
}

export function ageDeLaMesure(date: string | null, aujourdhui = new Date()): number | null {
  if (!date) return null;
  const mesure = new Date(`${date}T00:00:00Z`).getTime();
  if (!Number.isFinite(mesure)) return null;
  return Math.max(0, Math.floor((aujourdhui.getTime() - mesure) / 86_400_000));
}

interface EntreesColdStart {
  chargeCourante?: number | null;
  chargeSuggereeHistorique?: number | null;
  historiqueInstance?: { charge: number }[];
  conventionCharge?: string | null;
  configuration: ConfigurationCharge;
  profil?: ProfilColdStart | null;
}

const resultat = (
  charge: number | null,
  confiance: ConfiancePremiereCharge,
  origine: OriginePremiereCharge,
  explication: string,
): EstimationPremiereCharge => ({
  charge,
  confiance,
  origine,
  explication,
  versionModele: VERSION_MODELE_COLD_START,
});

/**
 * Résout le premier nombre affichable sans fabriquer de force théorique.
 *
 * La fonction encode l'ordre d'autorité disponible aujourd'hui. Les transferts
 * entre appareils et les priors anthropométriques restent volontairement hors
 * de cette version : le projet ne possède ni table d'équivalence documentée,
 * ni coefficient primaire assez général pour convertir un profil en charge
 * sûre sur une machine donnée.
 */
export function estimerPremiereCharge(entrees: EntreesColdStart): EstimationPremiereCharge {
  const {
    chargeCourante,
    chargeSuggereeHistorique,
    historiqueInstance = [],
    conventionCharge,
    configuration,
  } = entrees;

  if (chargeCourante != null && Number.isFinite(chargeCourante)) {
    return resultat(
      chargeCourante,
      "haute",
      "serie_courante",
      "Charge déjà utilisée pendant cette séance.",
    );
  }

  if (historiqueInstance.length > 0) {
    const charge = chargeSuggereeHistorique ?? historiqueInstance[0]!.charge;
    return resultat(
      charge,
      "haute",
      "historique_instance",
      "Calculée à partir de tes séries précédentes sur cette machine.",
    );
  }

  if (conventionCharge === "sans_charge") {
    return resultat(
      null,
      "aucune",
      "indisponible",
      "Cet exercice ne demande pas de charge externe.",
    );
  }

  // Sur une assistance, le minimum est le réglage le plus difficile. Le
  // présenter comme point de départ sûr inverserait le sens du guidage.
  if (configuration.natureCharge === "assistance") {
    return resultat(
      null,
      "aucune",
      "indisponible",
      "Le niveau d’assistance sûr dépend de la machine et doit être essayé sur place.",
    );
  }

  const paliers = (configuration.paliersCharges ?? [])
    .filter((p) => Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);
  const minimum = configuration.chargeMinimale != null && configuration.chargeMinimale > 0
    ? configuration.chargeMinimale
    : paliers[0] ?? null;
  if (minimum != null && Number.isFinite(minimum)) {
    return resultat(
      minimum,
      "faible",
      "minimum_materiel",
      "Premier réglage réellement documenté sur cet appareil. Ajuste-le après ta première série.",
    );
  }

  return resultat(
    null,
    "aucune",
    "indisponible",
    "Pas assez de données fiables pour proposer un nombre sans l’inventer.",
  );
}

export function estimerDepuisInstance(entrees: Omit<EntreesColdStart, "configuration"> & {
  instance: Parameters<typeof configurationDe>[0];
}) {
  return estimerPremiereCharge({ ...entrees, configuration: configurationDe(entrees.instance) });
}
