import {
  prochaineCharge,
  voisineCharge,
  type ConfigurationCharge,
} from "@/lib/engine/charges";

export interface ConseilPremierEssai {
  etat: "trop_facile" | "adapte" | "trop_difficile";
  message: string;
  chargeSuivante: number | null;
}

/**
 * Le premier nombre connu de l'appareil est un repère matériel, jamais une
 * prescription. Il permet d'expliquer ce que la machine sait produire sans
 * prétendre savoir ce que la personne doit soulever.
 */
export function premierCranConnu(config: ConfigurationCharge): number | null {
  const paliers = (config.paliersCharges ?? [])
    .filter((p) => Number.isFinite(p) && p >= 0)
    .sort((a, b) => a - b);
  return config.chargeMinimale ?? paliers[0] ?? null;
}

/**
 * Retour immédiat après le premier essai.
 *
 * Cette fonction ne prescrit pas une progression et n'enregistre rien. Elle
 * compare la réserve réellement choisie à la cible existante, puis demande au
 * moteur de charges le cran voisin que CET appareil sait produire. Quand les
 * crans sont inconnus, elle reste volontairement qualitative.
 */
export function conseilPremierEssai(entrees: {
  charge: number | null;
  reserve: number | null;
  reserveCible: number | null;
  config: ConfigurationCharge;
}): ConseilPremierEssai | null {
  const { charge, reserve, reserveCible, config } = entrees;
  if (
    charge === null || !Number.isFinite(charge) || charge < 0
    || reserve === null || reserveCible === null
  ) return null;

  if (reserve === reserveCible) {
    return {
      etat: "adapte",
      message: `Adapté : conserve ${charge} kg pour la prochaine série.`,
      chargeSuivante: charge,
    };
  }

  if (reserve > reserveCible) {
    const suivante = prochaineCharge(config, charge);
    const mesure = config.natureCharge === "assistance" ? " kg d’assistance" : " kg";
    return {
      etat: "trop_facile",
      message: suivante.valeur !== null && suivante.valeur !== charge
        ? `Trop facile : essaie ${suivante.valeur}${mesure}, le cran suivant de cette machine.`
        : "Trop facile : choisis le cran suivant plus difficile sur cette machine.",
      chargeSuivante: suivante.valeur !== charge ? suivante.valeur : null,
    };
  }

  // Alléger signifie baisser une résistance, mais augmenter une assistance.
  const sensPlusFacile = config.natureCharge === "assistance" ? "haut" : "bas";
  const suivante = voisineCharge(config, charge, sensPlusFacile);
  const mesure = config.natureCharge === "assistance" ? " kg d’assistance" : " kg";
  return {
    etat: "trop_difficile",
    message: suivante.valeur !== null && suivante.valeur !== charge
      ? `Trop difficile : essaie ${suivante.valeur}${mesure}, le cran plus facile de cette machine.`
      : "Trop difficile : choisis le cran suivant plus facile sur cette machine.",
    chargeSuivante: suivante.valeur !== charge ? suivante.valeur : null,
  };
}
