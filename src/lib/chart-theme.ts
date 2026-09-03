/**
 * Thème des graphiques.
 *
 * Les couleurs sont lues depuis les tokens CSS du système Carnet plutôt qu'écrites
 * en dur : les graphiques suivent ainsi le thème clair / sombre comme le reste de
 * l'application. Elles étaient auparavant figées sur une palette sombre.
 *
 * Les huit couleurs de pilier ont disparu : dans Carnet, la couleur signale, elle
 * ne catégorise pas. Une série de graphique se distingue par son libellé et sa
 * position, pas par une teinte arbitraire.
 */

/** Lit un token CSS. Repli utile côté serveur et pendant l'hydratation. */
function token(nom: string, repli: string): string {
  if (typeof window === "undefined") return repli;
  const valeur = getComputedStyle(document.documentElement).getPropertyValue(nom).trim();
  return valeur || repli;
}

export function couleursGraphique() {
  return {
    trace: token("--encre", "#1A1D22"),
    traceDouce: token("--encre-3", "#868C95"),
    gain: token("--gain", "#2C6B47"),
    perte: token("--perte", "#A8402E"),
    feuVert: token("--feu-vert", "#3F7A4A"),
    feuOrange: token("--feu-orange", "#C08418"),
    feuRouge: token("--feu-rouge", "#B23C2C"),
    grille: token("--filet-doux", "#EFECE5"),
    texte: token("--encre-3", "#868C95"),
    texteFort: token("--encre-2", "#4A505A"),
    fondInfobulle: token("--carte", "#FFFFFF"),
    bordInfobulle: token("--filet", "#E4E0D8"),
  };
}

/** Conservé pour les composants qui lisent le thème une seule fois au rendu. */
export const CHART_THEME = {
  backgroundColor: "transparent",
  get textColor() { return couleursGraphique().texte; },
  get textColorLight() { return couleursGraphique().texteFort; },
  get gridColor() { return couleursGraphique().grille; },
  get tooltipBg() { return couleursGraphique().fondInfobulle; },
  get tooltipBorder() { return couleursGraphique().bordInfobulle; },
  fontSize: { xs: 10, sm: 12, base: 14 },
  fontFamily: "system-ui, -apple-system, sans-serif",
} as const;

/**
 * Ordre fixe des séries.
 *
 * C'est la seule place du système où la couleur catégorise au lieu de signaler :
 * un graphique empilé à huit séries a besoin de huit marques distinguables. Les
 * deux palettes (claire et sombre) sont validées — bande de clarté, plancher de
 * chroma, séparation daltonisme sur chaque paire voisine, contraste sur le fond.
 *
 * L'ordre ne se recycle jamais : une neuvième série devient « Autre ».
 */
const ORDRE_SERIES = [
  "P1_poussee", "P2_tirage", "P3_squat", "P4_hanche",
  "epaules", "bras_biceps", "bras_triceps", "jambes_iso",
] as const;

/**
 * Le rang de la série d'un pilier — 1 à 8, et 8 pour tout le reste.
 *
 * Exporté parce que c'est la seule moitié de la couleur qui se vérifie hors
 * navigateur : `token()` lit le CSS calculé, et rend son repli côté serveur.
 * Un test qui comparerait des couleurs les trouverait donc toutes identiques,
 * y compris quand elles diffèrent réellement à l'écran — c'est exactement ce
 * qui s'est produit, et l'assertion ne prouvait rien.
 *
 * Le rang, lui, porte la propriété qui compte : deux piliers distincts ne
 * partagent pas leur place. Le défaut réel était là — des clés passées en
 * minuscules ne correspondaient plus à cette table, tombaient toutes sur le
 * repli, et l'empilement devenait monochrome.
 */
export function slotDeSerie(pilier?: string): number {
  const index = ORDRE_SERIES.indexOf((pilier ?? "") as (typeof ORDRE_SERIES)[number]);
  return index >= 0 ? index + 1 : 8;
}

/** Couleur stable d'une série. Elle suit l'entité, jamais son rang à l'écran. */
export function getPillarColor(pilier?: string): string {
  return token(`--serie-${slotDeSerie(pilier)}`, "#1F6FA8");
}
