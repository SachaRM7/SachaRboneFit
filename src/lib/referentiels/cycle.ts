/**
 * Le vocabulaire des cycles, côté utilisateur.
 *
 * `programme_blocs.type_cycle` est une colonne texte sans contrainte. Trois
 * sources y écrivent : l'onboarding (« calibration »), le formulaire de
 * création (« mecanique », « metabolique », « force », « deload ») et l'API,
 * qui accepte n'importe quelle chaîne de 1 à 60 caractères. Il n'existe donc
 * pas d'énumération à laquelle se fier.
 *
 * Deux conséquences, tenues ici :
 *
 * — l'ancienne opposition « mécanique / métabolique » est abandonnée pour les
 *   NOUVEAUX cycles, au profit des dominantes réellement décidées : charge,
 *   volume, densité, proximité de l'échec. Les anciennes valeurs restent
 *   lisibles et ne sont pas réécrites en base : un cycle enregistré comme
 *   « mecanique » garde sa valeur et s'affiche sous un libellé compatible.
 * — aucune valeur brute n'atteint l'écran. Une valeur inconnue est humanisée
 *   plutôt que montrée telle quelle, et signalée comme héritée.
 */

/** Dominantes proposées aux nouveaux cycles. */
export const DOMINANTES = ["charge", "volume", "densite", "proximite_echec"] as const;
export type Dominante = (typeof DOMINANTES)[number];

/** Natures de cycle qui ne sont pas des dominantes mais des états du parcours. */
export const NATURES_CYCLE = ["calibration", "deload"] as const;

export const LIBELLES_DOMINANTE: Record<Dominante, string> = {
  charge: "Dominante charge",
  volume: "Dominante volume",
  densite: "Dominante densité",
  proximite_echec: "Dominante proximité de l'échec",
};

/** Ce que la dominante cherche, en une phrase, au présent. */
export const INTENTIONS_DOMINANTE: Record<Dominante, string> = {
  charge: "On cherche à soulever plus lourd, sur moins de répétitions.",
  volume: "On accumule du travail : plus de séries, à charge modérée.",
  densite: "On fait le même travail en moins de temps, avec des repos plus courts.",
  proximite_echec: "On va plus près de l'échec, sans forcément charger plus.",
};

export interface LibelleCycle {
  /** Ce qui s'affiche. Jamais une valeur brute. */
  libelle: string;
  /** Ce que cherche le cycle, quand on peut le dire. */
  intention: string | null;
  /** Vrai pour une valeur d'un vocabulaire abandonné, conservée telle quelle. */
  herite: boolean;
}

/**
 * Humanise une valeur inconnue plutôt que de l'afficher brute.
 * « bloc_force_ete » devient « Bloc force ete » — imparfait, mais lisible,
 * et ce sont des mots que l'utilisateur a lui-même choisis.
 */
function humaniser(valeur: string): string {
  const propre = valeur.replace(/[_-]+/g, " ").trim();
  return propre.charAt(0).toUpperCase() + propre.slice(1);
}

/**
 * Le libellé d'un type de cycle, quelle que soit son origine.
 *
 * Les anciennes valeurs sont traduites sans être réécrites : « mecanique »
 * décrivait un travail à dominante de charge, « metabolique » un travail à
 * dominante de volume. La correspondance est approximative et assumée comme
 * telle — d'où le marqueur `herite`, qui permet à l'écran de ne pas présenter
 * une interprétation rétrospective comme une certitude.
 */
export function libelleCycle(typeCycle: string | null | undefined): LibelleCycle {
  const t = (typeCycle ?? "").toLowerCase().trim();

  if (t === "") return { libelle: "Cycle en cours", intention: null, herite: false };

  if (t === "calibration") {
    return {
      libelle: "Reprise & calibration",
      intention:
        "J'apprends tes charges de travail, ta récupération et ta tolérance avant de construire ton premier cycle.",
      herite: false,
    };
  }

  if (t.includes("deload") || t.includes("decharge")) {
    return {
      libelle: "Décharge",
      intention: "On réduit volontairement la charge pour laisser la fatigue redescendre.",
      herite: false,
    };
  }

  if ((DOMINANTES as readonly string[]).includes(t)) {
    const d = t as Dominante;
    return { libelle: LIBELLES_DOMINANTE[d], intention: INTENTIONS_DOMINANTE[d], herite: false };
  }

  // Vocabulaire abandonné. On traduit pour rester lisible, on marque pour
  // rester honnête : ces cycles n'ont pas été créés avec le modèle actuel.
  if (t === "mecanique" || t.includes("force")) {
    return { libelle: "Dominante charge", intention: INTENTIONS_DOMINANTE.charge, herite: true };
  }
  if (t === "metabolique" || t.includes("hypertroph")) {
    return { libelle: "Dominante volume", intention: INTENTIONS_DOMINANTE.volume, herite: true };
  }

  return { libelle: humaniser(t), intention: null, herite: true };
}

/**
 * Formulation utilisateur de la phase mesurée par le moteur.
 *
 * `PhaseCycle` et `StatutFatigue` sont des identifiants internes. Ils
 * n'atteignent jamais l'écran : ce qui s'affiche décrit ce qui se passe, et le
 * détail technique reste derrière « Voir pourquoi ».
 */
export const LIBELLES_PHASE: Record<string, string> = {
  accumulation: "Phase de progression",
  surcharge: "Phase de surcharge",
  decharge: "Phase de décharge",
  hors_cycle: "Hors cycle structuré",
};

export const LIBELLES_FATIGUE: Record<string, string> = {
  basse: "Fatigue basse",
  attendue: "Fatigue normale",
  elevee_attendue: "Fatigue élevée, et c'est prévu",
  elevee_anormale: "Fatigue élevée, hors de ce qui était prévu",
};

export const LIBELLES_TENDANCE: Record<string, string> = {
  hausse: "Tes performances montent",
  stable: "Tes performances tiennent",
  baisse: "Tes performances reculent",
};
